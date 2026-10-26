create table if not exists public.creator_chapter_discussion_reactions (
  chapter_id uuid not null references public.creator_work_chapters (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  reaction text not null check (
    reaction in ('like', 'funny', 'love', 'surprised', 'angry', 'sad')
  ),
  created_at timestamptz not null default now(),
  primary key (chapter_id, user_id)
);

alter table public.creator_chapter_discussion_reactions enable row level security;
revoke all on table public.creator_chapter_discussion_reactions from public, anon, authenticated;

create or replace function public.get_creator_chapter_discussion_reactions(p_chapter_id uuid)
returns table (reaction text, reaction_count bigint, reacted_by_me boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with reaction_options(reaction, sort_order) as (
    values
      ('like', 1),
      ('funny', 2),
      ('love', 3),
      ('surprised', 4),
      ('angry', 5),
      ('sad', 6)
  )
  select
    options.reaction,
    count(reactions.user_id)::bigint,
    coalesce(bool_or(reactions.user_id = (select auth.uid())), false)
  from reaction_options as options
  left join public.creator_chapter_discussion_reactions as reactions
    on reactions.chapter_id = p_chapter_id
    and reactions.reaction = options.reaction
  where exists (
    select 1
    from public.creator_work_chapters as chapter
    join public.creator_works as work on work.id = chapter.work_id
    where chapter.id = p_chapter_id
      and chapter.is_published
      and work.status <> 'Draft'
      and not work.is_hidden
  )
  group by options.reaction, options.sort_order
  order by options.sort_order;
$$;

revoke all on function public.get_creator_chapter_discussion_reactions(uuid)
  from public, anon, authenticated;
grant execute on function public.get_creator_chapter_discussion_reactions(uuid)
  to anon, authenticated;

create or replace function public.toggle_creator_chapter_discussion_reaction(
  p_chapter_id uuid,
  p_reaction text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_work_author_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  if coalesce(p_reaction, '') not in ('like', 'funny', 'love', 'surprised', 'angry', 'sad') then
    raise exception using errcode = '22023', message = 'Invalid chapter reaction.';
  end if;

  if not public.moderation_account_is_active() then
    raise exception using errcode = '42501', message = 'This account cannot react while suspended or banned.';
  end if;

  select work.author_id
    into v_work_author_id
  from public.creator_work_chapters as chapter
  join public.creator_works as work on work.id = chapter.work_id
  where chapter.id = p_chapter_id
    and chapter.is_published
    and work.status <> 'Draft'
    and not work.is_hidden;

  if v_work_author_id is null then
    raise exception using errcode = '22023', message = 'The published chapter could not be found.';
  end if;

  if public.community_accounts_have_blocked_relationship(v_user_id, v_work_author_id) then
    raise exception using errcode = '42501', message = 'You cannot react to this chapter.';
  end if;

  delete from public.creator_chapter_discussion_reactions
  where chapter_id = p_chapter_id
    and user_id = v_user_id
    and reaction = p_reaction;

  if found then
    return;
  end if;

  insert into public.creator_chapter_discussion_reactions (chapter_id, user_id, reaction)
  values (p_chapter_id, v_user_id, p_reaction)
  on conflict (chapter_id, user_id)
  do update set reaction = excluded.reaction, created_at = pg_catalog.now();
end;
$$;

revoke all on function public.toggle_creator_chapter_discussion_reaction(uuid, text)
  from public, anon, authenticated;
grant execute on function public.toggle_creator_chapter_discussion_reaction(uuid, text)
  to authenticated;

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
  delete from public.creator_chapter_discussion_reactions
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

notify pgrst, 'reload schema';
