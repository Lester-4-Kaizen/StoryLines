grant insert (post_id, author_id, content, parent_comment_id)
  on public.community_post_comments to authenticated;
grant update (content)
  on public.community_post_comments to authenticated;

drop policy if exists "Users can comment as themselves"
  on public.community_post_comments;
create policy "Users can comment as themselves"
  on public.community_post_comments for insert
  to authenticated
  with check (
    (select auth.uid()) = author_id
    and length(btrim(content)) between 1 and 500
    and (
      parent_comment_id is null
      or exists (
        select 1
        from public.community_post_comments as parent
        where parent.id = parent_comment_id
          and parent.post_id = community_post_comments.post_id
      )
    )
  );

drop policy if exists "Users can edit their own community comments"
  on public.community_post_comments;
create policy "Users can edit their own community comments"
  on public.community_post_comments for update
  to authenticated
  using ((select auth.uid()) = author_id)
  with check (
    (select auth.uid()) = author_id
    and length(btrim(content)) between 1 and 500
  );
