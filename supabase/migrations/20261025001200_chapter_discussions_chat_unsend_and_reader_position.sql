alter table public.library_reading_progress
  add column if not exists scroll_progress numeric(5, 4) not null default 0
    check (scroll_progress between 0 and 1);

grant select (scroll_progress) on public.library_reading_progress to authenticated;
grant insert (scroll_progress) on public.library_reading_progress to authenticated;
grant update (scroll_progress) on public.library_reading_progress to authenticated;

create table if not exists public.creator_chapter_comments (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.creator_work_chapters (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  parent_comment_id uuid references public.creator_chapter_comments (id) on delete cascade,
  paragraph_index integer not null check (paragraph_index >= 0),
  anchor_text text not null check (char_length(btrim(anchor_text)) between 1 and 300),
  content text not null check (char_length(btrim(content)) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists creator_chapter_comments_anchor_idx
  on public.creator_chapter_comments (chapter_id, paragraph_index, created_at, id);
create index if not exists creator_chapter_comments_author_idx
  on public.creator_chapter_comments (author_id, created_at desc);

alter table public.creator_chapter_comments enable row level security;
revoke all on table public.creator_chapter_comments from anon, authenticated;
grant select (id, chapter_id, author_id, parent_comment_id, paragraph_index, anchor_text, content, created_at)
  on public.creator_chapter_comments to anon, authenticated;
grant insert (chapter_id, author_id, parent_comment_id, paragraph_index, anchor_text, content)
  on public.creator_chapter_comments to authenticated;
grant delete on public.creator_chapter_comments to authenticated;

drop policy if exists "Published chapter comments are readable"
  on public.creator_chapter_comments;
create policy "Published chapter comments are readable"
  on public.creator_chapter_comments for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.creator_work_chapters as chapters
      join public.creator_works as works on works.id = chapters.work_id
      where chapters.id = creator_chapter_comments.chapter_id
        and chapters.is_published
        and works.status <> 'Draft'
    )
  );

drop policy if exists "Authenticated users can comment on published chapters"
  on public.creator_chapter_comments;
create policy "Authenticated users can comment on published chapters"
  on public.creator_chapter_comments for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (
      select 1
      from public.creator_work_chapters as chapters
      join public.creator_works as works on works.id = chapters.work_id
      where chapters.id = creator_chapter_comments.chapter_id
        and chapters.is_published
        and works.status <> 'Draft'
    )
    and (
      parent_comment_id is null
      or exists (
        select 1
        from public.creator_chapter_comments as parent
        where parent.id = creator_chapter_comments.parent_comment_id
          and parent.chapter_id = creator_chapter_comments.chapter_id
          and parent.paragraph_index = creator_chapter_comments.paragraph_index
      )
    )
  );

drop policy if exists "Authors can delete their own chapter comments"
  on public.creator_chapter_comments;
create policy "Authors can delete their own chapter comments"
  on public.creator_chapter_comments for delete
  to authenticated
  using (author_id = (select auth.uid()));

create table if not exists public.creator_chapter_comment_reactions (
  comment_id uuid not null references public.creator_chapter_comments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  reaction text not null check (reaction in ('like', 'dislike')),
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create index if not exists creator_chapter_comment_reactions_user_idx
  on public.creator_chapter_comment_reactions (user_id, comment_id);

alter table public.creator_chapter_comment_reactions enable row level security;
revoke all on table public.creator_chapter_comment_reactions from anon, authenticated;
grant select (comment_id, user_id, reaction) on public.creator_chapter_comment_reactions to authenticated;
grant insert (comment_id, user_id, reaction) on public.creator_chapter_comment_reactions to authenticated;
grant update (reaction) on public.creator_chapter_comment_reactions to authenticated;
grant delete on public.creator_chapter_comment_reactions to authenticated;

drop policy if exists "Users can read their chapter comment reactions"
  on public.creator_chapter_comment_reactions;
create policy "Users can read their chapter comment reactions"
  on public.creator_chapter_comment_reactions for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users can react to published chapter comments"
  on public.creator_chapter_comment_reactions;
create policy "Users can react to published chapter comments"
  on public.creator_chapter_comment_reactions for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.creator_chapter_comments as comments
      join public.creator_work_chapters as chapters on chapters.id = comments.chapter_id
      join public.creator_works as works on works.id = chapters.work_id
      where comments.id = creator_chapter_comment_reactions.comment_id
        and chapters.is_published
        and works.status <> 'Draft'
    )
  );

drop policy if exists "Users can update their chapter comment reactions"
  on public.creator_chapter_comment_reactions;
create policy "Users can update their chapter comment reactions"
  on public.creator_chapter_comment_reactions for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can remove their chapter comment reactions"
  on public.creator_chapter_comment_reactions;
create policy "Users can remove their chapter comment reactions"
  on public.creator_chapter_comment_reactions for delete
  to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.get_creator_chapter_comment_reaction_counts(p_comment_ids uuid[])
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
  from public.creator_chapter_comment_reactions as reactions
  join public.creator_chapter_comments as comments on comments.id = reactions.comment_id
  join public.creator_work_chapters as chapters on chapters.id = comments.chapter_id
  join public.creator_works as works on works.id = chapters.work_id
  where cardinality(p_comment_ids) <= 100
    and reactions.comment_id = any(p_comment_ids)
    and chapters.is_published
    and works.status <> 'Draft'
  group by reactions.comment_id;
$$;

revoke all on function public.get_creator_chapter_comment_reaction_counts(uuid[]) from public, anon, authenticated;
grant execute on function public.get_creator_chapter_comment_reaction_counts(uuid[]) to anon, authenticated;

alter table public.community_direct_messages
  add column if not exists is_deleted boolean not null default false;
grant select (is_deleted) on public.community_direct_messages to authenticated;

create or replace function public.unsend_community_direct_message(p_message_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'An authenticated user is required to unsend a message.'
      using errcode = '28000';
  end if;

  update public.community_direct_messages
  set content = 'This message was deleted',
      is_deleted = true
  where id = p_message_id
    and sender_id = (select auth.uid())
    and not is_deleted
  returning id into changed_id;

  if changed_id is null then
    raise exception 'The message cannot be unsent.'
      using errcode = 'P0002';
  end if;

  return true;
end;
$$;

revoke all on function public.unsend_community_direct_message(uuid) from public, anon, authenticated;
grant execute on function public.unsend_community_direct_message(uuid) to authenticated;

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
  delete from public.creator_chapter_comment_reactions
  where user_id = current_user_id;
  delete from public.creator_chapter_comments
  where author_id = current_user_id;
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
  delete from public.creator_work_likes
  where user_id = current_user_id;
  delete from public.creator_work_views
  where viewer_id = current_user_id;
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
