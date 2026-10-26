alter table public.profiles
  add column if not exists staff_role text
    check (staff_role in ('moderator', 'admin')),
  add column if not exists account_status text not null default 'active'
    check (account_status in ('active', 'suspended', 'banned')),
  add column if not exists suspended_until timestamptz,
  add column if not exists warning_count integer not null default 0
    check (warning_count >= 0);

alter table public.community_content_reports
  add column if not exists status text not null default 'open'
    check (status in ('open', 'dismissed', 'actioned')),
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by uuid references public.profiles (id) on delete set null,
  add column if not exists resolution text not null default '';

create index if not exists community_content_reports_status_created_idx
  on public.community_content_reports (status, created_at);

alter table public.community_posts
  add column if not exists is_hidden boolean not null default false;
alter table public.community_post_comments
  add column if not exists is_hidden boolean not null default false;
alter table public.creator_chapter_comments
  add column if not exists is_hidden boolean not null default false;
alter table public.creator_works
  add column if not exists is_hidden boolean not null default false;

grant select (is_hidden) on public.community_posts to anon, authenticated;
grant select (is_hidden) on public.creator_works to anon, authenticated;

drop policy if exists "Community posts are publicly readable" on public.community_posts;
create policy "Community posts are publicly readable"
  on public.community_posts for select
  to anon, authenticated
  using (not is_hidden or (select auth.uid()) = author_id);

drop policy if exists "Community post comments are publicly readable" on public.community_post_comments;
create policy "Community post comments are publicly readable"
  on public.community_post_comments for select
  to anon, authenticated
  using (
    (not is_hidden or (select auth.uid()) = author_id)
    and exists (
      select 1
      from public.community_posts as post
      where post.id = community_post_comments.post_id
        and (not post.is_hidden or (select auth.uid()) = post.author_id)
    )
  );

drop policy if exists "Published chapter comments are readable"
  on public.creator_chapter_comments;
create policy "Published chapter comments are readable"
  on public.creator_chapter_comments for select
  to anon, authenticated
  using (
    not is_hidden
    and exists (
      select 1
      from public.creator_work_chapters as chapters
      join public.creator_works as works on works.id = chapters.work_id
      where chapters.id = creator_chapter_comments.chapter_id
        and chapters.is_published
        and works.status <> 'Draft'
        and not works.is_hidden
    )
  );

drop policy if exists "Published works are publicly readable" on public.creator_works;
create policy "Published works are publicly readable"
  on public.creator_works for select
  to anon, authenticated
  using (
    (status <> 'Draft' and not is_hidden)
    or (select auth.uid()) = author_id
  );

drop policy if exists "Published chapters are publicly readable"
  on public.creator_work_chapters;
create policy "Published chapters are publicly readable"
  on public.creator_work_chapters for select
  to anon, authenticated
  using (
    is_published
    and exists (
      select 1
      from public.creator_works as work
      where work.id = work_id
        and work.type = 'story'
        and work.status <> 'Draft'
        and not work.is_hidden
    )
  );

alter table public.user_notifications
  add column if not exists moderation_message text;

alter table public.user_notifications
  drop constraint if exists user_notifications_kind_check;
alter table public.user_notifications
  add constraint user_notifications_kind_check
  check (kind in (
    'follow', 'post_like', 'comment', 'comment_reply', 'comment_reaction', 'message',
    'moderation_outcome'
  ));
grant select (moderation_message) on public.user_notifications to authenticated;

create table if not exists public.moderation_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete set null,
  report_id uuid references public.community_content_reports (id) on delete set null,
  target_user_id uuid references public.profiles (id) on delete set null,
  target_type text,
  target_id uuid,
  action text not null,
  note text not null default '',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists moderation_audit_log_created_idx
  on public.moderation_audit_log (created_at desc, id desc);
create index if not exists moderation_audit_log_target_user_idx
  on public.moderation_audit_log (target_user_id, created_at desc);

alter table public.moderation_audit_log enable row level security;
revoke all on table public.moderation_audit_log from public, anon, authenticated;

create or replace function public.get_my_moderation_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select profile.staff_role
  from public.profiles as profile
  where profile.id = (select auth.uid());
$$;

revoke all on function public.get_my_moderation_role() from public, anon, authenticated;
grant execute on function public.get_my_moderation_role() to authenticated;

create or replace function public.get_my_account_status()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when profile.account_status = 'suspended'
      and profile.suspended_until is not null
      and profile.suspended_until <= pg_catalog.now()
      then 'active'
    else profile.account_status
  end
  from public.profiles as profile
  where profile.id = (select auth.uid());
