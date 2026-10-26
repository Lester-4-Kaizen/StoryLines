create or replace function public.community_post_comment_parent_matches(
  p_parent_comment_id uuid,
  p_post_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.community_post_comments as parent
    where parent.id = p_parent_comment_id
      and parent.post_id = p_post_id
  );
$$;

revoke all on function public.community_post_comment_parent_matches(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.community_post_comment_parent_matches(uuid, uuid)
  to authenticated;

drop policy if exists "Users can comment as themselves"
  on public.community_post_comments;
create policy "Users can comment as themselves"
  on public.community_post_comments for insert
  to authenticated
  with check (
    (select auth.uid()) = author_id
    and char_length(btrim(content)) between 1 and 500
    and (
      parent_comment_id is null
      or public.community_post_comment_parent_matches(parent_comment_id, post_id)
    )
  );
