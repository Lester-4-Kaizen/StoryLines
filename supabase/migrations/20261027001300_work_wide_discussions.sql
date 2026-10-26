create table if not exists public.creator_work_discussion_comments (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.creator_works (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  parent_comment_id uuid references public.creator_work_discussion_comments (id) on delete cascade,
  content text not null check (char_length(btrim(content)) between 1 and 500),
  is_hidden boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists creator_work_discussion_comments_work_idx
  on public.creator_work_discussion_comments (work_id, created_at desc, id);
create index if not exists creator_work_discussion_comments_author_idx
  on public.creator_work_discussion_comments (author_id, created_at desc);

alter table public.creator_work_discussion_comments enable row level security;
revoke all on table public.creator_work_discussion_comments from anon, authenticated;
grant select (id, work_id, author_id, parent_comment_id, content, created_at)
  on public.creator_work_discussion_comments to anon, authenticated;
grant insert (work_id, author_id, parent_comment_id, content)
  on public.creator_work_discussion_comments to authenticated;
grant delete on public.creator_work_discussion_comments to authenticated;

create or replace function public.work_discussion_parent_matches(
  p_parent_comment_id uuid,
  p_work_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.creator_work_discussion_comments as parent
    where parent.id = p_parent_comment_id
      and parent.work_id = p_work_id
  );
$$;

revoke all on function public.work_discussion_parent_matches(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.work_discussion_parent_matches(uuid, uuid)
  to authenticated;

drop policy if exists "Published work discussion comments are readable"
  on public.creator_work_discussion_comments;
create policy "Published work discussion comments are readable"
  on public.creator_work_discussion_comments for select
  to anon, authenticated
  using (
    (not is_hidden or author_id = (select auth.uid()))
    and exists (
      select 1
      from public.creator_works as work
      where work.id = creator_work_discussion_comments.work_id
        and work.status <> 'Draft'
        and not work.is_hidden
    )
  );

drop policy if exists "Authenticated users can comment on published works"
  on public.creator_work_discussion_comments;
create policy "Authenticated users can comment on published works"
  on public.creator_work_discussion_comments for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and public.moderation_account_is_active()
    and exists (
      select 1
      from public.creator_works as work
      where work.id = creator_work_discussion_comments.work_id
        and work.status <> 'Draft'
        and not work.is_hidden
        and not public.community_accounts_have_blocked_relationship(
          (select auth.uid()),
          work.author_id
        )
    )
    and (
      parent_comment_id is null
      or public.work_discussion_parent_matches(parent_comment_id, work_id)
    )
  );

drop policy if exists "Authors can delete their own work discussion comments"
  on public.creator_work_discussion_comments;
create policy "Authors can delete their own work discussion comments"
  on public.creator_work_discussion_comments for delete
  to authenticated
  using (author_id = (select auth.uid()));

create table if not exists public.creator_work_discussion_comment_reactions (
  comment_id uuid not null references public.creator_work_discussion_comments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  reaction text not null check (reaction in ('like', 'dislike')),
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create index if not exists creator_work_discussion_comment_reactions_user_idx
  on public.creator_work_discussion_comment_reactions (user_id, comment_id);

alter table public.creator_work_discussion_comment_reactions enable row level security;
revoke all on table public.creator_work_discussion_comment_reactions from public, anon, authenticated;
grant select (comment_id, user_id, reaction)
  on public.creator_work_discussion_comment_reactions to authenticated;
grant insert (comment_id, user_id, reaction)
  on public.creator_work_discussion_comment_reactions to authenticated;
grant update (reaction)
  on public.creator_work_discussion_comment_reactions to authenticated;
grant delete on public.creator_work_discussion_comment_reactions to authenticated;

drop policy if exists "Users can read their work discussion reactions"
  on public.creator_work_discussion_comment_reactions;
create policy "Users can read their work discussion reactions"
  on public.creator_work_discussion_comment_reactions for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users can react to published work discussion comments"
  on public.creator_work_discussion_comment_reactions;
create policy "Users can react to published work discussion comments"
  on public.creator_work_discussion_comment_reactions for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and public.moderation_account_is_active()
    and exists (
      select 1
      from public.creator_work_discussion_comments as comment
      join public.creator_works as work on work.id = comment.work_id
      where comment.id = creator_work_discussion_comment_reactions.comment_id
        and not comment.is_hidden
        and work.status <> 'Draft'
        and not work.is_hidden
        and not public.community_accounts_have_blocked_relationship(
          (select auth.uid()),
          work.author_id
        )
    )
  );

drop policy if exists "Users can update their work discussion reactions"
  on public.creator_work_discussion_comment_reactions;
create policy "Users can update their work discussion reactions"
  on public.creator_work_discussion_comment_reactions for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Users can remove their work discussion reactions"
  on public.creator_work_discussion_comment_reactions;
create policy "Users can remove their work discussion reactions"
  on public.creator_work_discussion_comment_reactions for delete
  to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.get_creator_work_discussion_comment_reaction_counts(p_comment_ids uuid[])
returns table (comment_id uuid, likes bigint, dislikes bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    reactions.comment_id,
    count(*) filter (where reactions.reaction = 'like')::bigint,
    count(*) filter (where reactions.reaction = 'dislike')::bigint
  from public.creator_work_discussion_comment_reactions as reactions
  join public.creator_work_discussion_comments as comments on comments.id = reactions.comment_id
  join public.creator_works as work on work.id = comments.work_id
  where cardinality(p_comment_ids) <= 100
    and reactions.comment_id = any(p_comment_ids)
    and not comments.is_hidden
    and work.status <> 'Draft'
    and not work.is_hidden
  group by reactions.comment_id;
$$;

revoke all on function public.get_creator_work_discussion_comment_reaction_counts(uuid[])
  from public, anon, authenticated;
grant execute on function public.get_creator_work_discussion_comment_reaction_counts(uuid[])
  to anon, authenticated;

alter table public.community_content_reports
  drop constraint if exists community_content_reports_target_type_check,
  add constraint community_content_reports_target_type_check
    check (target_type in ('post', 'comment', 'chapter_comment', 'work_comment', 'work', 'profile'));

create or replace function public.submit_community_content_report(
  p_target_type text,
  p_target_id uuid,
  p_reason text,
  p_note text default '',
  p_block_reported boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reporter_id uuid := (select auth.uid());
  v_reported_user_id uuid;
  v_recent_reports bigint;
begin
  if v_reporter_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  if p_target_id is null
    or p_target_type not in ('post', 'comment', 'chapter_comment', 'work_comment', 'work', 'profile')
    or p_reason not in (
      'spam_scam',
      'harassment_bullying',
      'hate_speech',
      'sexual_graphic_content',
      'violence_self_harm',
      'copied_stolen_work',
      'something_else'
    )
    or char_length(coalesce(p_note, '')) > 1000
  then
    raise exception using errcode = '22023', message = 'Invalid report details.';
  end if;

  case p_target_type
    when 'post' then
      select post.author_id into v_reported_user_id
      from public.community_posts as post where post.id = p_target_id;
    when 'comment' then
      select comment.author_id into v_reported_user_id
      from public.community_post_comments as comment where comment.id = p_target_id;
    when 'chapter_comment' then
      select comment.author_id into v_reported_user_id
      from public.creator_chapter_comments as comment where comment.id = p_target_id;
    when 'work_comment' then
      select comment.author_id into v_reported_user_id
      from public.creator_work_discussion_comments as comment where comment.id = p_target_id;
    when 'work' then
      select work.author_id into v_reported_user_id
      from public.creator_works as work where work.id = p_target_id;
    when 'profile' then
      select profile.id into v_reported_user_id
      from public.profiles as profile where profile.id = p_target_id;
  end case;

  if v_reported_user_id is null then
    raise exception using errcode = '22023', message = 'The reported content could not be found.';
  end if;
  if v_reported_user_id = v_reporter_id then
    raise exception using errcode = '22023', message = 'You cannot report your own content.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_reporter_id::text, 0)
  );

  select count(*) into v_recent_reports
  from public.community_content_reports as report
  where report.reporter_id = v_reporter_id
    and report.created_at > pg_catalog.now() - interval '1 hour';
  if v_recent_reports >= 5 then
    raise exception using errcode = '22023', message = 'You have reached the report limit. Please try again later.';
  end if;

  insert into public.community_content_reports (
    reporter_id, reported_user_id, target_type, target_id, reason, note
  )
  values (
    v_reporter_id,
    v_reported_user_id,
    p_target_type,
    p_target_id,
    p_reason,
    pg_catalog.btrim(coalesce(p_note, ''))
  );

  if coalesce(p_block_reported, false) then
    perform public.set_community_message_account_control(v_reported_user_id, 'blocked');
  end if;
end;
$$;

revoke all on function public.submit_community_content_report(text, uuid, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.submit_community_content_report(text, uuid, text, text, boolean)
  to authenticated;

create or replace function public.get_work_discussion_report_details(p_comment_ids uuid[])
returns table (id uuid, content text, work_title text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and staff_role is not null
  ) then
    raise exception using errcode = '42501', message = 'Staff access is required.';
  end if;
  if coalesce(cardinality(p_comment_ids), 0) > 100 then
    raise exception using errcode = '22023', message = 'Too many work discussion comments requested.';
  end if;

  return query
  select comment.id, comment.content, work.title
  from public.creator_work_discussion_comments as comment
  join public.creator_works as work on work.id = comment.work_id
  where comment.id = any(p_comment_ids);
end;
$$;

revoke all on function public.get_work_discussion_report_details(uuid[])
  from public, anon, authenticated;
grant execute on function public.get_work_discussion_report_details(uuid[])
  to authenticated;

create or replace function public.moderate_community_report(
  p_report_id uuid,
  p_action text,
  p_note text default '',
  p_suspend_days integer default 7,
  p_notify_reporters boolean default true,
  p_notify_reported boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_actor_role text;
  v_target_type text;
  v_target_id uuid;
  v_target_user_id uuid;
  v_report_count integer;
  v_rows integer;
  v_note text := pg_catalog.btrim(coalesce(p_note, ''));
  v_message text;
begin
  select staff_role into v_actor_role
  from public.profiles where id = v_actor;
  if v_actor is null or v_actor_role is null then
    raise exception using errcode = '42501', message = 'Staff access is required.';
  end if;
  if p_action is null or p_action not in ('dismiss', 'hide_content', 'warn', 'suspend', 'ban') then
    raise exception using errcode = '22023', message = 'Invalid moderation action.';
  end if;
  if char_length(v_note) > 1000 then
    raise exception using errcode = '22023', message = 'The moderation note is too long.';
  end if;
  if p_action = 'suspend' and (p_suspend_days is null or p_suspend_days < 1 or p_suspend_days > 365) then
    raise exception using errcode = '22023', message = 'Suspension must be between 1 and 365 days.';
  end if;

  select report.target_type, report.target_id, report.reported_user_id
  into v_target_type, v_target_id, v_target_user_id
  from public.community_content_reports as report
  where report.id = p_report_id and report.status = 'open';
  if v_target_user_id is null then
    raise exception using errcode = '22023', message = 'This report has already been resolved or no longer exists.';
  end if;
  if p_action in ('warn', 'suspend', 'ban')
    and (
      v_target_user_id = v_actor
      or exists (
        select 1 from public.profiles
        where id = v_target_user_id and staff_role is not null
      )
    )
  then
    raise exception using errcode = '42501', message = 'Remove staff access before moderating this account.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_target_type || ':' || v_target_id::text, 0)
  );
  if not exists (
    select 1 from public.community_content_reports
    where id = p_report_id and status = 'open'
  ) then
    raise exception using errcode = '22023', message = 'This report has already been resolved.';
  end if;

  if p_action = 'hide_content' then
    case v_target_type
      when 'post' then
        update public.community_posts set is_hidden = true where id = v_target_id;
      when 'comment' then
        update public.community_post_comments set is_hidden = true where id = v_target_id;
      when 'chapter_comment' then
        update public.creator_chapter_comments set is_hidden = true where id = v_target_id;
      when 'work_comment' then
        update public.creator_work_discussion_comments set is_hidden = true where id = v_target_id;
      when 'work' then
        update public.creator_works set is_hidden = true where id = v_target_id;
      else
        raise exception using errcode = '22023', message = 'A profile cannot be hidden as content.';
    end case;
    get diagnostics v_rows = row_count;
    if v_rows = 0 then
      raise exception using errcode = '22023', message = 'The reported content no longer exists.';
    end if;
  elsif p_action = 'warn' then
    update public.profiles set warning_count = warning_count + 1 where id = v_target_user_id;
  elsif p_action = 'suspend' then
    update public.profiles
    set account_status = 'suspended',
        suspended_until = pg_catalog.now() + pg_catalog.make_interval(days => p_suspend_days)
    where id = v_target_user_id;
  elsif p_action = 'ban' then
    update public.profiles
    set account_status = 'banned', suspended_until = null
    where id = v_target_user_id;
  end if;

  update public.community_content_reports
  set status = case when p_action = 'dismiss' then 'dismissed' else 'actioned' end,
      resolved_at = pg_catalog.now(),
      resolved_by = v_actor,
      resolution = p_action
  where status = 'open'
    and target_type = v_target_type
    and target_id = v_target_id
    and reported_user_id = v_target_user_id;
  get diagnostics v_report_count = row_count;

  insert into public.moderation_audit_log (
    actor_id, report_id, target_user_id, target_type, target_id, action, note, details
  )
  values (
    v_actor, p_report_id, v_target_user_id, v_target_type, v_target_id, p_action, v_note,
    pg_catalog.jsonb_build_object(
      'reportCount', v_report_count,
      'suspendDays', case when p_action = 'suspend' then p_suspend_days else null end
    )
  );

  if p_notify_reporters then
    v_message := case p_action
      when 'dismiss' then 'We reviewed your report and did not find a policy violation.'
      else 'We reviewed your report and took action on the reported content or account.'
    end;
    insert into public.user_notifications (recipient_id, actor_id, kind, moderation_message)
    select distinct report.reporter_id, v_actor, 'moderation_outcome', v_message
    from public.community_content_reports as report
    where report.target_type = v_target_type
      and report.target_id = v_target_id
      and report.reported_user_id = v_target_user_id
      and report.reporter_id <> v_actor;
  end if;

  if p_notify_reported and v_target_user_id <> v_actor then
    v_message := case p_action
      when 'dismiss' then 'A report about your content was reviewed and dismissed.'
      when 'hide_content' then 'A report about your content was reviewed. The reported content has been hidden.'
      when 'warn' then 'A report about your content was reviewed. You received a moderation warning.'
      when 'suspend' then 'A report about your content was reviewed. Your account has been suspended for '
        || p_suspend_days || ' days.'
      when 'ban' then 'A report about your content was reviewed. Your account has been banned.'
    end;
    insert into public.user_notifications (recipient_id, actor_id, kind, moderation_message)
    values (v_target_user_id, v_actor, 'moderation_outcome', v_message);
  end if;
end;
$$;

revoke all on function public.moderate_community_report(uuid, text, text, integer, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.moderate_community_report(uuid, text, text, integer, boolean, boolean)
  to authenticated;

create or replace function public.set_moderation_content_visibility(
  p_content_type text,
  p_content_id uuid,
  p_hidden boolean,
  p_note text default ''
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_target_user_id uuid;
  v_note text := pg_catalog.btrim(coalesce(p_note, ''));
  v_rows integer;
begin
  if v_actor is null or not exists (
    select 1 from public.profiles where id = v_actor and staff_role is not null
  ) then
    raise exception using errcode = '42501', message = 'Staff access is required.';
  end if;
  if p_content_type is null or p_content_id is null or p_hidden is null
    or p_content_type not in ('post', 'comment', 'chapter_comment', 'work_comment', 'work')
  then
    raise exception using errcode = '22023', message = 'Invalid content moderation request.';
  end if;
  if char_length(v_note) > 1000 then
    raise exception using errcode = '22023', message = 'The moderation note is too long.';
  end if;

  case p_content_type
    when 'post' then
      update public.community_posts set is_hidden = p_hidden where id = p_content_id;
      select author_id into v_target_user_id from public.community_posts where id = p_content_id;
    when 'comment' then
      update public.community_post_comments set is_hidden = p_hidden where id = p_content_id;
      select author_id into v_target_user_id from public.community_post_comments where id = p_content_id;
    when 'chapter_comment' then
      update public.creator_chapter_comments set is_hidden = p_hidden where id = p_content_id;
      select author_id into v_target_user_id from public.creator_chapter_comments where id = p_content_id;
    when 'work_comment' then
      update public.creator_work_discussion_comments set is_hidden = p_hidden where id = p_content_id;
      select author_id into v_target_user_id from public.creator_work_discussion_comments where id = p_content_id;
    when 'work' then
      update public.creator_works set is_hidden = p_hidden where id = p_content_id;
      select author_id into v_target_user_id from public.creator_works where id = p_content_id;
  end case;
  get diagnostics v_rows = row_count;
  if v_rows = 0 or v_target_user_id is null then
    raise exception using errcode = '22023', message = 'The content could not be found.';
  end if;

  insert into public.moderation_audit_log (
    actor_id, target_user_id, target_type, target_id, action, note
  )
  values (
    v_actor,
    v_target_user_id,
    p_content_type,
    p_content_id,
    case when p_hidden then 'content_hidden' else 'content_restored' end,
    v_note
  );
end;
$$;

revoke all on function public.set_moderation_content_visibility(text, uuid, boolean, text)
  from public, anon, authenticated;
grant execute on function public.set_moderation_content_visibility(text, uuid, boolean, text)
  to authenticated;

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
  delete from public.creator_chapter_discussion_reactions
  where user_id = current_user_id;
  delete from public.creator_work_discussion_comment_reactions
  where user_id = current_user_id;
  delete from public.creator_chapter_comments
  where author_id = current_user_id;
  delete from public.creator_work_discussion_comments
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
    avatar_path = null
  where id = current_user_id;
end;
$$;

revoke all on function public.reset_my_account_data() from public, anon, authenticated;
grant execute on function public.reset_my_account_data() to authenticated;

notify pgrst, 'reload schema';