$$;

revoke all on function public.get_my_account_status() from public, anon, authenticated;
grant execute on function public.get_my_account_status() to authenticated;

create or replace function public.admin_moderation_data(
  p_section text,
  p_search text default '',
  p_status text default 'open'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_role text;
  v_search text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_search, '')));
  v_result jsonb;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  select profile.staff_role into v_role
  from public.profiles as profile
  where profile.id = v_actor;
  if v_role is null then
    raise exception using errcode = '42501', message = 'Staff access is required.';
  end if;
  if p_section is null or p_section not in ('overview', 'reports', 'users', 'content', 'audit', 'staff')
    or char_length(coalesce(p_search, '')) > 200
  then
    raise exception using errcode = '22023', message = 'Invalid moderation page or search query.';
  end if;
  if p_section = 'reports'
    and (p_status is null or p_status not in ('open', 'dismissed', 'actioned'))
  then
    raise exception using errcode = '22023', message = 'Invalid report status filter.';
  end if;

  if p_section = 'reports' or p_section = 'overview' then
    v_result := (
      with grouped_reports as (
      select
        report.target_type,
        report.target_id,
        report.reported_user_id,
        (array_agg(report.id order by report.created_at, report.id))[1] as id,
        (array_agg(report.reason order by report.created_at, report.id))[1] as reason,
        min(report.created_at) as created_at,
        count(*)::integer as open_report_count
      from public.community_content_reports as report
      where report.status = case when p_section = 'overview' then 'open' else p_status end
        and p_status in ('open', 'dismissed', 'actioned')
        and (
          v_search = ''
          or exists (
            select 1
            from public.profiles as target_profile
            where target_profile.id = report.reported_user_id
              and (
                pg_catalog.lower(target_profile.display_name) like '%' || v_search || '%'
                or pg_catalog.lower(target_profile.username) like '%' || v_search || '%'
              )
          )
          or pg_catalog.lower(report.reason) like '%' || v_search || '%'
          or pg_catalog.lower(report.note) like '%' || v_search || '%'
        )
      group by report.target_type, report.target_id, report.reported_user_id
    ),
    report_rows as (
      select
        grouped.*,
        target_profile.display_name as reported_name,
        target_profile.username as reported_username,
        target_profile.roles as reported_roles,
        target_profile.staff_role as reported_staff_role,
        target_profile.created_at as reported_joined_at,
        target_profile.account_status,
        target_profile.suspended_until,
        target_profile.warning_count,
        case grouped.target_type
          when 'post' then (
            select post.content from public.community_posts as post
            where post.id = grouped.target_id
          )
          when 'comment' then (
            select comment.content from public.community_post_comments as comment
            where comment.id = grouped.target_id
          )
          when 'chapter_comment' then (
            select comment.content from public.creator_chapter_comments as comment
            where comment.id = grouped.target_id
          )
          when 'work' then (
            select work.title || E'\n' || work.synopsis
            from public.creator_works as work where work.id = grouped.target_id
          )
          when 'profile' then (
            select profile.bio from public.profiles as profile
            where profile.id = grouped.target_id
          )
        end as content,
        case grouped.target_type
          when 'comment' then (
            select 'On post by ' || author.display_name || E':\n' || post.content
            from public.community_post_comments as comment
            join public.community_posts as post on post.id = comment.post_id
            join public.profiles as author on author.id = post.author_id
            where comment.id = grouped.target_id
          )
          when 'chapter_comment' then (
            select 'Chapter ' || chapters.chapter_number || ': ' || chapters.title
              || E'\nReported quote: ' || comment.anchor_text
              || E'\nChapter excerpt: ' || left(chapters.body, 1200)
            from public.creator_chapter_comments as comment
            join public.creator_work_chapters as chapters on chapters.id = comment.chapter_id
            where comment.id = grouped.target_id
          )
          when 'work' then (
            select 'Published work by ' || author.display_name || ' · ' || work.type
            from public.creator_works as work
            join public.profiles as author on author.id = work.author_id
            where work.id = grouped.target_id
          )
          when 'post' then (
            select 'Community post by ' || author.display_name || ' · ' || post.type
            from public.community_posts as post
            join public.profiles as author on author.id = post.author_id
            where post.id = grouped.target_id
          )
          else 'Reported profile'
        end as context
      from grouped_reports as grouped
      join public.profiles as target_profile on target_profile.id = grouped.reported_user_id
    ),
    payloads as (
      select
        report_rows.created_at,
        case
          when report_rows.reason = 'violence_self_harm' then 2
          when report_rows.created_at < pg_catalog.now() - interval '24 hours' then 1
          else 0
        end as urgency,
        report_rows.open_report_count,
        pg_catalog.jsonb_build_object(
          'id', report_rows.id,
          'targetType', report_rows.target_type,
          'targetId', report_rows.target_id,
          'createdAt', report_rows.created_at,
          'reason', report_rows.reason,
          'content', coalesce(report_rows.content, '[Content no longer available]'),
          'context', report_rows.context,
          'reportCount', report_rows.open_report_count,
          'allReportCount', (
            select count(*)::integer
            from public.community_content_reports as all_reports
            where all_reports.target_type = report_rows.target_type
              and all_reports.target_id = report_rows.target_id
              and all_reports.reported_user_id = report_rows.reported_user_id
          ),
          'reportedUser', pg_catalog.jsonb_build_object(
            'id', report_rows.reported_user_id,
            'displayName', report_rows.reported_name,
            'username', report_rows.reported_username,
            'roles', report_rows.reported_roles,
            'staffRole', report_rows.reported_staff_role,
            'joinedAt', report_rows.reported_joined_at,
            'status', case
              when report_rows.account_status = 'suspended'
                and report_rows.suspended_until is not null
                and report_rows.suspended_until <= pg_catalog.now()
                then 'active'
              else report_rows.account_status
            end,
            'suspendedUntil', report_rows.suspended_until,
            'warningCount', report_rows.warning_count,
            'reportCount', (
              select count(*)::integer
              from public.community_content_reports as received
              where received.reported_user_id = report_rows.reported_user_id
            ),
            'worksCount', (
              select count(*)::integer from public.creator_works as works
              where works.author_id = report_rows.reported_user_id
            ),
            'postsCount', (
              select count(*)::integer from public.community_posts as posts
              where posts.author_id = report_rows.reported_user_id
            ),
            'accountHistory', coalesce((
              select pg_catalog.jsonb_agg(history.entry order by history.created_at desc)
              from (
                select
                  audit.created_at,
                  pg_catalog.jsonb_build_object(
                    'action', audit.action,
                    'note', audit.note,
                    'createdAt', audit.created_at
                  ) as entry
                from public.moderation_audit_log as audit
                where audit.target_user_id = report_rows.reported_user_id
                order by audit.created_at desc
                limit 8
              ) as history
            ), '[]'::jsonb)
          ),
          'reporters', coalesce((
            select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
              'id', reporter.id,
              'createdAt', reporter.created_at,
              'reason', reporter.reason,
              'note', reporter.note,
              'user', pg_catalog.jsonb_build_object(
                'id', reporter_profile.id,
                'displayName', reporter_profile.display_name,
                'username', reporter_profile.username
              )
            ) order by reporter.created_at)
            from public.community_content_reports as reporter
            join public.profiles as reporter_profile on reporter_profile.id = reporter.reporter_id
            where reporter.target_type = report_rows.target_type
              and reporter.target_id = report_rows.target_id
              and reporter.reported_user_id = report_rows.reported_user_id
              and reporter.status = case when p_section = 'overview' then 'open' else p_status end
          ), '[]'::jsonb)
        ) as payload
      from report_rows
    ),
    limited_payloads as (
      select payload, urgency, open_report_count, created_at
      from payloads
      order by urgency desc, open_report_count desc, created_at asc
      limit case when p_section = 'overview' then 8 else 500 end
    )
      select coalesce(pg_catalog.jsonb_agg(limited_payloads.payload order by limited_payloads.urgency desc, limited_payloads.open_report_count desc, limited_payloads.created_at asc), '[]'::jsonb)
      from limited_payloads
    );

    if p_section = 'overview' then
      return pg_catalog.jsonb_build_object(
        'reports', coalesce(v_result, '[]'::jsonb),
        'stats', pg_catalog.jsonb_build_object(
          'openReports', (select count(*)::integer from public.community_content_reports where status = 'open'),
          'urgentReports', (
            select count(*)::integer
            from public.community_content_reports
            where status = 'open'
              and (reason = 'violence_self_harm' or created_at < pg_catalog.now() - interval '24 hours')
          ),
          'resolvedThisWeek', (
            select count(*)::integer
            from public.community_content_reports
            where status <> 'open' and resolved_at >= pg_catalog.now() - interval '7 days'
          ),
          'newUsers', (
            select count(*)::integer
            from public.profiles
            where created_at >= pg_catalog.now() - interval '7 days'
          ),
          'publishedWorks', (
            select count(*)::integer
            from public.creator_works
            where status <> 'Draft' and created_at >= pg_catalog.now() - interval '7 days'
          )
        ),
        'activity', (
          select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'date', days.day::date,
            'signups', (
              select count(*)::integer from public.profiles
              where created_at >= days.day and created_at < days.day + interval '1 day'
            ),
            'posts', (
              select count(*)::integer from public.community_posts
              where created_at >= days.day and created_at < days.day + interval '1 day'
            ),
            'reports', (
              select count(*)::integer from public.community_content_reports
              where created_at >= days.day and created_at < days.day + interval '1 day'
            )
          ) order by days.day), '[]'::jsonb)
          from pg_catalog.generate_series(
            pg_catalog.date_trunc('day', pg_catalog.now()) - interval '13 days',
            pg_catalog.date_trunc('day', pg_catalog.now()),
            interval '1 day'
          ) as days(day)
        ),
        'actions', (
          select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'action', audit.action,
            'note', audit.note,
            'createdAt', audit.created_at,
            'actor', coalesce(actor.display_name, 'Deleted staff member'),
            'target', target.display_name
          ) order by audit.created_at desc), '[]'::jsonb)
          from (
            select * from public.moderation_audit_log
            order by created_at desc limit 5
          ) as audit
          left join public.profiles as actor on actor.id = audit.actor_id
          left join public.profiles as target on target.id = audit.target_user_id
        )
      );
    end if;
    return coalesce(v_result, '[]'::jsonb);
  elsif p_section = 'users' then
    if p_status is null or p_status not in ('all', 'active', 'suspended', 'banned') then
      raise exception using errcode = '22023', message = 'Invalid account status filter.';
    end if;
    v_result := (
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', profile.id,
      'displayName', profile.display_name,
      'username', profile.username,
      'roles', profile.roles,
      'joinedAt', profile.created_at,
      'status', case
        when profile.account_status = 'suspended'
          and profile.suspended_until is not null
          and profile.suspended_until <= pg_catalog.now()
          then 'active'
        else profile.account_status
      end,
      'suspendedUntil', profile.suspended_until,
      'warningCount', profile.warning_count,
      'staffRole', profile.staff_role,
      'reportCount', (
        select count(*)::integer from public.community_content_reports as report
        where report.reported_user_id = profile.id
      ),
      'workCount', (
        select count(*)::integer from public.creator_works as work
        where work.author_id = profile.id
      ),
      'postCount', (
        select count(*)::integer from public.community_posts as post
        where post.author_id = profile.id
      ),
      'lastActive', greatest(
        profile.created_at,
        coalesce((
          select max(audit.created_at)
          from public.moderation_audit_log as audit
          where audit.target_user_id = profile.id
        ), profile.created_at)
      ),
      'accountHistory', coalesce((
        select pg_catalog.jsonb_agg(history.entry order by history.created_at desc)
        from (
          select audit.created_at, pg_catalog.jsonb_build_object(
            'action', audit.action,
            'note', audit.note,
            'createdAt', audit.created_at
          ) as entry
          from public.moderation_audit_log as audit
          where audit.target_user_id = profile.id
          order by audit.created_at desc
          limit 8
        ) as history
      ), '[]'::jsonb)
      ) order by (
      select count(*) from public.community_content_reports as report
      where report.reported_user_id = profile.id
      ) desc, profile.created_at desc), '[]'::jsonb)
      from (
      select profile.*
      from public.profiles as profile
      where (p_status = 'all' or profile.account_status = p_status
        or (p_status = 'active' and profile.account_status = 'suspended'
          and profile.suspended_until is not null and profile.suspended_until <= pg_catalog.now()))
        and (
          v_search = ''
          or pg_catalog.lower(profile.display_name) like '%' || v_search || '%'
          or pg_catalog.lower(profile.username) like '%' || v_search || '%'
          or profile.id::text like '%' || v_search || '%'
        )
      order by (
        select count(*) from public.community_content_reports as report
        where report.reported_user_id = profile.id
      ) desc, profile.created_at desc
      limit 500
      ) as profile
    );
    return coalesce(v_result, '[]'::jsonb);
  elsif p_section = 'content' then
    v_result := (
      select coalesce(pg_catalog.jsonb_agg(items.item order by items.created_at desc), '[]'::jsonb)
      from (
        select *
        from (
          select post.created_at, pg_catalog.jsonb_build_object(
            'id', post.id, 'type', 'post', 'title', 'Community post',
            'content', post.content, 'createdAt', post.created_at,
            'hidden', post.is_hidden, 'authorId', post.author_id,
            'author', profile.display_name
          ) as item
          from public.community_posts as post
          join public.profiles as profile on profile.id = post.author_id
          where v_search = ''
            or pg_catalog.lower(post.content) like '%' || v_search || '%'
            or pg_catalog.lower(profile.display_name) like '%' || v_search || '%'
          union all
          select work.created_at, pg_catalog.jsonb_build_object(
            'id', work.id, 'type', 'work', 'title', work.title,
            'content', work.synopsis, 'createdAt', work.created_at,
            'hidden', work.is_hidden, 'authorId', work.author_id,
            'author', profile.display_name
          ) as item
          from public.creator_works as work
          join public.profiles as profile on profile.id = work.author_id
          where v_search = ''
            or pg_catalog.lower(work.title) like '%' || v_search || '%'
            or pg_catalog.lower(profile.display_name) like '%' || v_search || '%'
          union all
          select comment.created_at, pg_catalog.jsonb_build_object(
            'id', comment.id, 'type', 'comment', 'title', 'Post comment',
            'content', comment.content, 'createdAt', comment.created_at,
            'hidden', comment.is_hidden, 'authorId', comment.author_id,
            'author', profile.display_name
          ) as item
          from public.community_post_comments as comment
          join public.profiles as profile on profile.id = comment.author_id
          where v_search = ''
            or pg_catalog.lower(comment.content) like '%' || v_search || '%'
            or pg_catalog.lower(profile.display_name) like '%' || v_search || '%'
          union all
          select comment.created_at, pg_catalog.jsonb_build_object(
            'id', comment.id, 'type', 'chapter_comment', 'title', 'Chapter comment',
            'content', comment.content, 'createdAt', comment.created_at,
            'hidden', comment.is_hidden, 'authorId', comment.author_id,
            'author', profile.display_name
          ) as item
          from public.creator_chapter_comments as comment
          join public.profiles as profile on profile.id = comment.author_id
          where v_search = ''
            or pg_catalog.lower(comment.content) like '%' || v_search || '%'
            or pg_catalog.lower(profile.display_name) like '%' || v_search || '%'
        ) as all_items
        order by created_at desc
        limit 500
      ) as items
    );
    return coalesce(v_result, '[]'::jsonb);
  elsif p_section = 'audit' then
    v_result := (
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', audit.id,
      'action', audit.action,
      'note', audit.note,
      'details', audit.details,
      'createdAt', audit.created_at,
      'reportId', audit.report_id,
      'targetType', audit.target_type,
      'actorId', audit.actor_id,
      'actor', coalesce(actor.display_name, 'Deleted staff member'),
      'targetUserId', audit.target_user_id,
      'target', target.display_name
      ) order by audit.created_at desc), '[]'::jsonb)
      from (
      select * from public.moderation_audit_log
      where v_search = ''
        or pg_catalog.lower(action) like '%' || v_search || '%'
        or pg_catalog.lower(note) like '%' || v_search || '%'
      order by created_at desc limit 500
    ) as audit
    left join public.profiles as actor on actor.id = audit.actor_id
      left join public.profiles as target on target.id = audit.target_user_id
    );
    return coalesce(v_result, '[]'::jsonb);
  elsif p_section = 'staff' then
    if v_role <> 'admin' then
      raise exception using errcode = '42501', message = 'Administrator access is required.';
    end if;
    v_result := (
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', profile.id,
      'displayName', profile.display_name,
      'username', profile.username,
      'staffRole', profile.staff_role,
      'joinedAt', profile.created_at
      ) order by profile.staff_role, profile.display_name), '[]'::jsonb)
      from public.profiles as profile
      where profile.staff_role is not null
        and profile.id <> v_actor
        and (
          v_search = ''
          or pg_catalog.lower(profile.display_name) like '%' || v_search || '%'
          or pg_catalog.lower(profile.username) like '%' || v_search || '%'
        )
    );
    return coalesce(v_result, '[]'::jsonb);
  end if;

  raise exception using errcode = '22023', message = 'Unknown moderation page.';
