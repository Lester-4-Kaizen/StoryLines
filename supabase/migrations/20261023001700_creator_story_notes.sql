create table if not exists public.creator_story_notes (
  work_id uuid primary key references public.creator_works (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  notes text not null default '' check (char_length(notes) <= 10000),
  updated_at timestamptz not null default now()
);

alter table public.creator_story_notes enable row level security;
revoke all on table public.creator_story_notes from anon, authenticated;
grant select (work_id, author_id, notes, updated_at)
  on public.creator_story_notes to authenticated;
grant insert (work_id, author_id, notes)
  on public.creator_story_notes to authenticated;
grant insert (updated_at) on public.creator_story_notes to authenticated;
grant update (work_id, author_id, notes, updated_at)
  on public.creator_story_notes to authenticated;
grant delete on public.creator_story_notes to authenticated;

drop policy if exists "Creators can read their own story notes" on public.creator_story_notes;
create policy "Creators can read their own story notes"
  on public.creator_story_notes for select
  to authenticated
  using (
    author_id = (select auth.uid())
    and exists (
      select 1
      from public.creator_works as work
      where work.id = work_id
        and work.author_id = (select auth.uid())
        and work.type = 'story'
    )
  );

drop policy if exists "Creators can add their own story notes" on public.creator_story_notes;
create policy "Creators can add their own story notes"
  on public.creator_story_notes for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (
      select 1
      from public.creator_works as work
      where work.id = work_id
        and work.author_id = (select auth.uid())
        and work.type = 'story'
    )
  );

drop policy if exists "Creators can update their own story notes" on public.creator_story_notes;
create policy "Creators can update their own story notes"
  on public.creator_story_notes for update
  to authenticated
  using (
    author_id = (select auth.uid())
    and exists (
      select 1
      from public.creator_works as work
      where work.id = work_id
        and work.author_id = (select auth.uid())
        and work.type = 'story'
    )
  )
  with check (
    author_id = (select auth.uid())
    and exists (
      select 1
      from public.creator_works as work
      where work.id = work_id
        and work.author_id = (select auth.uid())
        and work.type = 'story'
    )
  );

drop policy if exists "Creators can delete their own story notes" on public.creator_story_notes;
create policy "Creators can delete their own story notes"
  on public.creator_story_notes for delete
  to authenticated
  using (
    author_id = (select auth.uid())
    and exists (
      select 1
      from public.creator_works as work
      where work.id = work_id
        and work.author_id = (select auth.uid())
        and work.type = 'story'
    )
  );
