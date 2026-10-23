grant delete on table public.community_posts to authenticated;

drop policy if exists "Creators can delete their own community posts" on public.community_posts;
create policy "Creators can delete their own community posts"
  on public.community_posts for delete
  to authenticated
  using ((select auth.uid()) = author_id);
