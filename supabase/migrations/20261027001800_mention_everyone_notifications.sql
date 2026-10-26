create or replace function public.search_mention_profiles(p_query text)
returns table (
  id uuid,
  display_name text,
  username text,
  avatar_path text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_query text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_query, '')));
begin
  if auth.uid() is null or pg_catalog.char_length(v_query) > 30 then
    return;
  end if;

  if v_query = '' then
    return query
      select profile.id, profile.display_name, profile.username, profile.avatar_path
      from public.community_follows as followed
      join public.profiles as profile on profile.id = followed.creator_id
      where followed.follower_id = (select auth.uid())
        and profile.staff_role is null
      order by followed.created_at desc, pg_catalog.lower(profile.username)
      limit 6;
  else
    return query
      select profile.id, profile.display_name, profile.username, profile.avatar_path
      from public.profiles as profile
      where profile.id <> (select auth.uid())
        and profile.staff_role is null
        and pg_catalog.lower(profile.username) <> 'everyone'
        and pg_catalog.left(pg_catalog.lower(profile.username), pg_catalog.char_length(v_query)) = v_query
      order by pg_catalog.lower(profile.username)
      limit 6;
  end if;
end;
$$;

revoke all on function public.search_mention_profiles(text)
  from public, anon, authenticated;
grant execute on function public.search_mention_profiles(text)
  to authenticated;

create or replace function public.notify_community_mentions(
  p_actor_id uuid,
  p_content text,
  p_post_id uuid,
  p_comment_id uuid
)
returns void
language sql
security definer
set search_path = ''
as $$
  with recipients as (
    select mentioned.id as recipient_id
    from pg_catalog.regexp_matches(p_content, '@([A-Za-z0-9_]{1,30})', 'g') as mention
    join public.profiles as mentioned
      on pg_catalog.lower(mentioned.username) = pg_catalog.lower(mention[1])
    where mentioned.id <> p_actor_id
      and pg_catalog.lower(mention[1]) <> 'everyone'

    union

    select followed.follower_id
    from public.community_follows as followed
    join public.profiles as follower on follower.id = followed.follower_id
    where followed.creator_id = p_actor_id
      and followed.follower_id <> p_actor_id
      and follower.staff_role is null
      and p_content ~* '(^|[^A-Za-z0-9_])@everyone([^A-Za-z0-9_]|$)'
  )
  insert into public.user_notifications (
    recipient_id, actor_id, kind, post_id, comment_id
  )
  select recipient_id, p_actor_id, 'mention', p_post_id, p_comment_id
  from recipients;
$$;

revoke all on function public.notify_community_mentions(uuid, text, uuid, uuid)
  from public, anon, authenticated;

create or replace function public.notify_creator_discussion_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipient_id uuid;
  v_work_author_id uuid;
  v_parent_author_id uuid;
  v_mentioned_user_id uuid;
  v_kind text;
  v_mentions_everyone boolean;
