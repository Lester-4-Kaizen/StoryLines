alter table public.profiles
  add column if not exists bio text not null default '',
  add column if not exists writing_languages text[] not null default '{}',
  add column if not exists favorite_genres text[] not null default '{}',
  add column if not exists facebook_url text,
  add column if not exists instagram_url text,
  add column if not exists portfolio_url text,
  add column if not exists open_for_collaboration boolean not null default false,
  add column if not exists collaboration_roles text[] not null default '{}';

alter table public.profiles
  drop constraint if exists profiles_bio_length,
  add constraint profiles_bio_length check (char_length(bio) <= 160),
  drop constraint if exists profiles_writing_languages_limit,
  add constraint profiles_writing_languages_limit check (cardinality(writing_languages) <= 5),
  drop constraint if exists profiles_favorite_genres_limit,
  add constraint profiles_favorite_genres_limit check (cardinality(favorite_genres) <= 10),
  drop constraint if exists profiles_collaboration_roles_limit,
  add constraint profiles_collaboration_roles_limit check (cardinality(collaboration_roles) <= 5);

grant select (
  id, display_name, username, roles, created_at, bio, writing_languages,
  favorite_genres, facebook_url, instagram_url, portfolio_url,
  open_for_collaboration, collaboration_roles
) on public.profiles to anon, authenticated;
grant update (
  display_name, bio, writing_languages, favorite_genres, facebook_url,
  instagram_url, portfolio_url, open_for_collaboration, collaboration_roles
) on public.profiles to authenticated;

create table if not exists public.creator_works (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  type text not null check (type in ('story', 'comic', 'art')),
  synopsis text not null default '' check (char_length(synopsis) <= 500),
  genre text,
  language text,
  status text not null default 'Draft' check (status in ('Draft', 'Ongoing', 'Complete')),
  cover_image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists creator_works_author_created_idx
  on public.creator_works (author_id, created_at desc, id desc);
create index if not exists creator_works_public_created_idx
  on public.creator_works (created_at desc, id desc)
  where status <> 'Draft';

alter table public.creator_works enable row level security;
revoke all on table public.creator_works from anon, authenticated;
grant select (id, author_id, title, type, synopsis, genre, language, status, cover_image_url, created_at, updated_at)
  on public.creator_works to anon, authenticated;
grant insert (id, author_id, title, type, synopsis, genre, language, status, cover_image_url)
  on public.creator_works to authenticated;
grant update (title, synopsis, genre, language, status, cover_image_url, updated_at)
  on public.creator_works to authenticated;
grant delete on public.creator_works to authenticated;

drop policy if exists "Published works are publicly readable" on public.creator_works;
create policy "Published works are publicly readable"
  on public.creator_works for select
  to anon, authenticated
  using (status <> 'Draft' or (select auth.uid()) = author_id);

drop policy if exists "Creators can add their own works" on public.creator_works;
create policy "Creators can add their own works"
  on public.creator_works for insert
  to authenticated
  with check (
    (select auth.uid()) = author_id
    and exists (
      select 1
      from public.profiles as profile
      where profile.id = (select auth.uid())
        and (
          (type = 'story' and 'writer' = any(profile.roles))
          or (type in ('comic', 'art') and 'artist' = any(profile.roles))
        )
    )
  );

drop policy if exists "Creators can update their own works" on public.creator_works;
create policy "Creators can update their own works"
  on public.creator_works for update
  to authenticated
  using ((select auth.uid()) = author_id)
  with check ((select auth.uid()) = author_id);

drop policy if exists "Creators can delete their own works" on public.creator_works;
create policy "Creators can delete their own works"
  on public.creator_works for delete
  to authenticated
  using ((select auth.uid()) = author_id);

create table if not exists public.community_post_likes (
  post_id uuid not null references public.community_posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists community_post_likes_user_idx
  on public.community_post_likes (user_id, post_id);

alter table public.community_post_likes enable row level security;
revoke all on table public.community_post_likes from anon, authenticated;
grant select (post_id, user_id, created_at) on public.community_post_likes to authenticated;
grant insert (post_id, user_id) on public.community_post_likes to authenticated;
grant delete on public.community_post_likes to authenticated;

drop policy if exists "Community post likes are publicly readable" on public.community_post_likes;
drop policy if exists "Users can view their own post likes" on public.community_post_likes;
create policy "Users can view their own post likes"
  on public.community_post_likes for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can like posts as themselves" on public.community_post_likes;
create policy "Users can like posts as themselves"
  on public.community_post_likes for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can unlike posts as themselves" on public.community_post_likes;
create policy "Users can unlike posts as themselves"
  on public.community_post_likes for delete
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can view creators they follow" on public.community_follows;
create policy "Users can view creators they follow"
  on public.community_follows for select
  to authenticated
  using ((select auth.uid()) = follower_id);

create or replace function public.get_community_post_like_counts(post_ids uuid[])
returns table (post_id uuid, like_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select likes.post_id, count(*)::bigint
  from public.community_post_likes as likes
  where cardinality(post_ids) <= 50
    and likes.post_id = any(post_ids)
  group by likes.post_id;
$$;

revoke all on function public.get_community_post_like_counts(uuid[]) from public, anon, authenticated;
grant execute on function public.get_community_post_like_counts(uuid[]) to anon, authenticated;

create or replace function public.get_community_follow_counts(profile_id uuid)
returns table (followers bigint, following bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*)::bigint from public.community_follows where creator_id = profile_id),
    (select count(*)::bigint from public.community_follows where follower_id = profile_id);
$$;

revoke all on function public.get_community_follow_counts(uuid) from public, anon, authenticated;
grant execute on function public.get_community_follow_counts(uuid) to anon, authenticated;

create table if not exists public.community_direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  content text not null check (char_length(btrim(content)) between 1 and 2000),
  created_at timestamptz not null default now(),
  constraint community_direct_messages_no_self_message check (sender_id <> recipient_id)
);

create index if not exists community_direct_messages_recipient_created_idx
  on public.community_direct_messages (recipient_id, created_at desc);
create index if not exists community_direct_messages_sender_created_idx
  on public.community_direct_messages (sender_id, created_at desc);

alter table public.community_direct_messages enable row level security;
revoke all on table public.community_direct_messages from anon, authenticated;
grant select (id, sender_id, recipient_id, content, created_at) on public.community_direct_messages to authenticated;
grant insert (sender_id, recipient_id, content) on public.community_direct_messages to authenticated;
grant delete on public.community_direct_messages to authenticated;

drop policy if exists "Users can read messages they sent or received" on public.community_direct_messages;
create policy "Users can read messages they sent or received"
  on public.community_direct_messages for select
  to authenticated
  using ((select auth.uid()) in (sender_id, recipient_id));

drop policy if exists "Users can send messages as themselves" on public.community_direct_messages;
create policy "Users can send messages as themselves"
  on public.community_direct_messages for insert
  to authenticated
  with check (
    (select auth.uid()) = sender_id
    and sender_id <> recipient_id
  );

drop policy if exists "Senders can delete their own messages" on public.community_direct_messages;
create policy "Senders can delete their own messages"
  on public.community_direct_messages for delete
  to authenticated
  using ((select auth.uid()) = sender_id);
