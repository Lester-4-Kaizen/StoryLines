drop function if exists public.get_creator_work_rankings(text, text);

create function public.get_creator_work_rankings(
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

  if p_category = 'creators' then
    return query
      with published_works as (
        select works.id, works.author_id
        from public.creator_works as works
        where works.status <> 'Draft'
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
      ),
      follower_counts as (
        select follows.creator_id, count(*)::bigint as total
        from public.community_follows as follows
        join published_works as works on works.author_id = follows.creator_id
        group by follows.creator_id
      ),
      creator_totals as (
        select
          works.author_id as creator_id,
          count(distinct works.id)::bigint as work_count,
          sum(coalesce(views.total, 0))::bigint as view_count,
          sum(coalesce(likes.total, 0))::bigint as like_count,
          coalesce(follower_counts.total, 0)::bigint as follower_count
        from published_works as works
        left join view_counts as views on views.work_id = works.id
        left join like_counts as likes on likes.work_id = works.id
        left join follower_counts on follower_counts.creator_id = works.author_id
        group by works.author_id, follower_counts.total
      )
      select
        creators.creator_id,
        null::text,
        null::text,
        creators.creator_id,
        profile.display_name,
        profile.username,
        null::text,
        creators.view_count,
        creators.like_count,
        creators.work_count
      from creator_totals as creators
      join public.profiles as profile on profile.id = creators.creator_id
      order by creators.follower_count desc,
        profile.display_name asc nulls last,
        creators.creator_id asc
      limit 50;
    return;
  end if;

  return query
    with published_works as (
      select works.id, works.author_id, works.title, works.type, works.cover_image_url
      from public.creator_works as works
      where works.status <> 'Draft'
        and works.type in ('story', 'comic')
        and (
          p_category = 'works'
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
    )
    select
      works.id,
      works.title,
      works.type,
      works.author_id,
      profile.display_name,
      profile.username,
      works.cover_image_url,
      coalesce(views.total, 0)::bigint,
      coalesce(likes.total, 0)::bigint,
      1::bigint
    from published_works as works
    join public.profiles as profile on profile.id = works.author_id
    left join view_counts as views on views.work_id = works.id
    left join like_counts as likes on likes.work_id = works.id
    order by coalesce(views.total, 0) desc,
      coalesce(likes.total, 0) desc,
      works.title asc nulls last,
      works.id asc
    limit 50;
end;
$$;

revoke all on function public.get_creator_work_rankings(text, text) from public, anon, authenticated;
grant execute on function public.get_creator_work_rankings(text, text) to anon, authenticated;

drop function if exists public.get_my_work_analytics(text);

create function public.get_my_work_analytics(p_period text)
returns table (
  work_id uuid,
  title text,
  work_type text,
  view_count bigint,
  like_count bigint
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
      coalesce(likes.total, 0)::bigint
    from published_works as works
    left join view_counts as views on views.work_id = works.id
    left join like_counts as likes on likes.work_id = works.id
    order by 4 desc, 5 desc, works.title asc;
end;
$$;

revoke all on function public.get_my_work_analytics(text) from public, anon, authenticated;
grant execute on function public.get_my_work_analytics(text) to authenticated;