begin
  v_mentions_everyone := new.content ~* '(^|[^A-Za-z0-9_])@everyone([^A-Za-z0-9_]|$)';

  if tg_table_name = 'creator_chapter_comments' then
    v_kind := case when new.parent_comment_id is null
      then 'chapter_comment'
      else 'chapter_comment_reply'
    end;
    if new.parent_comment_id is not null then
      select parent.author_id into v_recipient_id
      from public.creator_chapter_comments as parent
      where parent.id = new.parent_comment_id;
    else
      select work.author_id into v_recipient_id
      from public.creator_work_chapters as chapter
      join public.creator_works as work on work.id = chapter.work_id
      where chapter.id = new.chapter_id;
    end if;

    if v_recipient_id is not null and v_recipient_id <> new.author_id then
      insert into public.user_notifications (
        recipient_id, actor_id, kind, chapter_comment_id
      )
      values (v_recipient_id, new.author_id, v_kind, new.id);
    end if;

    if v_mentions_everyone then
      insert into public.user_notifications (
        recipient_id, actor_id, kind, chapter_comment_id
      )
      select followed.follower_id, new.author_id, 'mention', new.id
      from public.community_follows as followed
      join public.profiles as follower on follower.id = followed.follower_id
      where followed.creator_id = new.author_id
        and followed.follower_id <> new.author_id
        and follower.staff_role is null
        and followed.follower_id is distinct from v_recipient_id;
    end if;

    for v_mentioned_user_id in
      select distinct mentioned.id
      from pg_catalog.regexp_matches(new.content, '@([A-Za-z0-9_]{1,30})', 'g') as mention
      join public.profiles as mentioned
        on pg_catalog.lower(mentioned.username) = pg_catalog.lower(mention[1])
      where mentioned.id <> new.author_id
        and pg_catalog.lower(mention[1]) <> 'everyone'
        and (v_recipient_id is null or mentioned.id <> v_recipient_id)
    loop
      insert into public.user_notifications (
        recipient_id, actor_id, kind, chapter_comment_id
      )
      values (v_mentioned_user_id, new.author_id, 'mention', new.id);
    end loop;
  else
    v_kind := case when new.parent_comment_id is null
      then 'work_comment'
      else 'work_comment_reply'
    end;

    select work.author_id into v_work_author_id
    from public.creator_works as work
    where work.id = new.work_id;

    if new.parent_comment_id is not null then
      select parent.author_id into v_parent_author_id
      from public.creator_work_discussion_comments as parent
      where parent.id = new.parent_comment_id;
    end if;

    if v_work_author_id is not null and v_work_author_id <> new.author_id then
      insert into public.user_notifications (
        recipient_id, actor_id, kind, work_discussion_comment_id
      )
      values (v_work_author_id, new.author_id, v_kind, new.id);
    end if;

    if v_parent_author_id is not null
      and v_parent_author_id <> new.author_id
      and v_parent_author_id is distinct from v_work_author_id
    then
      insert into public.user_notifications (
        recipient_id, actor_id, kind, work_discussion_comment_id
      )
      values (v_parent_author_id, new.author_id, v_kind, new.id);
    end if;

    if v_mentions_everyone then
      insert into public.user_notifications (
        recipient_id, actor_id, kind, work_discussion_comment_id
      )
      select followed.follower_id, new.author_id, 'mention', new.id
      from public.community_follows as followed
      join public.profiles as follower on follower.id = followed.follower_id
      where followed.creator_id = new.author_id
        and followed.follower_id <> new.author_id
        and follower.staff_role is null
        and followed.follower_id is distinct from v_work_author_id
        and followed.follower_id is distinct from v_parent_author_id;
    end if;

    for v_mentioned_user_id in
      select distinct mentioned.id
      from pg_catalog.regexp_matches(new.content, '@([A-Za-z0-9_]{1,30})', 'g') as mention
      join public.profiles as mentioned
        on pg_catalog.lower(mentioned.username) = pg_catalog.lower(mention[1])
      where mentioned.id <> new.author_id
        and pg_catalog.lower(mention[1]) <> 'everyone'
        and (v_work_author_id is null or mentioned.id <> v_work_author_id)
        and (v_parent_author_id is null or mentioned.id <> v_parent_author_id)
    loop
      insert into public.user_notifications (
        recipient_id, actor_id, kind, work_discussion_comment_id
      )
      values (v_mentioned_user_id, new.author_id, 'mention', new.id);
    end loop;
  end if;

  return new;
end;
$$;

revoke all on function public.notify_creator_discussion_comment()
  from public, anon, authenticated;

drop trigger if exists creator_chapter_comment_notification
  on public.creator_chapter_comments;
create trigger creator_chapter_comment_notification
  after insert on public.creator_chapter_comments
  for each row execute function public.notify_creator_discussion_comment();

drop trigger if exists creator_work_discussion_comment_notification
  on public.creator_work_discussion_comments;
create trigger creator_work_discussion_comment_notification
  after insert on public.creator_work_discussion_comments
  for each row execute function public.notify_creator_discussion_comment();

notify pgrst, 'reload schema';
