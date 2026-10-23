create table if not exists public.community_follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  creator_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, creator_id),
  constraint community_follows_no_self_follow check (follower_id <> creator_id)
);

create index if not exists community_follows_creator_id_idx
  on public.community_follows (creator_id);

alter table public.community_follows enable row level security;

revoke all on table public.community_follows from anon, authenticated;
grant select (follower_id, creator_id, created_at)
  on public.community_follows to authenticated;
grant insert (follower_id, creator_id)
  on public.community_follows to authenticated;
grant delete on public.community_follows to authenticated;

drop policy if exists "Users can view creators they follow" on public.community_follows;
create policy "Users can view creators they follow"
  on public.community_follows for select
  to authenticated
  using ((select auth.uid()) = follower_id);

drop policy if exists "Users can follow creator profiles" on public.community_follows;
create policy "Users can follow creator profiles"
  on public.community_follows for insert
  to authenticated
  with check (
    (select auth.uid()) = follower_id
    and exists (
      select 1
      from public.profiles as creator
      where creator.id = creator_id
        and creator.roles && array['writer', 'artist']::text[]
    )
  );

drop policy if exists "Users can unfollow creators" on public.community_follows;
create policy "Users can unfollow creators"
  on public.community_follows for delete
  to authenticated
  using ((select auth.uid()) = follower_id);
