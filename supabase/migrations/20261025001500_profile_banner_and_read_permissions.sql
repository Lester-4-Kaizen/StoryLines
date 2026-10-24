alter table public.profiles
  add column if not exists profile_banner_width smallint not null default 125,
  add column if not exists profile_banner_position smallint not null default 50;

alter table public.profiles
  drop constraint if exists profiles_profile_banner_width_valid,
  add constraint profiles_profile_banner_width_valid check (
    profile_banner_width between 100 and 200
  ),
  drop constraint if exists profiles_profile_banner_position_valid,
  add constraint profiles_profile_banner_position_valid check (
    profile_banner_position between 0 and 100
  );

grant select (profile_banner_width, profile_banner_position)
  on public.profiles to anon, authenticated;
grant update (profile_banner_width, profile_banner_position)
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
