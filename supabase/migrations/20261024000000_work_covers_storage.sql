insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'work-covers',
  'work-covers',
  true,
  20971520,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Work covers are publicly readable" on storage.objects;
create policy "Work covers are publicly readable"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'work-covers');

drop policy if exists "Creators can upload their own work covers" on storage.objects;
create policy "Creators can upload their own work covers"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'work-covers'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1
      from public.profiles as profile
      where profile.id = (select auth.uid())
        and profile.roles && array['writer', 'artist']::text[]
    )
  );

drop policy if exists "Creators can update their own work covers" on storage.objects;
create policy "Creators can update their own work covers"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'work-covers'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'work-covers'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Creators can delete their own work covers" on storage.objects;
create policy "Creators can delete their own work covers"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'work-covers'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