end;
$$;

revoke all on function public.admin_moderation_data(text, text, text) from public, anon, authenticated;
grant execute on function public.admin_moderation_data(text, text, text) to authenticated;

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
  from public.profiles
  where id = v_actor;
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

create or replace function public.moderate_user_account(
  p_user_id uuid,
  p_action text,
  p_note text default '',
  p_suspend_days integer default 7
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_note text := pg_catalog.btrim(coalesce(p_note, ''));
begin
  if v_actor is null or not exists (
    select 1 from public.profiles where id = v_actor and staff_role is not null
  ) then
    raise exception using errcode = '42501', message = 'Staff access is required.';
  end if;
  if p_user_id is null or p_user_id = v_actor then
    raise exception using errcode = '22023', message = 'You cannot moderate your own account.';
  end if;
  if exists (
    select 1 from public.profiles
    where id = p_user_id and staff_role is not null
  ) then
    raise exception using errcode = '42501', message = 'Remove staff access before moderating this account.';
  end if;
  if p_action is null or p_action not in ('warn', 'suspend', 'ban', 'restore') then
    raise exception using errcode = '22023', message = 'Invalid account action.';
  end if;
  if char_length(v_note) > 1000 then
    raise exception using errcode = '22023', message = 'The moderation note is too long.';
  end if;
  if p_action = 'suspend' and (p_suspend_days is null or p_suspend_days < 1 or p_suspend_days > 365) then
    raise exception using errcode = '22023', message = 'Suspension must be between 1 and 365 days.';
  end if;

  if p_action = 'warn' then
    update public.profiles set warning_count = warning_count + 1 where id = p_user_id;
  elsif p_action = 'suspend' then
    update public.profiles
    set account_status = 'suspended',
        suspended_until = pg_catalog.now() + pg_catalog.make_interval(days => p_suspend_days)
    where id = p_user_id;
  elsif p_action = 'ban' then
    update public.profiles
    set account_status = 'banned', suspended_until = null
    where id = p_user_id;
  else
    update public.profiles
    set account_status = 'active', suspended_until = null
    where id = p_user_id;
  end if;
  if not found then
    raise exception using errcode = '22023', message = 'The account could not be found.';
  end if;

  insert into public.moderation_audit_log (
    actor_id, target_user_id, action, note, details
  )
  values (
    v_actor, p_user_id, p_action, v_note,
    pg_catalog.jsonb_build_object(
      'suspendDays', case when p_action = 'suspend' then p_suspend_days else null end
    )
  );

  if p_action <> 'restore' then
    insert into public.user_notifications (recipient_id, actor_id, kind, moderation_message)
    values (
      p_user_id,
      v_actor,
      'moderation_outcome',
      case p_action
        when 'warn' then 'A moderator issued a warning to your account.'
        when 'suspend' then 'Your account has been suspended for ' || p_suspend_days || ' days.'
        when 'ban' then 'Your account has been banned.'
      end
    );
  end if;
end;
$$;

revoke all on function public.moderate_user_account(uuid, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.moderate_user_account(uuid, text, text, integer)
  to authenticated;

create or replace function public.set_moderation_staff_role(
  p_user_id uuid,
  p_staff_role text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_old_role text;
begin
  if v_actor is null or not exists (
    select 1 from public.profiles where id = v_actor and staff_role = 'admin'
  ) then
    raise exception using errcode = '42501', message = 'Administrator access is required.';
  end if;
  if p_user_id is null or p_user_id = v_actor
    or p_staff_role is null
    or p_staff_role not in ('moderator', 'admin', 'none')
  then
    raise exception using errcode = '22023', message = 'Invalid staff role change.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(941726);
  select staff_role into v_old_role from public.profiles where id = p_user_id for update;
  if not found then
    raise exception using errcode = '22023', message = 'The account could not be found.';
  end if;
  if v_old_role = 'admin' and p_staff_role <> 'admin'
    and (select count(*) from public.profiles where staff_role = 'admin') <= 1
  then
    raise exception using errcode = '22023', message = 'The last administrator cannot be removed.';
  end if;

  update public.profiles
  set staff_role = case when p_staff_role = 'none' then null else p_staff_role end
  where id = p_user_id;

  insert into public.moderation_audit_log (
    actor_id, target_user_id, action, details
  )
  values (
    v_actor, p_user_id, 'staff_role_changed',
    pg_catalog.jsonb_build_object('from', v_old_role, 'to', nullif(p_staff_role, 'none'))
  );
end;
$$;

revoke all on function public.set_moderation_staff_role(uuid, text) from public, anon, authenticated;
grant execute on function public.set_moderation_staff_role(uuid, text) to authenticated;

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
    or p_content_type not in ('post', 'comment', 'chapter_comment', 'work')
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

notify pgrst, 'reload schema';
