alter table public.user_notifications
  drop constraint if exists user_notifications_kind_check,
  add column if not exists proposal_id uuid
    references public.collaboration_requests (id) on delete cascade,
  add constraint user_notifications_kind_check check (
    kind in (
      'follow',
      'post_like',
      'comment',
      'comment_reply',
      'comment_reaction',
      'message',
      'mention',
      'collaboration_proposal'
    )
  );

grant select (proposal_id) on public.user_notifications to authenticated;

create table if not exists public.community_update_author_mutes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, author_id),
  constraint community_update_author_mutes_no_self check (user_id <> author_id)
);

alter table public.community_update_author_mutes enable row level security;
revoke all on table public.community_update_author_mutes from public, anon, authenticated;
grant select (user_id, author_id) on public.community_update_author_mutes to authenticated;
grant insert (user_id, author_id) on public.community_update_author_mutes to authenticated;
grant delete on public.community_update_author_mutes to authenticated;

drop policy if exists "Users can read their author update mutes"
  on public.community_update_author_mutes;
create policy "Users can read their author update mutes"
  on public.community_update_author_mutes for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can mute followed authors"
  on public.community_update_author_mutes;
create policy "Users can mute followed authors"
  on public.community_update_author_mutes for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and user_id <> author_id
    and exists (
      select 1
      from public.community_follows as follow
      where follow.follower_id = (select auth.uid())
        and follow.creator_id = author_id
    )
  );

drop policy if exists "Users can unmute their author updates"
  on public.community_update_author_mutes;
create policy "Users can unmute their author updates"
  on public.community_update_author_mutes for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create table if not exists public.community_followed_update_reads (
  user_id uuid not null references public.profiles (id) on delete cascade,
  update_key text not null check (char_length(update_key) between 1 and 200),
  seen_at timestamptz not null default now(),
  primary key (user_id, update_key)
);

alter table public.community_followed_update_reads enable row level security;
revoke all on table public.community_followed_update_reads from public, anon, authenticated;
grant select (user_id, update_key, seen_at)
  on public.community_followed_update_reads to authenticated;
grant insert (user_id, update_key, seen_at)
  on public.community_followed_update_reads to authenticated;
grant update (seen_at) on public.community_followed_update_reads to authenticated;

drop policy if exists "Users can read their followed update receipts"
  on public.community_followed_update_reads;
create policy "Users can read their followed update receipts"
  on public.community_followed_update_reads for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can save their followed update receipts"
  on public.community_followed_update_reads;
create policy "Users can save their followed update receipts"
  on public.community_followed_update_reads for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their followed update receipts"
  on public.community_followed_update_reads;
create policy "Users can update their followed update receipts"
  on public.community_followed_update_reads for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function public.notify_community_mentions(
  p_actor_id uuid,
  p_content text,
  p_post_id uuid,
  p_comment_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_notifications (recipient_id, actor_id, kind, post_id, comment_id)
  select distinct mentioned.id, p_actor_id, 'mention', p_post_id, p_comment_id
  from pg_catalog.regexp_matches(p_content, '@([A-Za-z0-9_]{1,30})', 'g') as mention
  join public.profiles as mentioned
    on pg_catalog.lower(mentioned.username) = pg_catalog.lower(mention[1])
  where mentioned.id <> p_actor_id;
end;
$$;

revoke all on function public.notify_community_mentions(uuid, text, uuid, uuid)
  from public, anon, authenticated;

create or replace function public.notify_community_post_mention()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.notify_community_mentions(new.author_id, new.content, new.id, null);
  return new;
end;
$$;

create or replace function public.notify_community_comment_mention()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.notify_community_mentions(new.author_id, new.content, new.post_id, new.id);
  return new;
end;
$$;

revoke all on function public.notify_community_post_mention() from public, anon, authenticated;
revoke all on function public.notify_community_comment_mention() from public, anon, authenticated;

drop trigger if exists community_post_mention_notification on public.community_posts;
create trigger community_post_mention_notification
  after insert on public.community_posts
  for each row execute function public.notify_community_post_mention();

drop trigger if exists community_comment_mention_notification on public.community_post_comments;
create trigger community_comment_mention_notification
  after insert on public.community_post_comments
  for each row execute function public.notify_community_comment_mention();

create or replace function public.notify_collaboration_proposal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'proposal' and new.recipient_id is not null then
    insert into public.user_notifications (recipient_id, actor_id, kind, proposal_id)
    values (new.recipient_id, new.requester_id, 'collaboration_proposal', new.id);
  end if;
  return new;
end;
$$;

revoke all on function public.notify_collaboration_proposal() from public, anon, authenticated;

drop trigger if exists collaboration_proposal_notification on public.collaboration_requests;
create trigger collaboration_proposal_notification
  after insert on public.collaboration_requests
  for each row execute function public.notify_collaboration_proposal();
