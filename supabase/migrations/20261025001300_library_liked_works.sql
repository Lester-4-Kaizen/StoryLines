grant select (work_id, user_id, created_at)
  on public.creator_work_likes to authenticated;

create policy "Users can view their own work likes"
  on public.creator_work_likes for select
  to authenticated
  using ((select auth.uid()) = user_id);
