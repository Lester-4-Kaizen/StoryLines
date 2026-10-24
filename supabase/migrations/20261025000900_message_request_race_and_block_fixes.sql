with ranked_pending_requests as (
  select
    requests.id,
    row_number() over (
      partition by least(requests.sender_id, requests.recipient_id),
        greatest(requests.sender_id, requests.recipient_id)
      order by requests.created_at, requests.id
    ) as pair_rank
  from public.community_message_requests as requests
  where requests.status = 'pending'
)
update public.community_message_requests as requests
set status = 'declined', updated_at = pg_catalog.now()
from ranked_pending_requests
where requests.id = ranked_pending_requests.id
  and ranked_pending_requests.pair_rank > 1;

create unique index if not exists community_message_requests_pending_conversation_idx
  on public.community_message_requests (
    (least(sender_id, recipient_id)),
    (greatest(sender_id, recipient_id))
  )
  where status = 'pending';

create or replace function public.submit_community_message_request(
  p_recipient_id uuid,
  p_content text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sender_id uuid := (select auth.uid());
  v_request_id uuid;
begin
  if v_sender_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  if p_recipient_id is null or p_recipient_id = v_sender_id then
    raise exception using errcode = '22023', message = 'A different recipient is required.';
  end if;

  if p_content is null or char_length(btrim(p_content)) not between 1 and 2000 then
    raise exception using errcode = '22023', message = 'Message requests must contain 1 to 2,000 characters.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      least(v_sender_id::text, p_recipient_id::text)
        || ':'
        || greatest(v_sender_id::text, p_recipient_id::text),
      0
    )
  );

  if exists (
    select 1
    from public.community_message_account_controls as controls
    where controls.status = 'blocked'
      and (
        (controls.owner_id = v_sender_id and controls.account_id = p_recipient_id)
        or (controls.owner_id = p_recipient_id and controls.account_id = v_sender_id)
      )
  ) then
    raise exception using errcode = '42501', message = 'This account cannot receive your message request.';
  end if;

  if public.can_send_community_direct_message(v_sender_id, p_recipient_id) then
    raise exception using errcode = '22023', message = 'This recipient accepts direct messages.';
  end if;

  if exists (
    select 1
    from public.community_message_requests as requests
    where requests.status = 'pending'
      and (
        (requests.sender_id = v_sender_id and requests.recipient_id = p_recipient_id)
        or (requests.sender_id = p_recipient_id and requests.recipient_id = v_sender_id)
      )
  ) then
    raise exception using errcode = '23505', message = 'A message request is already pending for this conversation.';
  end if;

  insert into public.community_message_requests (sender_id, recipient_id, content)
  values (v_sender_id, p_recipient_id, btrim(p_content))
  returning id into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function public.submit_community_message_request(uuid, text) from public, anon, authenticated;
grant execute on function public.submit_community_message_request(uuid, text) to authenticated;

create or replace function public.set_community_message_account_control(
  p_account_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  if p_account_id is null or p_account_id = v_user_id then
    raise exception using errcode = '22023', message = 'A different account is required.';
  end if;

  if p_status is null or p_status not in ('restricted', 'blocked', 'none') then
    raise exception using errcode = '22023', message = 'Invalid account control.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      least(v_user_id::text, p_account_id::text)
        || ':'
        || greatest(v_user_id::text, p_account_id::text),
      0
    )
  );

  if p_status = 'none' then
    delete from public.community_message_account_controls as controls
    where controls.owner_id = v_user_id and controls.account_id = p_account_id;
  else
    insert into public.community_message_account_controls as controls (owner_id, account_id, status)
    values (v_user_id, p_account_id, p_status)
    on conflict on constraint community_message_account_controls_pkey do update
      set status = excluded.status, created_at = pg_catalog.now();
  end if;

  if p_status = 'blocked' then
    update public.community_message_requests as requests
    set status = 'declined', updated_at = pg_catalog.now()
    where requests.status = 'pending'
      and (
        (requests.sender_id = v_user_id and requests.recipient_id = p_account_id)
        or (requests.sender_id = p_account_id and requests.recipient_id = v_user_id)
      );
  end if;

  if p_status in ('blocked', 'restricted') then
    update public.community_conversation_states as states
    set status = 'deleted'
    where states.user_id = v_user_id
      and states.partner_id = p_account_id;
  end if;
end;
$$;

revoke all on function public.set_community_message_account_control(uuid, text) from public, anon, authenticated;
grant execute on function public.set_community_message_account_control(uuid, text) to authenticated;
