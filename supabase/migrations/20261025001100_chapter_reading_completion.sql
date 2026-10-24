create table if not exists public.library_chapter_reading_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  work_id uuid not null references public.creator_works (id) on delete cascade,
  chapter_id uuid not null references public.creator_work_chapters (id) on delete cascade,
  status text not null check (status in ('in_progress', 'completed')),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (user_id, chapter_id),
  constraint library_chapter_reading_progress_work_fk
    foreign key (user_id, work_id)
    references public.library_reading_progress (user_id, work_id)
    on delete cascade,
  constraint library_chapter_reading_progress_completion_valid
    check ((status = 'completed') = (completed_at is not null))
);

create index if not exists library_chapter_reading_progress_work_idx
  on public.library_chapter_reading_progress (user_id, work_id, chapter_id);

alter table public.library_chapter_reading_progress enable row level security;
revoke all on table public.library_chapter_reading_progress from anon, authenticated;

create or replace function public.get_my_chapter_reading_progress(p_work_id uuid)
returns table (chapter_id uuid, status text)
language sql
security definer
set search_path = ''
stable
as $$
  select progress.chapter_id, progress.status
  from public.library_chapter_reading_progress as progress
  join public.creator_work_chapters as chapters
    on chapters.id = progress.chapter_id
   and chapters.work_id = progress.work_id
  where progress.user_id = (select auth.uid())
    and progress.work_id = p_work_id
    and chapters.is_published = true;
$$;

revoke all on function public.get_my_chapter_reading_progress(uuid) from public, anon, authenticated;
grant execute on function public.get_my_chapter_reading_progress(uuid) to authenticated;

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
    now(),
    case when p_completed then now() else null end
  )
  on conflict (user_id, chapter_id) do update
    set status = case
          when library_chapter_reading_progress.status = 'completed' then 'completed'
          else excluded.status
        end,
        updated_at = now(),
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
