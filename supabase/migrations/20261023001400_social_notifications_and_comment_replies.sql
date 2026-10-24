alter table public.community_post_comments
  add column if not exists parent_comment_id uuid
    references public.community_post_comments (id) on delete cascade;

alter table public.community_direct_messages
  add column if not exists read_at timestamptz;

grant select (read_at) on public.community_direct_messages to authenticated;
grant update (read_at) on public.community_direct_messages to authenticated;

drop policy if exists "Recipients can mark their own messages as read" on public.community_direct_messages;
create policy "Recipients can mark their own messages as read"
  on public.community_direct_messages for update
  to authenticated
  using ((select auth.uid()) = recipient_id)
  with check ((select auth.uid()) = recipient_id);

grant insert (parent_comment_id) on public.community_post_comments to authenticated;
grant select (parent_comment_id) on public.community_post_comments to anon, authenticated;

drop policy if exists "Users can comment as themselves" on public.community_post_comments;
create policy "Users can comment as themselves"
  on public.community_post_comments for insert
  to authenticated
  with check (
    (select auth.uid()) = author_id
    and (
      parent_comment_id is null
      or exists (
        select 1
        from public.community_post_comments as parent
        where parent.id = parent_comment_id
          and parent.post_id = community_post_comments.post_id
      )
    )
  );

