create or replace function public.is_community_account_blocked_for_current_user(p_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.community_message_account_controls as controls
      where controls.status = 'blocked'
        and (
          (controls.owner_id = (select auth.uid()) and controls.account_id = p_account_id)
          or (controls.owner_id = p_account_id and controls.account_id = (select auth.uid()))
        )
    );
$$;

revoke all on function public.is_community_account_blocked_for_current_user(uuid) from public, anon, authenticated;
grant execute on function public.is_community_account_blocked_for_current_user(uuid) to authenticated;

create or replace function public.community_accounts_have_blocked_relationship(
  p_first_account_id uuid,
  p_second_account_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_first_account_id is not null
    and p_second_account_id is not null
    and (select auth.uid()) in (p_first_account_id, p_second_account_id)
    and exists (
      select 1
      from public.community_message_account_controls as controls
      where controls.status = 'blocked'
        and (
          (controls.owner_id = p_first_account_id and controls.account_id = p_second_account_id)
          or (controls.owner_id = p_second_account_id and controls.account_id = p_first_account_id)
        )
    );
$$;

revoke all on function public.community_accounts_have_blocked_relationship(uuid, uuid) from public, anon, authenticated;
grant execute on function public.community_accounts_have_blocked_relationship(uuid, uuid) to authenticated;

create or replace function public.is_community_work_blocked_for_current_user(p_work_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.creator_works as work
    where work.id = p_work_id
      and public.is_community_account_blocked_for_current_user(work.author_id)
  );
$$;

revoke all on function public.is_community_work_blocked_for_current_user(uuid) from public, anon, authenticated;
grant execute on function public.is_community_work_blocked_for_current_user(uuid) to authenticated;

create or replace function public.remove_follows_when_account_blocked()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'blocked'
    and (tg_op = 'INSERT' or old.status is distinct from new.status)
  then
    delete from public.community_follows as follows
    where (follows.follower_id = new.owner_id and follows.creator_id = new.account_id)
      or (follows.follower_id = new.account_id and follows.creator_id = new.owner_id);
  end if;
  return new;
end;
$$;

revoke all on function public.remove_follows_when_account_blocked() from public, anon, authenticated;

drop trigger if exists community_message_account_controls_remove_follows
  on public.community_message_account_controls;
create trigger community_message_account_controls_remove_follows
  after insert or update on public.community_message_account_controls
  for each row execute function public.remove_follows_when_account_blocked();

drop policy if exists community_block_profile_visibility on public.profiles;
create policy community_block_profile_visibility
  on public.profiles as restrictive for select to authenticated
  using (
    id = (select auth.uid())
    or not public.is_community_account_blocked_for_current_user(id)
  );

drop policy if exists community_block_work_visibility on public.creator_works;
create policy community_block_work_visibility
  on public.creator_works as restrictive for select to authenticated
  using (not public.is_community_account_blocked_for_current_user(author_id));

drop policy if exists community_block_post_visibility on public.community_posts;
create policy community_block_post_visibility
  on public.community_posts as restrictive for select to authenticated
  using (not public.is_community_account_blocked_for_current_user(author_id));

drop policy if exists community_block_post_comment_visibility on public.community_post_comments;
create policy community_block_post_comment_visibility
  on public.community_post_comments as restrictive for select to authenticated
  using (
    not public.is_community_account_blocked_for_current_user(author_id)
    and exists (
      select 1
      from public.community_posts as post
      where post.id = post_id
    )
  );

drop policy if exists community_block_chapter_visibility on public.creator_work_chapters;
create policy community_block_chapter_visibility
  on public.creator_work_chapters as restrictive for select to authenticated
  using (not public.is_community_work_blocked_for_current_user(work_id));

drop policy if exists community_block_comic_page_visibility on public.creator_comic_pages;
create policy community_block_comic_page_visibility
  on public.creator_comic_pages as restrictive for select to authenticated
  using (not public.is_community_work_blocked_for_current_user(work_id));

drop policy if exists community_block_chapter_comment_visibility on public.creator_chapter_comments;
create policy community_block_chapter_comment_visibility
  on public.creator_chapter_comments as restrictive for select to authenticated
  using (
    not public.is_community_account_blocked_for_current_user(author_id)
    and exists (
      select 1
      from public.creator_work_chapters as chapter
      where chapter.id = chapter_id
    )
  );

drop policy if exists community_block_follow_visibility on public.community_follows;
create policy community_block_follow_visibility
  on public.community_follows as restrictive for select to authenticated
  using (
    not public.is_community_account_blocked_for_current_user(creator_id)
    and not public.is_community_account_blocked_for_current_user(follower_id)
  );

drop policy if exists community_block_follow_insert on public.community_follows;
create policy community_block_follow_insert
  on public.community_follows as restrictive for insert to authenticated
  with check (
    not public.community_accounts_have_blocked_relationship(
      follower_id,
      creator_id
    )
  );

drop policy if exists community_block_message_visibility on public.community_direct_messages;
create policy community_block_message_visibility
  on public.community_direct_messages as restrictive for select to authenticated
  using (
    not public.is_community_account_blocked_for_current_user(
      case
        when sender_id = (select auth.uid()) then recipient_id
        else sender_id
      end
    )
  );

drop policy if exists community_block_request_visibility on public.community_message_requests;
create policy community_block_request_visibility
  on public.community_message_requests as restrictive for select to authenticated
  using (
    not public.is_community_account_blocked_for_current_user(sender_id)
    and not public.is_community_account_blocked_for_current_user(recipient_id)
  );

drop policy if exists community_block_notification_visibility on public.user_notifications;
create policy community_block_notification_visibility
  on public.user_notifications as restrictive for select to authenticated
  using (not public.is_community_account_blocked_for_current_user(actor_id));

create or replace function public.get_my_blocked_accounts()
returns table (account_id uuid, display_name text, username text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select profile.id, profile.display_name, profile.username, controls.created_at
  from public.community_message_account_controls as controls
  join public.profiles as profile on profile.id = controls.account_id
  where controls.owner_id = (select auth.uid())
    and controls.status = 'blocked'
  order by controls.created_at desc, profile.id;
$$;

revoke all on function public.get_my_blocked_accounts() from public, anon, authenticated;
grant execute on function public.get_my_blocked_accounts() to authenticated;

create or replace function public.get_community_connections(
  p_profile_id uuid,
  p_direction text,
  p_cursor_created_at timestamptz default null,
  p_cursor_profile_id uuid default null,
  p_page_size integer default 20
)
returns table (
  profile_id uuid,
  display_name text,
  username text,
  avatar_path text,
  followed_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    connected_profile.id,
    connected_profile.display_name,
    connected_profile.username,
    connected_profile.avatar_path,
    follows.created_at
  from public.community_follows as follows
  join public.profiles as connected_profile
    on connected_profile.id = case
      when p_direction = 'followers' then follows.follower_id
      else follows.creator_id
    end
  where p_direction in ('followers', 'following')
    and not public.is_community_account_blocked_for_current_user(p_profile_id)
    and not public.is_community_account_blocked_for_current_user(connected_profile.id)
    and (
      (p_direction = 'followers' and follows.creator_id = p_profile_id)
      or (p_direction = 'following' and follows.follower_id = p_profile_id)
    )
    and (
      (p_cursor_created_at is null and p_cursor_profile_id is null)
      or (
        p_cursor_created_at is not null
        and p_cursor_profile_id is not null
        and (follows.created_at, connected_profile.id) < (p_cursor_created_at, p_cursor_profile_id)
      )
    )
  order by follows.created_at desc, connected_profile.id desc
  limit greatest(1, least(coalesce(p_page_size, 20), 21));
$$;

revoke all on function public.get_community_connections(uuid, text, timestamptz, uuid, integer) from public, anon, authenticated;
grant execute on function public.get_community_connections(uuid, text, timestamptz, uuid, integer) to anon, authenticated;

create table if not exists public.community_shared_conversation_preferences (
  user_low_id uuid not null references public.profiles (id) on delete cascade,
  user_high_id uuid not null references public.profiles (id) on delete cascade,
  bubble_color text not null default 'espresso'
    check (bubble_color in ('espresso', 'rust', 'chestnut', 'amber', 'sage', 'blue', 'plum', 'pink')),
  chat_background text not null default 'paper'
    check (chat_background in ('paper', 'sepia', 'night', 'plain')),
  nickname_low text not null default '' check (char_length(nickname_low) <= 40),
  nickname_high text not null default '' check (char_length(nickname_high) <= 40),
  quick_reaction text not null default '❤️'
    check (quick_reaction in ('❤️', '😂', '😮', '😢', '👍', '🔥')),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default pg_catalog.now(),
  primary key (user_low_id, user_high_id),
  constraint community_shared_conversation_preferences_order check (user_low_id < user_high_id)
);

alter table public.community_shared_conversation_preferences enable row level security;
revoke all on table public.community_shared_conversation_preferences from public, anon, authenticated;
grant select (
  user_low_id, user_high_id, bubble_color, chat_background,
  nickname_low, nickname_high, quick_reaction, updated_by, updated_at
) on public.community_shared_conversation_preferences to authenticated;

drop policy if exists "Participants can read shared conversation preferences"
  on public.community_shared_conversation_preferences;
create policy "Participants can read shared conversation preferences"
  on public.community_shared_conversation_preferences for select
  to authenticated
  using (
    (select auth.uid()) in (user_low_id, user_high_id)
    and not public.community_accounts_have_blocked_relationship(user_low_id, user_high_id)
  );

create table if not exists public.community_conversation_updates (
  id uuid primary key default gen_random_uuid(),
  user_low_id uuid not null references public.profiles (id) on delete cascade,
  user_high_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  preference_key text not null
    check (preference_key in ('bubble_color', 'chat_background', 'nickname', 'quick_reaction')),
  preference_value text not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint community_conversation_updates_order check (user_low_id < user_high_id)
);

create index if not exists community_conversation_updates_pair_created_idx
  on public.community_conversation_updates (user_low_id, user_high_id, created_at desc, id desc);

alter table public.community_conversation_updates enable row level security;
revoke all on table public.community_conversation_updates from public, anon, authenticated;
grant select (id, user_low_id, user_high_id, actor_id, preference_key, preference_value, created_at)
  on public.community_conversation_updates to authenticated;

drop policy if exists "Participants can read conversation updates"
  on public.community_conversation_updates;
create policy "Participants can read conversation updates"
  on public.community_conversation_updates for select
  to authenticated
  using (
    (select auth.uid()) in (user_low_id, user_high_id)
    and not public.community_accounts_have_blocked_relationship(user_low_id, user_high_id)
  );

create or replace function public.log_shared_conversation_preference_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.bubble_color is distinct from new.bubble_color then
    insert into public.community_conversation_updates (
      user_low_id, user_high_id, actor_id, preference_key, preference_value
    ) values (
      new.user_low_id, new.user_high_id, new.updated_by, 'bubble_color', new.bubble_color
    );
  end if;
  if old.chat_background is distinct from new.chat_background then
    insert into public.community_conversation_updates (
      user_low_id, user_high_id, actor_id, preference_key, preference_value
    ) values (
      new.user_low_id, new.user_high_id, new.updated_by, 'chat_background', new.chat_background
    );
  end if;
  if old.nickname_low is distinct from new.nickname_low
    or old.nickname_high is distinct from new.nickname_high
  then
    insert into public.community_conversation_updates (
      user_low_id, user_high_id, actor_id, preference_key, preference_value
    ) values (
      new.user_low_id,
      new.user_high_id,
      new.updated_by,
      'nickname',
      case
        when old.nickname_low is distinct from new.nickname_low then new.nickname_low
        else new.nickname_high
      end
    );
  end if;
  if old.quick_reaction is distinct from new.quick_reaction then
    insert into public.community_conversation_updates (
      user_low_id, user_high_id, actor_id, preference_key, preference_value
    ) values (
      new.user_low_id, new.user_high_id, new.updated_by, 'quick_reaction', new.quick_reaction
    );
  end if;
  return new;
end;
$$;

revoke all on function public.log_shared_conversation_preference_update() from public, anon, authenticated;

drop trigger if exists community_shared_conversation_preference_update_log
  on public.community_shared_conversation_preferences;
create trigger community_shared_conversation_preference_update_log
  after update on public.community_shared_conversation_preferences
  for each row execute function public.log_shared_conversation_preference_update();

insert into public.community_shared_conversation_preferences (
  user_low_id,
  user_high_id,
  bubble_color,
  chat_background,
  nickname_low,
  nickname_high,
  quick_reaction,
  updated_by,
  updated_at
)
select distinct on (least(preferences.user_id, preferences.partner_id), greatest(preferences.user_id, preferences.partner_id))
  least(preferences.user_id, preferences.partner_id),
  greatest(preferences.user_id, preferences.partner_id),
  preferences.bubble_color,
  preferences.chat_background,
  case
    when preferences.user_id = least(preferences.user_id, preferences.partner_id)
      then preferences.nickname_self
    else preferences.nickname_partner
  end,
  case
    when preferences.user_id = greatest(preferences.user_id, preferences.partner_id)
      then preferences.nickname_self
    else preferences.nickname_partner
  end,
  preferences.quick_reaction,
  preferences.user_id,
  preferences.updated_at
from public.community_conversation_preferences as preferences
where preferences.user_id <> preferences.partner_id
order by
  least(preferences.user_id, preferences.partner_id),
  greatest(preferences.user_id, preferences.partner_id),
  preferences.updated_at desc,
  preferences.user_id
on conflict (user_low_id, user_high_id) do nothing;

create or replace function public.set_community_shared_conversation_preference(
  p_partner_id uuid,
  p_key text,
  p_value text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_low_id uuid;
  v_high_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  if p_partner_id is null or p_partner_id = v_user_id then
    raise exception using errcode = '22023', message = 'A different conversation partner is required.';
  end if;
  if public.community_accounts_have_blocked_relationship(v_user_id, p_partner_id) then
    raise exception using errcode = '42501', message = 'Chat customization is unavailable for blocked accounts.';
  end if;
  if p_key is null
    or p_key not in ('bubble_color', 'chat_background', 'nickname_self', 'nickname_partner', 'quick_reaction')
  then
    raise exception using errcode = '22023', message = 'Invalid shared chat preference.';
  end if;
  if p_value is null then
    raise exception using errcode = '22023', message = 'A preference value is required.';
  end if;
  if p_key = 'bubble_color' and p_value not in ('espresso', 'rust', 'chestnut', 'amber', 'sage', 'blue', 'plum', 'pink') then
    raise exception using errcode = '22023', message = 'Invalid bubble color.';
  end if;
  if p_key = 'chat_background' and p_value not in ('paper', 'sepia', 'night', 'plain') then
    raise exception using errcode = '22023', message = 'Invalid chat background.';
  end if;
  if p_key = 'quick_reaction' and p_value not in ('❤️', '😂', '😮', '😢', '👍', '🔥') then
    raise exception using errcode = '22023', message = 'Invalid quick reaction.';
  end if;
  if p_key in ('nickname_self', 'nickname_partner') and char_length(p_value) > 40 then
    raise exception using errcode = '22023', message = 'Nicknames cannot exceed 40 characters.';
  end if;

  v_low_id := least(v_user_id, p_partner_id);
  v_high_id := greatest(v_user_id, p_partner_id);

  insert into public.community_shared_conversation_preferences (user_low_id, user_high_id)
  values (v_low_id, v_high_id)
  on conflict (user_low_id, user_high_id) do nothing;

  update public.community_shared_conversation_preferences as preferences
  set bubble_color = case when p_key = 'bubble_color' then p_value else preferences.bubble_color end,
      chat_background = case when p_key = 'chat_background' then p_value else preferences.chat_background end,
      nickname_low = case
        when p_key = 'nickname_self' and v_user_id = v_low_id then p_value
        when p_key = 'nickname_partner' and v_user_id = v_high_id then p_value
        else preferences.nickname_low
      end,
      nickname_high = case
        when p_key = 'nickname_self' and v_user_id = v_high_id then p_value
        when p_key = 'nickname_partner' and v_user_id = v_low_id then p_value
        else preferences.nickname_high
      end,
      quick_reaction = case when p_key = 'quick_reaction' then p_value else preferences.quick_reaction end,
      updated_by = v_user_id,
      updated_at = pg_catalog.now()
  where preferences.user_low_id = v_low_id
    and preferences.user_high_id = v_high_id;
end;
$$;

revoke all on function public.set_community_shared_conversation_preference(uuid, text, text) from public, anon, authenticated;
grant execute on function public.set_community_shared_conversation_preference(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
