create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  author_role text not null check (author_role in ('writer', 'artist')),
  type text not null check (
    type in ('update', 'recommendation', 'work-in-progress', 'collaborator', 'feedback', 'poll')
  ),
  content text not null check (length(btrim(content)) between 1 and 500),
  image_urls text[] not null default '{}',
  tags text[] not null default '{}',
  looking_for text[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint community_posts_image_limit check (cardinality(image_urls) <= 4),
  constraint community_posts_tag_limit check (cardinality(tags) <= 5)
);

create index if not exists community_posts_created_at_idx
  on public.community_posts (created_at desc);

alter table public.community_posts enable row level security;

revoke all on table public.community_posts from anon, authenticated;
grant select (
  id, author_id, author_role, type, content, image_urls, tags, looking_for, created_at
) on public.community_posts to anon, authenticated;
grant insert (
  author_id, author_role, type, content, image_urls, tags, looking_for
) on public.community_posts to authenticated;

drop policy if exists "Community posts are publicly readable" on public.community_posts;
create policy "Community posts are publicly readable"
  on public.community_posts for select
  to anon, authenticated
  using (true);

drop policy if exists "Creators can publish their own community posts" on public.community_posts;
create policy "Creators can publish their own community posts"
  on public.community_posts for insert
  to authenticated
  with check (
    (select auth.uid()) = author_id
    and exists (
      select 1
      from public.profiles as profile
      where profile.id = (select auth.uid())
        and author_role = any (profile.roles)
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('community-post-images', 'community-post-images', true, 8388608, array['image/jpeg'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Community post images are publicly readable" on storage.objects;
create policy "Community post images are publicly readable"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'community-post-images');

drop policy if exists "Creators can upload their community post images" on storage.objects;
create policy "Creators can upload their community post images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'community-post-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
