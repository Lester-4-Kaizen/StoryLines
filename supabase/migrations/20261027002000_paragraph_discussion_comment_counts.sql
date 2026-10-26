create or replace function public.get_creator_chapter_paragraph_comment_counts(
  p_chapter_id uuid
)
returns table (paragraph_index integer, comment_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select comment.paragraph_index, count(*)::bigint
  from public.creator_chapter_comments as comment
  join public.creator_work_chapters as chapter on chapter.id = comment.chapter_id
  join public.creator_works as work on work.id = chapter.work_id
  where comment.chapter_id = p_chapter_id
    and not comment.is_hidden
    and chapter.is_published
    and work.status <> 'Draft'
    and not work.is_hidden
    and (
      (select auth.uid()) is null
      or public.moderation_account_can_read('creator_chapter_comments')
    )
  group by comment.paragraph_index
  order by comment.paragraph_index;
$$;

revoke all on function public.get_creator_chapter_paragraph_comment_counts(uuid)
  from public, anon, authenticated;
grant execute on function public.get_creator_chapter_paragraph_comment_counts(uuid)
  to anon, authenticated;

notify pgrst, 'reload schema';
