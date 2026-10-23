create table if not exists public.creator_work_chapters (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.creator_works (id) on delete cascade,
  chapter_number integer not null check (chapter_number > 0),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  body text not null default '',
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (work_id, chapter_number)
);

create index if not exists creator_work_chapters_published_idx
  on public.creator_work_chapters (work_id, chapter_number desc)
  where is_published;

alter table public.creator_work_chapters enable row level security;
revoke all on table public.creator_work_chapters from anon, authenticated;
grant select (id, work_id, chapter_number, title, body, is_published, created_at, updated_at)
  on public.creator_work_chapters to anon, authenticated;
grant insert (work_id, chapter_number, title, body, is_published)
  on public.creator_work_chapters to authenticated;
grant update (title, body, is_published, updated_at)
  on public.creator_work_chapters to authenticated;
grant delete on public.creator_work_chapters to authenticated;

drop policy if exists "Published chapters are publicly readable" on public.creator_work_chapters;
create policy "Published chapters are publicly readable"
  on public.creator_work_chapters for select
  to anon, authenticated
  using (
    is_published
    and exists (
      select 1
      from public.creator_works as work
      where work.id = work_id
        and work.type = 'story'
        and work.status <> 'Draft'
    )
  );

drop policy if exists "Authors can read their own chapters" on public.creator_work_chapters;
create policy "Authors can read their own chapters"
  on public.creator_work_chapters for select
  to authenticated
  using (
    exists (
      select 1
      from public.creator_works as work
      where work.id = work_id
        and work.author_id = (select auth.uid())
    )
  );

drop policy if exists "Authors can add chapters to their own works" on public.creator_work_chapters;
create policy "Authors can add chapters to their own works"
  on public.creator_work_chapters for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.creator_works as work
      where work.id = work_id
        and work.author_id = (select auth.uid())
        and work.type = 'story'
    )
  );

drop policy if exists "Authors can update their own chapters" on public.creator_work_chapters;
create policy "Authors can update their own chapters"
  on public.creator_work_chapters for update
  to authenticated
  using (
    exists (
      select 1
      from public.creator_works as work
      where work.id = work_id
        and work.author_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.creator_works as work
      where work.id = work_id
        and work.author_id = (select auth.uid())
    )
  );

drop policy if exists "Authors can delete their own chapters" on public.creator_work_chapters;
create policy "Authors can delete their own chapters"
  on public.creator_work_chapters for delete
  to authenticated
  using (
    exists (
      select 1
      from public.creator_works as work
      where work.id = work_id
        and work.author_id = (select auth.uid())
    )
  );

create table if not exists public.library_saved_works (
  user_id uuid not null references public.profiles (id) on delete cascade,
  work_id uuid not null references public.creator_works (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, work_id)
);

create index if not exists library_saved_works_user_created_idx
  on public.library_saved_works (user_id, created_at desc, work_id desc);

alter table public.library_saved_works enable row level security;
revoke all on table public.library_saved_works from anon, authenticated;
grant select (user_id, work_id, created_at) on public.library_saved_works to authenticated;
grant insert (user_id, work_id) on public.library_saved_works to authenticated;
grant delete on public.library_saved_works to authenticated;

drop policy if exists "Users can view their saved works" on public.library_saved_works;
create policy "Users can view their saved works"
  on public.library_saved_works for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can save published works" on public.library_saved_works;
create policy "Users can save published works"
  on public.library_saved_works for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.creator_works as work
      where work.id = work_id
        and work.type in ('story', 'comic')
        and work.status <> 'Draft'
    )
  );

drop policy if exists "Users can remove their saved works" on public.library_saved_works;
create policy "Users can remove their saved works"
  on public.library_saved_works for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create table if not exists public.library_reading_progress (
  user_id uuid not null references public.profiles (id) on delete cascade,
  work_id uuid not null references public.creator_works (id) on delete cascade,
  chapter_id uuid not null references public.creator_work_chapters (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, work_id)
);

create index if not exists library_reading_progress_user_read_idx
  on public.library_reading_progress (user_id, last_read_at desc, work_id desc);

alter table public.library_reading_progress enable row level security;
revoke all on table public.library_reading_progress from anon, authenticated;
grant select (user_id, work_id, chapter_id, last_read_at)
  on public.library_reading_progress to authenticated;
grant insert (user_id, work_id, chapter_id, last_read_at) on public.library_reading_progress to authenticated;
grant update (chapter_id, last_read_at) on public.library_reading_progress to authenticated;
grant delete on public.library_reading_progress to authenticated;

drop policy if exists "Users can view their reading history" on public.library_reading_progress;
create policy "Users can view their reading history"
  on public.library_reading_progress for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can track their own reading" on public.library_reading_progress;
create policy "Users can track their own reading"
  on public.library_reading_progress for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.creator_work_chapters as chapter
      join public.creator_works as work on work.id = chapter.work_id
      where chapter.id = chapter_id
        and chapter.work_id = library_reading_progress.work_id
        and chapter.is_published
        and work.status <> 'Draft'
    )
  );

drop policy if exists "Users can update their reading progress" on public.library_reading_progress;
create policy "Users can update their reading progress"
  on public.library_reading_progress for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.creator_work_chapters as chapter
      join public.creator_works as work on work.id = chapter.work_id
      where chapter.id = chapter_id
        and chapter.work_id = library_reading_progress.work_id
        and chapter.is_published
        and work.status <> 'Draft'
    )
  );

drop policy if exists "Users can clear their reading history" on public.library_reading_progress;
create policy "Users can clear their reading history"
  on public.library_reading_progress for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.get_published_work_chapter_summaries(work_ids uuid[])
returns table (
  work_id uuid,
  chapter_count bigint,
  latest_chapter_number integer,
  latest_chapter_title text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    chapter.work_id,
    count(*)::bigint,
    max(chapter.chapter_number),
    (array_agg(chapter.title order by chapter.chapter_number desc))[1]
  from public.creator_work_chapters as chapter
  join public.creator_works as work on work.id = chapter.work_id
  where cardinality(work_ids) <= 50
    and chapter.work_id = any(work_ids)
    and chapter.is_published
    and work.status <> 'Draft'
  group by chapter.work_id;
$$;

revoke all on function public.get_published_work_chapter_summaries(uuid[]) from public, anon, authenticated;
grant execute on function public.get_published_work_chapter_summaries(uuid[]) to authenticated;
