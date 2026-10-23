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

  delete from public.community_post_comments
  where author_id = current_user_id;
  delete from public.community_post_likes
  where user_id = current_user_id;
  delete from public.community_saved_posts
  where user_id = current_user_id;
  delete from public.community_follows
  where follower_id = current_user_id
    or creator_id = current_user_id;
  delete from public.community_direct_messages
  where sender_id = current_user_id
    or recipient_id = current_user_id;
  delete from public.library_reading_progress
  where user_id = current_user_id;
  delete from public.library_saved_works
  where user_id = current_user_id;
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
    avatar_path = null
  where id = current_user_id;
end;
$$;

revoke all on function public.reset_my_account_data() from public, anon, authenticated;
grant execute on function public.reset_my_account_data() to authenticated;
