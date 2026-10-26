create or replace function public.search_mention_profiles(p_query text)
returns table (
  id uuid,
  display_name text,
  username text,
  avatar_path text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_query text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_query, '')));
begin
  if auth.uid() is null or pg_catalog.char_length(v_query) > 30 then
    return;
  end if;

  if v_query = '' then
    return query
      select profile.id, profile.display_name, profile.username, profile.avatar_path
      from public.community_follows as followed
      join public.profiles as profile on profile.id = followed.creator_id
      where followed.follower_id = (select auth.uid())
        and profile.staff_role is null
      order by followed.created_at desc, pg_catalog.lower(profile.username)
      limit 6;
  else
    return query
      select profile.id, profile.display_name, profile.username, profile.avatar_path
      from public.profiles as profile
      where profile.id <> (select auth.uid())
        and profile.staff_role is null
        and pg_catalog.left(pg_catalog.lower(profile.username), pg_catalog.char_length(v_query)) = v_query
      order by pg_catalog.lower(profile.username)
      limit 6;
  end if;
end;
$$;

revoke all on function public.search_mention_profiles(text)
  from public, anon, authenticated;
grant execute on function public.search_mention_profiles(text)
  to authenticated;

notify pgrst, 'reload schema';
