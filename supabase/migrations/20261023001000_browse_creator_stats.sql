create or replace function public.get_browse_creator_stats(p_profile_ids uuid[])
returns table (profile_id uuid, follower_count bigint, work_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    requested.id,
    (
      select count(*)::bigint
      from public.community_follows as follows
      where follows.creator_id = requested.id
    ),
    (
      select count(*)::bigint
      from public.creator_works as works
      where works.author_id = requested.id
        and works.status <> 'Draft'
    )
  from (
    select distinct requested_ids.id
    from unnest(p_profile_ids) as requested_ids(id)
  ) as requested
  join public.profiles as profiles on profiles.id = requested.id
  where cardinality(p_profile_ids) <= 50
    and profiles.roles && array['writer', 'artist']::text[];
$$;

revoke all on function public.get_browse_creator_stats(uuid[]) from public, anon, authenticated;
grant execute on function public.get_browse_creator_stats(uuid[]) to anon, authenticated;
