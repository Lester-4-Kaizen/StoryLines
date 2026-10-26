create table if not exists public.community_hidden_posts (
  user_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid not null references public.community_posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

alter table public.community_hidden_posts enable row level security;
revoke all on table public.community_hidden_posts from public, anon, authenticated;
grant select (user_id, post_id) on public.community_hidden_posts to authenticated;
grant insert (user_id, post_id) on public.community_hidden_posts to authenticated;
grant delete on public.community_hidden_posts to authenticated;

drop policy if exists "Users can read their hidden community posts"
  on public.community_hidden_posts;
create policy "Users can read their hidden community posts"
  on public.community_hidden_posts for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can hide community posts for themselves"
  on public.community_hidden_posts;
create policy "Users can hide community posts for themselves"
  on public.community_hidden_posts for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can unhide community posts for themselves"
  on public.community_hidden_posts;
create policy "Users can unhide community posts for themselves"
  on public.community_hidden_posts for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create table if not exists public.community_feed_author_mutes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, author_id),
  constraint community_feed_author_mutes_no_self check (user_id <> author_id)
);

alter table public.community_feed_author_mutes enable row level security;
revoke all on table public.community_feed_author_mutes from public, anon, authenticated;
grant select (user_id, author_id) on public.community_feed_author_mutes to authenticated;
grant insert (user_id, author_id) on public.community_feed_author_mutes to authenticated;
grant delete on public.community_feed_author_mutes to authenticated;

drop policy if exists "Users can read their community feed mutes"
  on public.community_feed_author_mutes;
create policy "Users can read their community feed mutes"
  on public.community_feed_author_mutes for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can mute community authors for themselves"
  on public.community_feed_author_mutes;
create policy "Users can mute community authors for themselves"
  on public.community_feed_author_mutes for insert
  to authenticated
  with check ((select auth.uid()) = user_id and user_id <> author_id);

drop policy if exists "Users can unmute community authors for themselves"
  on public.community_feed_author_mutes;
create policy "Users can unmute community authors for themselves"
  on public.community_feed_author_mutes for delete
  to authenticated
  using ((select auth.uid()) = user_id);
