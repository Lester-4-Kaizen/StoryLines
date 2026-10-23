alter table public.creator_works
  add column if not exists rating text not null default 'All ages',
  add column if not exists content_warnings text[] not null default '{}';

alter table public.creator_works
  drop constraint if exists creator_works_rating_valid,
  add constraint creator_works_rating_valid
    check (rating in ('All ages', 'Teen', 'Mature')),
  drop constraint if exists creator_works_content_warnings_limit,
  add constraint creator_works_content_warnings_limit
    check (cardinality(content_warnings) <= 12);

grant select (rating, content_warnings) on public.creator_works to anon, authenticated;
grant insert (rating, content_warnings) on public.creator_works to authenticated;
grant update (rating, content_warnings) on public.creator_works to authenticated;

alter table public.creator_work_chapters
  add column if not exists author_note text not null default '';

alter table public.creator_work_chapters
  drop constraint if exists creator_work_chapters_author_note_length,
  add constraint creator_work_chapters_author_note_length
    check (char_length(author_note) <= 2000);

grant select (author_note) on public.creator_work_chapters to anon, authenticated;
grant insert (author_note) on public.creator_work_chapters to authenticated;
grant update (author_note) on public.creator_work_chapters to authenticated;
