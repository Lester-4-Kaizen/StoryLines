create table if not exists public.creator_work_likes (
  work_id uuid not null references public.creator_works (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default pg_catalog.now(),
  primary key (work_id, user_id)
);

create index if not exists creator_work_likes_work_created_idx
  on public.creator_work_likes (work_id, created_at desc);

create index if not exists creator_work_likes_user_idx
  on public.creator_work_likes (user_id, work_id);

alter table public.creator_work_likes enable row level security;
revoke all on table public.creator_work_likes from public, anon, authenticated;

create table if not exists public.creator_work_views (
  work_id uuid not null references public.creator_works (id) on delete cascade,
  viewer_id uuid not null references public.profiles (id) on delete cascade,
  viewed_on date not null default ((pg_catalog.now() at time zone 'UTC')::date),
  created_at timestamptz not null default pg_catalog.now(),
  primary key (work_id, viewer_id, viewed_on)
);

create index if not exists creator_work_views_work_day_idx
  on public.creator_work_views (work_id, viewed_on desc);

create index if not exists creator_work_views_viewer_idx
  on public.creator_work_views (viewer_id, work_id);

alter table public.creator_work_views enable row level security;
revoke all on table public.creator_work_views from public, anon, authenticated;

create or replace function public.creator_work_engagement_period_start(p_period text)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_period = 'today' then
    return pg_catalog.date_trunc('day', pg_catalog.now() at time zone 'UTC') at time zone 'UTC';
  elsif p_period = 'week' then
    return pg_catalog.date_trunc('week', pg_catalog.now() at time zone 'UTC') at time zone 'UTC';
  elsif p_period = 'month' then
    return pg_catalog.date_trunc('month', pg_catalog.now() at time zone 'UTC') at time zone 'UTC';
  elsif p_period = 'all' then
    return null;
  end if;

  raise exception using errcode = '22023', message = 'Invalid engagement period.';
end;
$$;

revoke all on function public.creator_work_engagement_period_start(text) from public, anon, authenticated;

create or replace function public.record_creator_work_view(p_work_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_viewer_id uuid := (select auth.uid());
  v_inserted_count integer;
begin
  if v_viewer_id is null then
    return false;
  end if;

  insert into public.creator_work_views (work_id, viewer_id, viewed_on)
  select
    works.id,
    v_viewer_id,
    (pg_catalog.now() at time zone 'UTC')::date
  from public.creator_works as works
  where works.id = p_work_id
    and works.status <> 'Draft'
    and works.type in ('story', 'comic')
    and works.author_id <> v_viewer_id
  on conflict (work_id, viewer_id, viewed_on) do nothing;

  get diagnostics v_inserted_count = row_count;
  return v_inserted_count > 0;
end;
$$;

revoke all on function public.record_creator_work_view(uuid) from public, anon, authenticated;
grant execute on function public.record_creator_work_view(uuid) to authenticated;

create or replace function public.get_creator_work_engagement_counts(p_work_ids uuid[])
returns table (work_id uuid, view_count bigint, like_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    works.id,
    (select count(*)::bigint
      from public.creator_work_views as views
      where views.work_id = works.id),
    (select count(*)::bigint
      from public.creator_work_likes as likes
      where likes.work_id = works.id)
  from public.creator_works as works
  where cardinality(p_work_ids) <= 100
    and works.id = any(p_work_ids)
    and works.status <> 'Draft'
    and works.type in ('story', 'comic');
$$;

revoke all on function public.get_creator_work_engagement_counts(uuid[]) from public, anon, authenticated;
grant execute on function public.get_creator_work_engagement_counts(uuid[]) to anon, authenticated;

create or replace function public.toggle_creator_work_like(
  p_work_id uuid,
  p_liked boolean
)
returns table (liked boolean, like_count bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_author_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  if p_liked is null then
    raise exception using errcode = '22023', message = 'A like state is required.';
  end if;

  select works.author_id
  into v_author_id
  from public.creator_works as works
  where works.id = p_work_id
    and works.status <> 'Draft'
    and works.type in ('story', 'comic');

  if not found then
    raise exception using errcode = 'P0002', message = 'This published work is no longer available.';
  end if;

  if p_liked then
    if v_author_id = v_user_id then
      raise exception using errcode = '42501', message = 'You cannot like your own work.';
    end if;

    insert into public.creator_work_likes (work_id, user_id)
    values (p_work_id, v_user_id)
    on conflict (work_id, user_id) do nothing;
  else
    delete from public.creator_work_likes as likes
    where likes.work_id = p_work_id
      and likes.user_id = v_user_id;
  end if;

  return query
    select
      exists (
        select 1
        from public.creator_work_likes as likes
        where likes.work_id = p_work_id
          and likes.user_id = v_user_id
      ),
      count(*)::bigint
    from public.creator_work_likes as likes
    where likes.work_id = p_work_id;
end;
$$;

revoke all on function public.toggle_creator_work_like(uuid, boolean) from public, anon, authenticated;
grant execute on function public.toggle_creator_work_like(uuid, boolean) to authenticated;

create or replace function public.get_creator_work_engagement(p_work_id uuid)
returns table (view_count bigint, like_count bigint, liked_by_me boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*)::bigint
      from public.creator_work_views as views
      where views.work_id = works.id),
    (select count(*)::bigint
      from public.creator_work_likes as likes
      where likes.work_id = works.id),
    exists (
      select 1
      from public.creator_work_likes as likes
      where likes.work_id = works.id
        and likes.user_id = (select auth.uid())
    )
  from public.creator_works as works
  where works.id = p_work_id
    and works.status <> 'Draft'
    and works.type in ('story', 'comic');
$$;

revoke all on function public.get_creator_work_engagement(uuid) from public, anon, authenticated;
grant execute on function public.get_creator_work_engagement(uuid) to anon, authenticated;

create or replace function public.get_creator_work_rankings(
  p_category text,
  p_period text
)
returns table (
  entity_id uuid,
  title text,
  work_type text,
  creator_id uuid,
  creator_name text,
  creator_username text,
  cover_image_url text,
  view_count bigint,
  like_count bigint,
  score bigint,
  work_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_period_start timestamptz := public.creator_work_engagement_period_start(p_period);
begin
  if p_category is null or p_category not in ('stories', 'comics', 'works', 'creators') then
    raise exception using errcode = '22023', message = 'Invalid ranking category.';
  end if;

  return query
    with published_works as (
      select works.id, works.author_id, works.title, works.type, works.cover_image_url
      from public.creator_works as works
      where works.status <> 'Draft'
        and works.type in ('story', 'comic')
        and (
          p_category in ('works', 'creators')
          or (p_category = 'stories' and works.type = 'story')
          or (p_category = 'comics' and works.type = 'comic')
        )
    ),
    view_counts as (
      select views.work_id, count(*)::bigint as total
      from public.creator_work_views as views
      join published_works as works on works.id = views.work_id
      where v_period_start is null
        or views.viewed_on >= (v_period_start at time zone 'UTC')::date
      group by views.work_id
    ),
    like_counts as (
      select likes.work_id, count(*)::bigint as total
      from public.creator_work_likes as likes
      join published_works as works on works.id = likes.work_id
      where v_period_start is null or likes.created_at >= v_period_start
      group by likes.work_id
    ),
    work_metrics as (
      select
        works.id,
        works.author_id,
        works.title,
        works.type,
        works.cover_image_url,
        coalesce(views.total, 0)::bigint as views,
        coalesce(likes.total, 0)::bigint as likes
      from published_works as works
      left join view_counts as views on views.work_id = works.id
      left join like_counts as likes on likes.work_id = works.id
    ),
    work_rows as (
      select
        works.id as ranked_id,
        works.title as ranked_title,
        works.type as ranked_type,
        works.author_id as ranked_creator_id,
        profile.display_name as ranked_creator_name,
        profile.username as ranked_creator_username,
        works.cover_image_url as ranked_cover_image_url,
        works.views as ranked_views,
        works.likes as ranked_likes,
        (works.views + works.likes * 5)::bigint as ranked_score,
        1::bigint as ranked_work_count
      from work_metrics as works
      join public.profiles as profile on profile.id = works.author_id
      where p_category <> 'creators'
    ),
    creator_rows as (
      select
        works.author_id as ranked_id,
        null::text as ranked_title,
        null::text as ranked_type,
        works.author_id as ranked_creator_id,
        profile.display_name as ranked_creator_name,
        profile.username as ranked_creator_username,
        null::text as ranked_cover_image_url,
        sum(works.views)::bigint as ranked_views,
        sum(works.likes)::bigint as ranked_likes,
        sum(works.views + works.likes * 5)::bigint as ranked_score,
        count(*)::bigint as ranked_work_count
      from work_metrics as works
      join public.profiles as profile on profile.id = works.author_id
      where p_category = 'creators'
      group by works.author_id, profile.display_name, profile.username
    ),
    results as (
      select * from work_rows
      union all
      select * from creator_rows
    )
    select
      results.ranked_id,
      results.ranked_title,
      results.ranked_type,
      results.ranked_creator_id,
      results.ranked_creator_name,
      results.ranked_creator_username,
      results.ranked_cover_image_url,
      results.ranked_views,
      results.ranked_likes,
      results.ranked_score,
      results.ranked_work_count
    from results
    order by results.ranked_score desc, results.ranked_views desc, results.ranked_likes desc, results.ranked_title asc nulls last, results.ranked_id asc
    limit 50;
end;
$$;

revoke all on function public.get_creator_work_rankings(text, text) from public, anon, authenticated;
grant execute on function public.get_creator_work_rankings(text, text) to anon, authenticated;

create or replace function public.get_my_work_analytics(p_period text)
returns table (
  work_id uuid,
  title text,
  work_type text,
  view_count bigint,
  like_count bigint,
  score bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_period_start timestamptz := public.creator_work_engagement_period_start(p_period);
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  return query
    with published_works as (
      select works.id, works.title, works.type
      from public.creator_works as works
      where works.author_id = v_user_id
        and works.status <> 'Draft'
        and works.type in ('story', 'comic')
    ),
    view_counts as (
      select views.work_id, count(*)::bigint as total
      from public.creator_work_views as views
      join published_works as works on works.id = views.work_id
      where v_period_start is null
        or views.viewed_on >= (v_period_start at time zone 'UTC')::date
      group by views.work_id
    ),
    like_counts as (
      select likes.work_id, count(*)::bigint as total
      from public.creator_work_likes as likes
      join published_works as works on works.id = likes.work_id
      where v_period_start is null or likes.created_at >= v_period_start
      group by likes.work_id
    )
    select
      works.id,
      works.title,
      works.type,
      coalesce(views.total, 0)::bigint,
      coalesce(likes.total, 0)::bigint,
      (coalesce(views.total, 0) + coalesce(likes.total, 0) * 5)::bigint
    from published_works as works
    left join view_counts as views on views.work_id = works.id
    left join like_counts as likes on likes.work_id = works.id
    order by 6 desc, 4 desc, 5 desc, works.title asc;
end;
$$;

revoke all on function public.get_my_work_analytics(text) from public, anon, authenticated;
grant execute on function public.get_my_work_analytics(text) to authenticated;

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

  delete from public.community_post_comments
  where author_id = current_user_id;
  delete from public.community_post_likes
  where user_id = current_user_id;
  delete from public.community_saved_posts
  where user_id = current_user_id;
  delete from public.community_follows
  where follower_id = current_user_id
    or creator_id = current_user_id;
  delete from public.community_direct_messages
  where sender_id = current_user_id
    or recipient_id = current_user_id;
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
