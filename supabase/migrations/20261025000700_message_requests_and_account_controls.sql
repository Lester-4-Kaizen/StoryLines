create table if not exists public.community_message_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  content text not null check (char_length(btrim(content)) between 1 and 2000),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_message_requests_no_self check (sender_id <> recipient_id)
);

create unique index if not exists community_message_requests_pending_pair_idx
  on public.community_message_requests (sender_id, recipient_id)
  where status = 'pending';

create index if not exists community_message_requests_recipient_status_idx
  on public.community_message_requests (recipient_id, status, created_at desc);

create table if not exists public.community_message_account_controls (
  owner_id uuid not null references public.profiles (id) on delete cascade,
  account_id uuid not null references public.profiles (id) on delete cascade,
  status text not null check (status in ('restricted', 'blocked')),
  created_at timestamptz not null default now(),
  primary key (owner_id, account_id),
  constraint community_message_account_controls_no_self check (owner_id <> account_id)
);

create index if not exists community_message_account_controls_owner_status_idx
  on public.community_message_account_controls (owner_id, status, created_at desc);

alter table public.community_message_requests enable row level security;
alter table public.community_message_account_controls enable row level security;

revoke all on table public.community_message_requests from anon, authenticated;
grant select (id, sender_id, recipient_id, content, status, created_at, updated_at)
  on public.community_message_requests to authenticated;

drop policy if exists "Participants can read their message requests"
  on public.community_message_requests;
create policy "Participants can read their message requests"
  on public.community_message_requests for select
  to authenticated
  using ((select auth.uid()) in (sender_id, recipient_id));

revoke all on table public.community_message_account_controls from anon, authenticated;
grant select (owner_id, account_id, status, created_at)
  on public.community_message_account_controls to authenticated;

drop policy if exists "Users can read their own message account controls"
  on public.community_message_account_controls;
create policy "Users can read their own message account controls"
  on public.community_message_account_controls for select
  to authenticated
  using ((select auth.uid()) = owner_id);

create or replace function public.can_send_community_direct_message(
  p_sender_id uuid,
  p_recipient_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select auth.uid()) = p_sender_id
    and p_sender_id <> p_recipient_id
    and not exists (
      select 1
      from public.community_message_account_controls as controls
      where controls.status = 'blocked'
        and (
          (controls.owner_id = p_sender_id and controls.account_id = p_recipient_id)
          or (controls.owner_id = p_recipient_id and controls.account_id = p_sender_id)
        )
    )
    and not exists (
      select 1
      from public.community_message_account_controls as controls
      where controls.owner_id = p_recipient_id
        and controls.account_id = p_sender_id
        and controls.status = 'restricted'
    )
    and (
      exists (
        select 1
        from public.community_follows as follows
        where follows.follower_id = p_recipient_id
          and follows.creator_id = p_sender_id
      )
      or exists (
        select 1
        from public.community_direct_messages as messages
        where (messages.sender_id = p_sender_id and messages.recipient_id = p_recipient_id)
          or (messages.sender_id = p_recipient_id and messages.recipient_id = p_sender_id)
      )
    );
$$;

revoke all on function public.can_send_community_direct_message(uuid, uuid) from public, anon, authenticated;
grant execute on function public.can_send_community_direct_message(uuid, uuid) to authenticated;

drop policy if exists "Users can send messages as themselves" on public.community_direct_messages;
create policy "Users can send messages as themselves"
  on public.community_direct_messages for insert
  to authenticated
  with check (
    public.can_send_community_direct_message(
      community_direct_messages.sender_id,
      community_direct_messages.recipient_id
    )
    and (
      community_direct_messages.reply_to_message_id is null
      or public.can_reply_to_community_message(
        community_direct_messages.reply_to_message_id,
        community_direct_messages.sender_id,
        community_direct_messages.recipient_id
      )
    )
  );

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
      and not public.can_send_community_direct_message((select auth.uid()), p_partner_id),
    exists (
      select 1
      from public.community_message_requests as requests
      where requests.sender_id = (select auth.uid())
        and requests.recipient_id = p_partner_id
        and requests.status = 'pending'
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
    where requests.sender_id = v_sender_id
      and requests.recipient_id = p_recipient_id
      and requests.status = 'pending'
  ) then
    raise exception using errcode = '23505', message = 'A message request is already pending.';
  end if;

  insert into public.community_message_requests (sender_id, recipient_id, content)
  values (v_sender_id, p_recipient_id, btrim(p_content))
  returning id into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function public.submit_community_message_request(uuid, text) from public, anon, authenticated;
grant execute on function public.submit_community_message_request(uuid, text) to authenticated;

create or replace function public.respond_to_community_message_request(
  p_request_id uuid,
  p_action text
)
returns table (partner_id uuid, message_id uuid, request_status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_request public.community_message_requests%rowtype;
  v_message_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  if p_action is null or p_action not in ('accept', 'decline') then
    raise exception using errcode = '22023', message = 'Invalid message request action.';
  end if;

  select requests.*
  into v_request
  from public.community_message_requests as requests
  where requests.id = p_request_id
    and requests.recipient_id = v_user_id
    and requests.status = 'pending'
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'This message request is no longer available.';
  end if;

  if p_action = 'accept' then
    if exists (
      select 1
      from public.community_message_account_controls as controls
      where controls.status = 'blocked'
        and (
          (controls.owner_id = v_user_id and controls.account_id = v_request.sender_id)
          or (controls.owner_id = v_request.sender_id and controls.account_id = v_user_id)
        )
    ) then
      raise exception using errcode = '22023', message = 'This account is blocked.';
    end if;

    if exists (
      select 1
      from public.community_message_account_controls as controls
      where controls.owner_id = v_user_id
        and controls.account_id = v_request.sender_id
        and controls.status = 'restricted'
    ) then
      raise exception using errcode = '22023', message = 'Unrestrict this account before accepting its message request.';
    end if;

    insert into public.community_direct_messages (sender_id, recipient_id, content)
    values (v_request.sender_id, v_user_id, v_request.content)
    returning id into v_message_id;

    update public.community_message_requests as requests
    set status = 'accepted', updated_at = pg_catalog.now()
    where requests.id = v_request.id;
  else
    update public.community_message_requests as requests
    set status = 'declined', updated_at = pg_catalog.now()
    where requests.id = v_request.id;
  end if;

  return query
    select v_request.sender_id, v_message_id, p_action;
end;
$$;

revoke all on function public.respond_to_community_message_request(uuid, text) from public, anon, authenticated;
grant execute on function public.respond_to_community_message_request(uuid, text) to authenticated;

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
    where requests.sender_id = p_account_id
      and requests.recipient_id = v_user_id
      and requests.status = 'pending';
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
