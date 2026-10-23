alter table public.creator_works
  add column if not exists comic_reading_direction text not null default 'vertical',
  add column if not exists comic_reader_background text not null default 'dark',
  add column if not exists comic_page_spacing text not null default 'small',
  add column if not exists author_note text not null default '';

alter table public.creator_works
  drop constraint if exists creator_works_comic_reading_direction_valid,
  add constraint creator_works_comic_reading_direction_valid
    check (comic_reading_direction in ('vertical', 'page', 'rtl')),
  drop constraint if exists creator_works_comic_reader_background_valid,
  add constraint creator_works_comic_reader_background_valid
    check (comic_reader_background in ('dark', 'light', 'paper')),
  drop constraint if exists creator_works_comic_page_spacing_valid,
  add constraint creator_works_comic_page_spacing_valid
    check (comic_page_spacing in ('none', 'small', 'large')),
  drop constraint if exists creator_works_author_note_length,
  add constraint creator_works_author_note_length
    check (char_length(author_note) <= 2000);

grant select (
  comic_reading_direction, comic_reader_background, comic_page_spacing, author_note
) on public.creator_works to anon, authenticated;
grant insert (
  comic_reading_direction, comic_reader_background, comic_page_spacing, author_note
) on public.creator_works to authenticated;
grant update (
  comic_reading_direction, comic_reader_background, comic_page_spacing, author_note
) on public.creator_works to authenticated;

create table if not exists public.creator_comic_pages (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.creator_works (id) on delete cascade,
  page_number integer not null check (page_number > 0),
  image_id text not null check (char_length(image_id) <= 128),
  image_url text not null check (char_length(image_url) <= 2048),
  alt_text text not null default '' check (char_length(alt_text) <= 500),
  transcript text not null default '' check (char_length(transcript) <= 10000),
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (work_id, page_number)
);

create index if not exists creator_comic_pages_published_idx
  on public.creator_comic_pages (work_id, page_number)
  where is_published;

alter table public.creator_comic_pages enable row level security;
revoke all on table public.creator_comic_pages from anon, authenticated;
grant select (
  id, work_id, page_number, image_id, image_url, alt_text, transcript, is_published, created_at, updated_at
) on public.creator_comic_pages to anon, authenticated;
grant insert (
  work_id, page_number, image_id, image_url, alt_text, transcript, is_published
) on public.creator_comic_pages to authenticated;
grant update (
  page_number, image_id, image_url, alt_text, transcript, is_published, updated_at
) on public.creator_comic_pages to authenticated;
grant delete on public.creator_comic_pages to authenticated;

drop policy if exists "Published comic pages are publicly readable" on public.creator_comic_pages;
create policy "Published comic pages are publicly readable"
  on public.creator_comic_pages for select
  to anon, authenticated
  using (
    is_published
    and exists (
      select 1
      from public.creator_works as work
      where work.id = work_id
        and work.type = 'comic'
        and work.status <> 'Draft'
    )
  );

drop policy if exists "Creators can read their own comic pages" on public.creator_comic_pages;
create policy "Creators can read their own comic pages"
  on public.creator_comic_pages for select
  to authenticated
  using (
    exists (
      select 1
      from public.creator_works as work
      where work.id = work_id
        and work.author_id = (select auth.uid())
        and work.type = 'comic'
    )
  );

drop policy if exists "Creators can add pages to their own comics" on public.creator_comic_pages;
create policy "Creators can add pages to their own comics"
  on public.creator_comic_pages for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.creator_works as work
      join public.profiles as profile on profile.id = work.author_id
      where work.id = work_id
        and work.author_id = (select auth.uid())
        and work.type = 'comic'
        and 'artist' = any(profile.roles)
    )
  );

drop policy if exists "Creators can update pages to their own comics" on public.creator_comic_pages;
create policy "Creators can update pages to their own comics"
  on public.creator_comic_pages for update
  to authenticated
  using (
    exists (
      select 1
      from public.creator_works as work
      where work.id = work_id
        and work.author_id = (select auth.uid())
        and work.type = 'comic'
    )
  )
  with check (
    exists (
      select 1
      from public.creator_works as work
      where work.id = work_id
        and work.author_id = (select auth.uid())
        and work.type = 'comic'
    )
  );

drop policy if exists "Creators can delete pages from their own comics" on public.creator_comic_pages;
create policy "Creators can delete pages from their own comics"
  on public.creator_comic_pages for delete
  to authenticated
  using (
    exists (
      select 1
      from public.creator_works as work
      where work.id = work_id
        and work.author_id = (select auth.uid())
        and work.type = 'comic'
    )
  );
