alter table public.community_hidden_posts
  add column if not exists hide_reason text;

alter table public.community_hidden_posts
  drop constraint if exists community_hidden_posts_hide_reason_check,
  add constraint community_hidden_posts_hide_reason_check
    check (
      hide_reason is null
      or hide_reason in (
        'doesnt_match_interests',
        'scam',
        'sexual',
        'disturbing',
        'dislike_creator',
        'other'
      )
    );

grant update (hide_reason) on public.community_hidden_posts to authenticated;

drop policy if exists "Users can update their hidden post feedback"
  on public.community_hidden_posts;
create policy "Users can update their hidden post feedback"
  on public.community_hidden_posts for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
