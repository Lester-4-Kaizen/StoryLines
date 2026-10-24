alter table public.profiles
  add column if not exists profile_banner_path text,
  add column if not exists profile_banner_scale smallint not null default 100,
  add column if not exists profile_banner_width smallint not null default 125,
  add column if not exists profile_banner_position smallint not null default 50;

alter table public.profiles
  drop constraint if exists profiles_profile_banner_path_valid,
  add constraint profiles_profile_banner_path_valid check (
    profile_banner_path is null
    or (
      char_length(profile_banner_path) <= 256
      and split_part(profile_banner_path, '/', 1) = id::text
      and split_part(profile_banner_path, '/', 2) <> ''
      and split_part(profile_banner_path, '/', 3) = ''
    )
  ),
  drop constraint if exists profiles_profile_banner_scale_valid,
  add constraint profiles_profile_banner_scale_valid check (
    profile_banner_scale between 100 and 200
  ),
  drop constraint if exists profiles_profile_banner_width_valid,
  add constraint profiles_profile_banner_width_valid check (
    profile_banner_width between 100 and 200
  ),
  drop constraint if exists profiles_profile_banner_position_valid,
  add constraint profiles_profile_banner_position_valid check (
    profile_banner_position between 0 and 100
  );

grant select (profile_banner_path, profile_banner_scale, profile_banner_width, profile_banner_position)
  on public.profiles to anon, authenticated;
grant update (profile_banner_path, profile_banner_scale, profile_banner_width, profile_banner_position)
  on public.profiles to authenticated;

grant select (id, recipient_id, is_deleted, read_at)
  on public.community_direct_messages to authenticated;

drop policy if exists "Users can read messages they sent or received"
  on public.community_direct_messages;
create policy "Users can read messages they sent or received"
  on public.community_direct_messages for select
  to authenticated
  using ((select auth.uid()) in (sender_id, recipient_id));

grant select (id, post_id, author_id, content, created_at, parent_comment_id)
  on public.community_post_comments to anon, authenticated;

drop policy if exists "Community post comments are publicly readable"
  on public.community_post_comments;
create policy "Community post comments are publicly readable"
  on public.community_post_comments for select
  to anon, authenticated
  using (true);

grant select (message_id, user_id, reaction)
  on public.community_message_reactions to authenticated;

drop policy if exists "Participants can read message reactions"
  on public.community_message_reactions;
create policy "Participants can read message reactions"
  on public.community_message_reactions for select
  to authenticated
  using (
    exists (
      select 1
      from public.community_direct_messages as message
      where message.id = message_id
        and (select auth.uid()) in (message.sender_id, message.recipient_id)
    )
  );

create or replace function public.reset_my_account_data()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'An authenticated user is required to reset account data.'
      using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.profiles where id = current_user_id
  ) then
    raise exception 'The profile to reset does not exist.'
      using errcode = 'P0002';
  end if;

  delete from public.user_notifications
  where recipient_id = current_user_id or actor_id = current_user_id;
  delete from public.community_comment_reactions
  where user_id = current_user_id;
  delete from public.creator_chapter_comment_reactions
  where user_id = current_user_id;
  delete from public.creator_chapter_comments
  where author_id = current_user_id;
  delete from public.community_post_comments
  where author_id = current_user_id;
  delete from public.community_post_likes
  where user_id = current_user_id;
  delete from public.community_saved_posts
  where user_id = current_user_id;
  delete from public.community_follows
  where follower_id = current_user_id or creator_id = current_user_id;
  delete from public.community_direct_messages
  where sender_id = current_user_id or recipient_id = current_user_id;
  delete from public.library_reading_progress
  where user_id = current_user_id;
  delete from public.library_saved_works
  where user_id = current_user_id;
  delete from public.creator_work_likes
  where user_id = current_user_id;
  delete from public.creator_work_views
  where viewer_id = current_user_id;
  delete from public.community_posts
  where author_id = current_user_id;
  delete from public.creator_works
  where author_id = current_user_id;

  update public.profiles
  set
    roles = array['reader']::text[],
    bio = '',
    writing_languages = '{}'::text[],
    favorite_genres = '{}'::text[],
    facebook_url = null,
    instagram_url = null,
    portfolio_url = null,
    open_for_collaboration = false,
    collaboration_roles = '{}'::text[],
    avatar_path = null,
    profile_banner_path = null,
    profile_banner_scale = 100,
    profile_banner_width = 125,
    profile_banner_position = 50
  where id = current_user_id;
end;
$$;

revoke all on function public.reset_my_account_data() from public, anon, authenticated;
grant execute on function public.reset_my_account_data() to authenticated;
