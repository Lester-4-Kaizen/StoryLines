create or replace function public.notify_creator_discussion_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipient_id uuid;
  v_mentioned_user_id uuid;
  v_kind text;
begin
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

    for v_mentioned_user_id in
      select distinct mentioned.id
      from pg_catalog.regexp_matches(new.content, '@([A-Za-z0-9_]{1,30})', 'g') as mention
      join public.profiles as mentioned
        on pg_catalog.lower(mentioned.username) = pg_catalog.lower(mention[1])
      where mentioned.id <> new.author_id
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
    if new.parent_comment_id is not null then
      select parent.author_id into v_recipient_id
      from public.creator_work_discussion_comments as parent
      where parent.id = new.parent_comment_id;
    else
      select work.author_id into v_recipient_id
      from public.creator_works as work
      where work.id = new.work_id;
    end if;

    if v_recipient_id is not null and v_recipient_id <> new.author_id then
      insert into public.user_notifications (
        recipient_id, actor_id, kind, work_discussion_comment_id
      )
      values (v_recipient_id, new.author_id, v_kind, new.id);
    end if;

    for v_mentioned_user_id in
      select distinct mentioned.id
      from pg_catalog.regexp_matches(new.content, '@([A-Za-z0-9_]{1,30})', 'g') as mention
      join public.profiles as mentioned
        on pg_catalog.lower(mentioned.username) = pg_catalog.lower(mention[1])
      where mentioned.id <> new.author_id
        and (v_recipient_id is null or mentioned.id <> v_recipient_id)
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

notify pgrst, 'reload schema';
