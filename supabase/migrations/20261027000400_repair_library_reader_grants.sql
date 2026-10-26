grant select (
  id, work_id, chapter_number, title, body, is_published, created_at, updated_at, author_note
) on public.creator_work_chapters to anon, authenticated;
grant insert (
  work_id, chapter_number, title, body, is_published, author_note
) on public.creator_work_chapters to authenticated;
grant update (
  title, body, is_published, updated_at, author_note, work_id, chapter_number
) on public.creator_work_chapters to authenticated;
grant delete on public.creator_work_chapters to authenticated;

grant select (user_id, work_id, chapter_id, last_read_at, scroll_progress)
  on public.library_reading_progress to authenticated;
grant insert (user_id, work_id, chapter_id, last_read_at, scroll_progress)
  on public.library_reading_progress to authenticated;
grant update (user_id, work_id, chapter_id, last_read_at, scroll_progress)
  on public.library_reading_progress to authenticated;
grant delete on public.library_reading_progress to authenticated;

notify pgrst, 'reload schema';
