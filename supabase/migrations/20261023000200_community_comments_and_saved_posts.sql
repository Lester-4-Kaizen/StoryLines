create table if not exists public.community_post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  content text not null check (length(btrim(content)) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists community_post_comments_post_created_idx
  on public.community_post_comments (post_id, created_at);

alter table public.community_post_comments enable row level security;

revoke all on table public.community_post_comments from anon, authenticated;
grant select (id, post_id, author_id, content, created_at)
  on public.community_post_comments to anon, authenticated;
grant insert (post_id, author_id, content)
  on public.community_post_comments to authenticated;
grant delete on public.community_post_comments to authenticated;

drop policy if exists "Community post comments are publicly readable" on public.community_post_comments;
create policy "Community post comments are publicly readable"
  on public.community_post_comments for select
  to anon, authenticated
  using (true);

drop policy if exists "Users can comment as themselves" on public.community_post_comments;
create policy "Users can comment as themselves"
  on public.community_post_comments for insert
  to authenticated
  with check ((select auth.uid()) = author_id);

drop policy if exists "Users can delete their own community comments" on public.community_post_comments;
create policy "Users can delete their own community comments"
  on public.community_post_comments for delete
  to authenticated
  using ((select auth.uid()) = author_id);

create table if not exists public.community_saved_posts (
  user_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid not null references public.community_posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

create index if not exists community_saved_posts_post_id_idx
  on public.community_saved_posts (post_id);

alter table public.community_saved_posts enable row level security;

revoke all on table public.community_saved_posts from anon, authenticated;
grant select (user_id, post_id, created_at)
  on public.community_saved_posts to authenticated;
grant insert (user_id, post_id)
  on public.community_saved_posts to authenticated;
grant delete on public.community_saved_posts to authenticated;

drop policy if exists "Users can view their own saved community posts" on public.community_saved_posts;
create policy "Users can view their own saved community posts"
  on public.community_saved_posts for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can save community posts for themselves" on public.community_saved_posts;
create policy "Users can save community posts for themselves"
  on public.community_saved_posts for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can unsave their own community posts" on public.community_saved_posts;
create policy "Users can unsave their own community posts"
  on public.community_saved_posts for delete
  to authenticated
  using ((select auth.uid()) = user_id);
