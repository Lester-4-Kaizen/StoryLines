alter table public.community_direct_messages
  add column if not exists reply_to_message_id uuid
    references public.community_direct_messages (id) on delete set null;

grant select (reply_to_message_id) on public.community_direct_messages to authenticated;
grant insert (reply_to_message_id) on public.community_direct_messages to authenticated;

create or replace function public.can_reply_to_community_message(
  p_reply_to_message_id uuid,
  p_sender_id uuid,
  p_recipient_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.community_direct_messages as replied
    where replied.id = p_reply_to_message_id
      and (select auth.uid()) = p_sender_id
      and (
        (p_sender_id = replied.sender_id and p_recipient_id = replied.recipient_id)
        or (p_sender_id = replied.recipient_id and p_recipient_id = replied.sender_id)
      )
  );
$$;

revoke all on function public.can_reply_to_community_message(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.can_reply_to_community_message(uuid, uuid, uuid) to authenticated;

drop policy if exists "Users can send messages as themselves" on public.community_direct_messages;
create policy "Users can send messages as themselves"
  on public.community_direct_messages for insert
  to authenticated
  with check (
    (select auth.uid()) = sender_id
    and community_direct_messages.sender_id <> community_direct_messages.recipient_id
    and (
      community_direct_messages.reply_to_message_id is null
      or public.can_reply_to_community_message(
        community_direct_messages.reply_to_message_id,
        community_direct_messages.sender_id,
        community_direct_messages.recipient_id
      )
    )
  );

create table if not exists public.community_message_reactions (
  message_id uuid not null references public.community_direct_messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  reaction text not null check (reaction in ('❤️', '😂', '😮', '😢', '👍', '🔥')),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create index if not exists community_message_reactions_user_idx
  on public.community_message_reactions (user_id, message_id);

alter table public.community_message_reactions enable row level security;
revoke all on table public.community_message_reactions from anon, authenticated;
grant select (message_id, user_id, reaction) on public.community_message_reactions to authenticated;
grant insert (message_id, user_id, reaction) on public.community_message_reactions to authenticated;
grant update (reaction) on public.community_message_reactions to authenticated;
grant delete on public.community_message_reactions to authenticated;

drop policy if exists "Participants can read message reactions" on public.community_message_reactions;
create policy "Participants can read message reactions"
  on public.community_message_reactions for select
  to authenticated
  using (
    exists (
      select 1
      from public.community_direct_messages as message
      where message.id = message_id
        and (select auth.uid()) in (message.sender_id, message.recipient_id)
    )
  );

drop policy if exists "Users can react as themselves to received messages" on public.community_message_reactions;
create policy "Users can react as themselves to received messages"
  on public.community_message_reactions for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.community_direct_messages as message
      where message.id = message_id
        and (select auth.uid()) in (message.sender_id, message.recipient_id)
    )
  );

drop policy if exists "Users can update their own message reactions" on public.community_message_reactions;
create policy "Users can update their own message reactions"
  on public.community_message_reactions for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.community_direct_messages as message
      where message.id = message_id
        and (select auth.uid()) in (message.sender_id, message.recipient_id)
    )
  );

drop policy if exists "Users can remove their own message reactions" on public.community_message_reactions;
create policy "Users can remove their own message reactions"
  on public.community_message_reactions for delete
  to authenticated
  using (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.community_direct_messages as message
      where message.id = message_id
        and (select auth.uid()) in (message.sender_id, message.recipient_id)
    )
  );
