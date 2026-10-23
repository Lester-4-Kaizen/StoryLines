grant update (content) on table public.community_posts to authenticated;

drop policy if exists "Creators can edit their own community posts" on public.community_posts;
create policy "Creators can edit their own community posts"
  on public.community_posts for update
  to authenticated
  using ((select auth.uid()) = author_id)
  with check ((select auth.uid()) = author_id);
