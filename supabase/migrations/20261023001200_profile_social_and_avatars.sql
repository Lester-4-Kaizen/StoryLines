alter table public.profiles
  add column if not exists avatar_path text;

alter table public.profiles
  drop constraint if exists profiles_avatar_path_valid,
  add constraint profiles_avatar_path_valid check (
    avatar_path is null
    or (
      char_length(avatar_path) <= 256
      and split_part(avatar_path, '/', 1) = id::text
      and split_part(avatar_path, '/', 2) <> ''
      and split_part(avatar_path, '/', 3) = ''
    )
  );

grant select (avatar_path) on public.profiles to anon, authenticated;
grant update (avatar_path) on public.profiles to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Profile avatars are publicly readable" on storage.objects;
create policy "Profile avatars are publicly readable"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'avatars');

drop policy if exists "Users can upload their own profile avatars" on storage.objects;
create policy "Users can upload their own profile avatars"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users can update their own profile avatars" on storage.objects;
create policy "Users can update their own profile avatars"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users can delete their own profile avatars" on storage.objects;
create policy "Users can delete their own profile avatars"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create index if not exists community_follows_creator_created_idx
  on public.community_follows (creator_id, created_at desc, follower_id desc);
create index if not exists community_follows_follower_created_idx
  on public.community_follows (follower_id, created_at desc, creator_id desc);

create or replace function public.get_community_connections(
  p_profile_id uuid,
  p_direction text,
  p_cursor_created_at timestamptz default null,
  p_cursor_profile_id uuid default null,
  p_page_size integer default 20
)
returns table (
  profile_id uuid,
  display_name text,
  username text,
  avatar_path text,
  followed_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    connected_profile.id,
    connected_profile.display_name,
    connected_profile.username,
    connected_profile.avatar_path,
    follows.created_at
  from public.community_follows as follows
  join public.profiles as connected_profile
    on connected_profile.id = case
      when p_direction = 'followers' then follows.follower_id
      else follows.creator_id
    end
  where p_direction in ('followers', 'following')
    and (
      (p_direction = 'followers' and follows.creator_id = p_profile_id)
      or (p_direction = 'following' and follows.follower_id = p_profile_id)
    )
    and (
      (p_cursor_created_at is null and p_cursor_profile_id is null)
      or (
        p_cursor_created_at is not null
        and p_cursor_profile_id is not null
        and (follows.created_at, connected_profile.id) < (p_cursor_created_at, p_cursor_profile_id)
      )
    )
  order by follows.created_at desc, connected_profile.id desc
  limit greatest(1, least(coalesce(p_page_size, 20), 21));
$$;

revoke all on function public.get_community_connections(uuid, text, timestamptz, uuid, integer) from public, anon, authenticated;
grant execute on function public.get_community_connections(uuid, text, timestamptz, uuid, integer) to anon, authenticated;
