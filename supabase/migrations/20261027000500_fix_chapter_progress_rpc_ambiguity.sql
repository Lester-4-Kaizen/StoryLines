create or replace function public.record_my_chapter_reading_progress(
  p_chapter_id uuid,
  p_completed boolean
)
returns table (chapter_id uuid, status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  chapter_work_id uuid;
begin
  if current_user_id is null then
    raise exception 'An authenticated user is required to save chapter progress.'
      using errcode = '28000';
  end if;

  if p_completed is null then
    raise exception 'Chapter completion status is required.'
      using errcode = '22004';
  end if;

  select chapters.work_id into chapter_work_id
  from public.creator_work_chapters as chapters
  join public.creator_works as works on works.id = chapters.work_id
  where chapters.id = p_chapter_id
    and chapters.is_published = true
    and works.status <> 'Draft';

  if chapter_work_id is null then
    raise exception 'The published chapter does not exist.'
      using errcode = 'P0002';
  end if;

  insert into public.library_chapter_reading_progress (
    user_id,
    work_id,
    chapter_id,
    status,
    updated_at,
    completed_at
  )
  values (
    current_user_id,
    chapter_work_id,
    p_chapter_id,
    case when p_completed then 'completed' else 'in_progress' end,
    pg_catalog.now(),
    case when p_completed then pg_catalog.now() else null end
  )
  on conflict on constraint library_chapter_reading_progress_pkey do update
    set status = case
          when library_chapter_reading_progress.status = 'completed' then 'completed'
          else excluded.status
        end,
        updated_at = pg_catalog.now(),
        completed_at = case
          when library_chapter_reading_progress.status = 'completed'
            then library_chapter_reading_progress.completed_at
          else excluded.completed_at
        end;

  return query
    select progress.chapter_id, progress.status
    from public.library_chapter_reading_progress as progress
    where progress.user_id = current_user_id
      and progress.chapter_id = p_chapter_id;
end;
$$;

revoke all on function public.record_my_chapter_reading_progress(uuid, boolean) from public, anon, authenticated;
grant execute on function public.record_my_chapter_reading_progress(uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
