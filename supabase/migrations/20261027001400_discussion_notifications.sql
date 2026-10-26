alter table public.user_notifications
  drop constraint if exists user_notifications_kind_check,
  add constraint user_notifications_kind_check check (
    kind in (
      'follow',
      'post_like',
      'comment',
      'comment_reply',
      'comment_reaction',
      'message',
      'mention',
      'collaboration_proposal',
      'moderation_outcome',
      'chapter_comment',
      'chapter_comment_reply',
      'work_comment',
      'work_comment_reply'
    )
  ),
  add column if not exists chapter_comment_id uuid
    references public.creator_chapter_comments (id) on delete cascade,
  add column if not exists work_discussion_comment_id uuid
    references public.creator_work_discussion_comments (id) on delete cascade;

grant select (chapter_comment_id, work_discussion_comment_id)
  on public.user_notifications to authenticated;

create or replace function public.notify_creator_discussion_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipient_id uuid;
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
