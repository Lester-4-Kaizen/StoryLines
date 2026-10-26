alter table public.creator_chapter_comments
  alter column paragraph_index drop not null;

alter table public.creator_chapter_comments
  drop constraint if exists creator_chapter_comments_paragraph_index_check,
  drop constraint if exists creator_chapter_comments_anchor_text_check,
  add constraint creator_chapter_comments_discussion_scope_check
    check (
      (paragraph_index is null and anchor_text = '')
      or (
        paragraph_index is not null
        and paragraph_index >= 0
        and char_length(btrim(anchor_text)) between 1 and 300
      )
    );

create or replace function public.chapter_comment_parent_matches(
  p_parent_comment_id uuid,
  p_chapter_id uuid,
  p_paragraph_index integer
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.creator_chapter_comments as parent
    where parent.id = p_parent_comment_id
      and parent.chapter_id = p_chapter_id
      and parent.paragraph_index is not distinct from p_paragraph_index
  );
$$;

revoke all on function public.chapter_comment_parent_matches(uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.chapter_comment_parent_matches(uuid, uuid, integer)
  to authenticated;

drop policy if exists "Authenticated users can comment on published chapters"
  on public.creator_chapter_comments;
create policy "Authenticated users can comment on published chapters"
  on public.creator_chapter_comments for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (
      select 1
      from public.creator_work_chapters as chapters
      join public.creator_works as works on works.id = chapters.work_id
      where chapters.id = creator_chapter_comments.chapter_id
        and chapters.is_published
        and works.status <> 'Draft'
    )
    and (
      parent_comment_id is null
      or public.chapter_comment_parent_matches(
        parent_comment_id,
        chapter_id,
        paragraph_index
      )
    )
  );

notify pgrst, 'reload schema';