create table if not exists public.community_comment_reactions (
  comment_id uuid not null references public.community_post_comments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  reaction text not null check (reaction in ('like', 'dislike')),
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create index if not exists community_comment_reactions_user_idx
  on public.community_comment_reactions (user_id, comment_id);

alter table public.community_comment_reactions enable row level security;
revoke all on table public.community_comment_reactions from anon, authenticated;
grant select (comment_id, user_id, reaction) on public.community_comment_reactions to authenticated;
grant insert (comment_id, user_id, reaction) on public.community_comment_reactions to authenticated;
grant update (reaction) on public.community_comment_reactions to authenticated;
grant delete on public.community_comment_reactions to authenticated;

drop policy if exists "Users can see their own comment reactions" on public.community_comment_reactions;
create policy "Users can see their own comment reactions"
  on public.community_comment_reactions for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can react as themselves" on public.community_comment_reactions;
create policy "Users can react as themselves"
  on public.community_comment_reactions for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can change their own comment reactions" on public.community_comment_reactions;
create policy "Users can change their own comment reactions"
  on public.community_comment_reactions for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can remove their own comment reactions" on public.community_comment_reactions;
create policy "Users can remove their own comment reactions"
  on public.community_comment_reactions for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.get_community_comment_reaction_counts(comment_ids uuid[])
returns table (comment_id uuid, likes bigint, dislikes bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    reactions.comment_id,
    count(*) filter (where reactions.reaction = 'like')::bigint,
    count(*) filter (where reactions.reaction = 'dislike')::bigint
  from public.community_comment_reactions as reactions
  where cardinality(comment_ids) <= 100
    and reactions.comment_id = any(comment_ids)
  group by reactions.comment_id;
$$;

revoke all on function public.get_community_comment_reaction_counts(uuid[]) from public, anon, authenticated;
grant execute on function public.get_community_comment_reaction_counts(uuid[]) to anon, authenticated;

create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('follow', 'post_like', 'comment', 'comment_reply', 'comment_reaction', 'message')),
  post_id uuid references public.community_posts (id) on delete cascade,
  comment_id uuid references public.community_post_comments (id) on delete cascade,
  message_id uuid references public.community_direct_messages (id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint user_notifications_not_self check (recipient_id <> actor_id)
);

create index if not exists user_notifications_recipient_created_idx
  on public.user_notifications (recipient_id, created_at desc, id desc);
create index if not exists user_notifications_unread_idx
  on public.user_notifications (recipient_id, created_at desc)
  where read_at is null;

alter table public.user_notifications enable row level security;
revoke all on table public.user_notifications from anon, authenticated;
grant select (id, recipient_id, actor_id, kind, post_id, comment_id, message_id, created_at, read_at)
  on public.user_notifications to authenticated;
grant update (read_at) on public.user_notifications to authenticated;

drop policy if exists "Users can read their own notifications" on public.user_notifications;
create policy "Users can read their own notifications"
  on public.user_notifications for select
  to authenticated
  using ((select auth.uid()) = recipient_id);

drop policy if exists "Users can mark their own notifications as read" on public.user_notifications;
create policy "Users can mark their own notifications as read"
  on public.user_notifications for update
  to authenticated
  using ((select auth.uid()) = recipient_id)
  with check ((select auth.uid()) = recipient_id);

create or replace function public.notify_community_follow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_notifications (recipient_id, actor_id, kind)
  values (new.creator_id, new.follower_id, 'follow');
  return new;
end;
$$;

create or replace function public.notify_community_post_like()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  post_author uuid;
begin
  select author_id into post_author from public.community_posts where id = new.post_id;
  if post_author is not null and post_author <> new.user_id then
    insert into public.user_notifications (recipient_id, actor_id, kind, post_id)
    values (post_author, new.user_id, 'post_like', new.post_id);
  end if;
  return new;
end;
$$;

create or replace function public.notify_community_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient uuid;
begin
  if new.parent_comment_id is not null then
    select author_id into recipient
    from public.community_post_comments
    where id = new.parent_comment_id;
  end if;
  if recipient is null then
    select author_id into recipient
    from public.community_posts
    where id = new.post_id;
  end if;
  if recipient is not null and recipient <> new.author_id then
    insert into public.user_notifications (recipient_id, actor_id, kind, post_id, comment_id)
    values (
      recipient,
      new.author_id,
      case when new.parent_comment_id is null then 'comment' else 'comment_reply' end,
      new.post_id,
      new.id
    );
  end if;
  return new;
end;
$$;

create or replace function public.notify_community_comment_reaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  comment_author uuid;
  post_identifier uuid;
begin
  select author_id, post_id into comment_author, post_identifier
  from public.community_post_comments
  where id = new.comment_id;
  if comment_author is not null and comment_author <> new.user_id then
    insert into public.user_notifications (recipient_id, actor_id, kind, post_id, comment_id)
    values (comment_author, new.user_id, 'comment_reaction', post_identifier, new.comment_id);
  end if;
  return new;
end;
$$;

create or replace function public.notify_community_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_notifications (recipient_id, actor_id, kind, message_id)
  values (new.recipient_id, new.sender_id, 'message', new.id);
  return new;
end;
$$;

revoke all on function public.notify_community_follow() from public, anon, authenticated;
revoke all on function public.notify_community_post_like() from public, anon, authenticated;
revoke all on function public.notify_community_comment() from public, anon, authenticated;
revoke all on function public.notify_community_comment_reaction() from public, anon, authenticated;
revoke all on function public.notify_community_message() from public, anon, authenticated;

drop trigger if exists community_follow_notification on public.community_follows;
create trigger community_follow_notification
  after insert on public.community_follows
  for each row execute function public.notify_community_follow();

drop trigger if exists community_post_like_notification on public.community_post_likes;
create trigger community_post_like_notification
  after insert on public.community_post_likes
  for each row execute function public.notify_community_post_like();

drop trigger if exists community_comment_notification on public.community_post_comments;
create trigger community_comment_notification
  after insert on public.community_post_comments
  for each row execute function public.notify_community_comment();

drop trigger if exists community_comment_reaction_notification on public.community_comment_reactions;
create trigger community_comment_reaction_notification
  after insert on public.community_comment_reactions
  for each row execute function public.notify_community_comment_reaction();

drop trigger if exists community_message_notification on public.community_direct_messages;
create trigger community_message_notification
  after insert on public.community_direct_messages
  for each row execute function public.notify_community_message();

create or replace function public.reset_my_account_data()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'An authenticated user is required to reset account data.'
      using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.profiles where id = current_user_id
  ) then
    raise exception 'The profile to reset does not exist.'
      using errcode = 'P0002';
  end if;

  delete from public.user_notifications
  where recipient_id = current_user_id or actor_id = current_user_id;
  delete from public.community_comment_reactions
  where user_id = current_user_id;
  delete from public.community_post_comments
  where author_id = current_user_id;
  delete from public.community_post_likes
  where user_id = current_user_id;
  delete from public.community_saved_posts
  where user_id = current_user_id;
  delete from public.community_follows
  where follower_id = current_user_id or creator_id = current_user_id;
  delete from public.community_direct_messages
  where sender_id = current_user_id or recipient_id = current_user_id;
  delete from public.library_reading_progress
  where user_id = current_user_id;
  delete from public.library_saved_works
  where user_id = current_user_id;
  delete from public.community_posts
  where author_id = current_user_id;
  delete from public.creator_works
  where author_id = current_user_id;

  update public.profiles
  set
    roles = array['reader']::text[],
    bio = '',
    writing_languages = '{}'::text[],
    favorite_genres = '{}'::text[],
    facebook_url = null,
    instagram_url = null,
    portfolio_url = null,
    open_for_collaboration = false,
    collaboration_roles = '{}'::text[],
    avatar_path = null
  where id = current_user_id;
end;
$$;

revoke all on function public.reset_my_account_data() from public, anon, authenticated;
grant execute on function public.reset_my_account_data() to authenticated;
