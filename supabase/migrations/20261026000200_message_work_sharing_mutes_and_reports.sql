alter table public.community_direct_messages
  add column if not exists work_id uuid
    references public.creator_works (id) on delete set null;

grant select (work_id) on public.community_direct_messages to authenticated;
grant insert (work_id) on public.community_direct_messages to authenticated;

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
    and (
      community_direct_messages.work_id is null
      or exists (
        select 1
        from public.creator_works as work
        where work.id = community_direct_messages.work_id
          and work.author_id = (select auth.uid())
          and work.status <> 'Draft'
          and work.type in ('story', 'comic')
      )
    )
  );

create table if not exists public.community_conversation_mutes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  partner_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, partner_id),
  constraint community_conversation_mutes_no_self check (user_id <> partner_id)
);

alter table public.community_conversation_mutes enable row level security;
revoke all on table public.community_conversation_mutes from public, anon, authenticated;
grant select (user_id, partner_id, created_at)
  on public.community_conversation_mutes to authenticated;
grant insert (user_id, partner_id)
  on public.community_conversation_mutes to authenticated;
grant delete on public.community_conversation_mutes to authenticated;

drop policy if exists "Users can read their own conversation mutes"
  on public.community_conversation_mutes;
create policy "Users can read their own conversation mutes"
  on public.community_conversation_mutes for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can mute their own conversations"
  on public.community_conversation_mutes;
create policy "Users can mute their own conversations"
  on public.community_conversation_mutes for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and user_id <> partner_id
  );

drop policy if exists "Users can unmute their own conversations"
  on public.community_conversation_mutes;
create policy "Users can unmute their own conversations"
  on public.community_conversation_mutes for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create table if not exists public.community_message_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reported_user_id uuid not null references public.profiles (id) on delete cascade,
  message_id uuid references public.community_direct_messages (id) on delete set null,
  reason text not null check (reason in ('harassment', 'spam', 'inappropriate', 'other')),
  details text not null default '' check (char_length(details) <= 1000),
  created_at timestamptz not null default now(),
  constraint community_message_reports_no_self check (reporter_id <> reported_user_id)
);

alter table public.community_message_reports enable row level security;
revoke all on table public.community_message_reports from public, anon, authenticated;
grant insert (reporter_id, reported_user_id, message_id, reason, details)
  on public.community_message_reports to authenticated;

drop policy if exists "Users can report message participants"
  on public.community_message_reports;
create policy "Users can report message participants"
  on public.community_message_reports for insert
  to authenticated
  with check (
    (select auth.uid()) = reporter_id
    and reporter_id <> reported_user_id
    and (
      message_id is null
      or exists (
        select 1
        from public.community_direct_messages as message
        where message.id = community_message_reports.message_id
          and (select auth.uid()) in (message.sender_id, message.recipient_id)
          and reported_user_id in (message.sender_id, message.recipient_id)
      )
    )
  );

create or replace function public.notify_community_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.community_conversation_mutes as mute
    where mute.user_id = new.recipient_id
      and mute.partner_id = new.sender_id
  ) then
    insert into public.user_notifications (recipient_id, actor_id, kind, message_id)
    values (new.recipient_id, new.sender_id, 'message', new.id);
  end if;
  return new;
end;
$$;

do $$
begin
  if exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_catalog.pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'community_direct_messages'
     ) then
    alter publication supabase_realtime add table public.community_direct_messages;
  end if;
end;
$$;
