create or replace function public.get_community_message_access(p_partner_id uuid)
returns table (
  can_send_direct boolean,
  can_send_request boolean,
  request_pending boolean,
  account_blocked boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.can_send_community_direct_message((select auth.uid()), p_partner_id),
    (select auth.uid()) is not null
      and p_partner_id is not null
      and p_partner_id <> (select auth.uid())
      and not exists (
        select 1
        from public.community_message_account_controls as controls
        where controls.status = 'blocked'
          and (
            (controls.owner_id = (select auth.uid()) and controls.account_id = p_partner_id)
            or (controls.owner_id = p_partner_id and controls.account_id = (select auth.uid()))
          )
      )
      and not public.can_send_community_direct_message((select auth.uid()), p_partner_id)
      and not exists (
        select 1
        from public.community_message_requests as requests
        where requests.status = 'pending'
          and (
            (requests.sender_id = (select auth.uid()) and requests.recipient_id = p_partner_id)
            or (requests.sender_id = p_partner_id and requests.recipient_id = (select auth.uid()))
          )
      ),
    exists (
      select 1
      from public.community_message_requests as requests
      where requests.status = 'pending'
        and (
          (requests.sender_id = (select auth.uid()) and requests.recipient_id = p_partner_id)
          or (requests.sender_id = p_partner_id and requests.recipient_id = (select auth.uid()))
        )
    ),
    exists (
      select 1
      from public.community_message_account_controls as controls
      where controls.status = 'blocked'
        and (
          (controls.owner_id = (select auth.uid()) and controls.account_id = p_partner_id)
          or (controls.owner_id = p_partner_id and controls.account_id = (select auth.uid()))
        )
    );
$$;

revoke all on function public.get_community_message_access(uuid) from public, anon, authenticated;
grant execute on function public.get_community_message_access(uuid) to authenticated;

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
