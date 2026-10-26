alter table public.community_message_reports
  add column if not exists status text not null default 'open'
    check (status in ('open', 'dismissed', 'actioned')),
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by uuid references public.profiles (id) on delete set null,
  add column if not exists resolution text not null default '';

create index if not exists community_message_reports_status_created_idx
  on public.community_message_reports (status, created_at);
create index if not exists community_message_reports_message_idx
  on public.community_message_reports (message_id, reported_user_id, status, created_at);

drop policy if exists "Users can report message participants"
  on public.community_message_reports;
create policy "Users can report message participants"
  on public.community_message_reports for insert
  to authenticated
  with check (
    (select auth.uid()) = reporter_id
    and reporter_id <> reported_user_id
    and (
      message_id is null
      or exists (
        select 1
        from public.community_direct_messages as message
        where message.id = community_message_reports.message_id
          and (select auth.uid()) in (message.sender_id, message.recipient_id)
          and message.sender_id = community_message_reports.reported_user_id
      )
    )
  );

create or replace function public.admin_message_moderation_data(
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
  v_search text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_search, '')));
  v_reports jsonb;
begin
  if v_actor is null or not exists (
    select 1
    from public.profiles as profile
    where profile.id = v_actor
      and profile.staff_role in ('moderator', 'admin')
  ) then
    raise exception using errcode = '42501', message = 'Staff access is required.';
  end if;
  if p_status is null or p_status not in ('open', 'dismissed', 'actioned')
    or char_length(coalesce(p_search, '')) > 200
  then
    raise exception using errcode = '22023', message = 'Invalid message report filter.';
  end if;

  with filtered_reports as (
    select report.*
    from public.community_message_reports as report
    where report.status = p_status
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
        or exists (
          select 1
          from public.profiles as reporter_profile
          where reporter_profile.id = report.reporter_id
            and (
              pg_catalog.lower(reporter_profile.display_name) like '%' || v_search || '%'
              or pg_catalog.lower(reporter_profile.username) like '%' || v_search || '%'
            )
        )
        or pg_catalog.lower(report.reason) like '%' || v_search || '%'
        or pg_catalog.lower(report.details) like '%' || v_search || '%'
        or exists (
          select 1
          from public.community_direct_messages as search_message
          where search_message.id = report.message_id
            and pg_catalog.lower(search_message.content) like '%' || v_search || '%'
        )
      )
  ),
  grouped_reports as (
    select
      (array_agg(report.id order by report.created_at, report.id))[1] as id,
      report.message_id,
      report.reported_user_id,
      min(report.created_at) as created_at,
      (array_agg(report.reason order by report.created_at, report.id))[1] as reason,
      count(*)::integer as report_count
    from filtered_reports as report
    group by report.reported_user_id, report.message_id,
      case when report.message_id is null then report.id else null::uuid end
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
      case
        when message.is_deleted then '[Message already deleted]'
        when message.id is null then '[No specific message attached to this report]'
        else message.content
      end as content,
      message.sender_id,
      message.recipient_id,
      message.created_at as message_created_at,
      message.is_deleted
    from grouped_reports as grouped
    join public.profiles as target_profile on target_profile.id = grouped.reported_user_id
    left join public.community_direct_messages as message on message.id = grouped.message_id
  ),
  payloads as (
    select
      report_rows.created_at,
      case
        when report_rows.reason = 'harassment' then 2
        when report_rows.created_at < pg_catalog.now() - interval '24 hours' then 1
        else 0
      end as urgency,
      report_rows.report_count,
      pg_catalog.jsonb_build_object(
        'id', report_rows.id,
        'source', 'message',
        'targetType', 'message',
        'targetId', report_rows.message_id,
        'createdAt', report_rows.created_at,
        'reason', report_rows.reason,
        'content', report_rows.content,
        'context', case
          when report_rows.message_id is null then
            'The reporter did not select a specific message.'
          when report_rows.is_deleted then
            'The reported message was deleted before review.'
          else coalesce((
            select pg_catalog.string_agg(
              context_rows.context_line,
              E'\n' order by context_rows.created_at, context_rows.id
            )
            from (
              (
                select
                  neighbor.created_at,
                  neighbor.id,
                  author.display_name || ': ' ||
                    case when neighbor.is_deleted then '[Message deleted]' else left(neighbor.content, 500) end
                    as context_line
                from public.community_direct_messages as neighbor
                join public.profiles as author on author.id = neighbor.sender_id
                where neighbor.sender_id in (report_rows.sender_id, report_rows.recipient_id)
                  and neighbor.recipient_id in (report_rows.sender_id, report_rows.recipient_id)
                  and neighbor.id <> report_rows.message_id
                  and neighbor.created_at < report_rows.message_created_at
                order by neighbor.created_at desc, neighbor.id desc
                limit 2
              )
              union all
              (
                select
                  report_rows.message_created_at,
                  report_rows.message_id,
                  'REPORTED MESSAGE: ' || coalesce(report_rows.content, '[Message unavailable]')
              )
              union all
              (
                select
                  neighbor.created_at,
                  neighbor.id,
                  author.display_name || ': ' ||
                    case when neighbor.is_deleted then '[Message deleted]' else left(neighbor.content, 500) end
                from public.community_direct_messages as neighbor
                join public.profiles as author on author.id = neighbor.sender_id
                where neighbor.sender_id in (report_rows.sender_id, report_rows.recipient_id)
                  and neighbor.recipient_id in (report_rows.sender_id, report_rows.recipient_id)
                  and neighbor.id <> report_rows.message_id
                  and neighbor.created_at > report_rows.message_created_at
                order by neighbor.created_at, neighbor.id
                limit 2
              )
            ) as context_rows
          ), 'No nearby conversation messages are available.')
        end,
        'reportCount', report_rows.report_count,
        'allReportCount', (
          select count(*)::integer
          from public.community_message_reports as all_reports
          where all_reports.reported_user_id = report_rows.reported_user_id
            and (
              (report_rows.message_id is not null and all_reports.message_id = report_rows.message_id)
              or (report_rows.message_id is null and all_reports.id = report_rows.id)
            )
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
            (select count(*) from public.community_content_reports as received
              where received.reported_user_id = report_rows.reported_user_id)
            + (select count(*) from public.community_message_reports as received
              where received.reported_user_id = report_rows.reported_user_id)
          )::integer,
          'workCount', (
            select count(*)::integer from public.creator_works as works
            where works.author_id = report_rows.reported_user_id
          ),
          'postCount', (
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
            'note', reporter.details,
            'user', pg_catalog.jsonb_build_object(
              'id', reporter_profile.id,
              'displayName', reporter_profile.display_name,
              'username', reporter_profile.username
            )
          ) order by reporter.created_at, reporter.id)
          from public.community_message_reports as reporter
          join public.profiles as reporter_profile on reporter_profile.id = reporter.reporter_id
          where reporter.status = p_status
            and reporter.reported_user_id = report_rows.reported_user_id
            and (
              (report_rows.message_id is not null and reporter.message_id = report_rows.message_id)
              or (report_rows.message_id is null and reporter.id = report_rows.id)
            )
        ), '[]'::jsonb)
      ) as payload
    from report_rows
  ),
  limited_payloads as (
    select payload, urgency, report_count, created_at
    from payloads
    order by urgency desc, report_count desc, created_at asc
    limit 500
  )
  select coalesce(pg_catalog.jsonb_agg(
    limited_payloads.payload
    order by limited_payloads.urgency desc, limited_payloads.report_count desc, limited_payloads.created_at asc
  ), '[]'::jsonb)
  into v_reports
  from limited_payloads;

  return pg_catalog.jsonb_build_object(
    'reports', coalesce(v_reports, '[]'::jsonb),
    'stats', pg_catalog.jsonb_build_object(
      'openReports', (
        select count(*)::integer from public.community_message_reports where status = 'open'
      ),
      'urgentReports', (
        select count(*)::integer
        from public.community_message_reports
        where status = 'open'
          and (reason = 'harassment' or created_at < pg_catalog.now() - interval '24 hours')
      ),
      'resolvedThisWeek', (
        select count(*)::integer
        from public.community_message_reports
        where status <> 'open'
          and resolved_at >= pg_catalog.now() - interval '7 days'
      )
    ),
    'activity', (
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'date', days.day::date,
        'reports', (
          select count(*)::integer
          from public.community_message_reports as report
          where report.created_at >= days.day
            and report.created_at < days.day + interval '1 day'
        )
      ) order by days.day), '[]'::jsonb)
      from pg_catalog.generate_series(
        pg_catalog.date_trunc('day', pg_catalog.now()) - interval '13 days',
        pg_catalog.date_trunc('day', pg_catalog.now()),
        interval '1 day'
      ) as days(day)
    )
  );
end;
$$;

revoke all on function public.admin_message_moderation_data(text, text)
  from public, anon, authenticated;
grant execute on function public.admin_message_moderation_data(text, text)
  to authenticated;

create or replace function public.moderate_community_message_report(
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
  v_target_user_id uuid;
  v_message_id uuid;
  v_group_id uuid;
  v_report_count integer;
  v_rows integer;
  v_note text := pg_catalog.btrim(coalesce(p_note, ''));
  v_message text;
begin
  if v_actor is null or not exists (
    select 1
    from public.profiles as profile
    where profile.id = v_actor
      and profile.staff_role in ('moderator', 'admin')
  ) then
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

  select report.reported_user_id, report.message_id, coalesce(report.message_id, report.id)
  into v_target_user_id, v_message_id, v_group_id
  from public.community_message_reports as report
  where report.id = p_report_id and report.status = 'open';
  if not found then
    raise exception using errcode = '22023', message = 'This message report has already been resolved or no longer exists.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_target_user_id::text || ':' || v_group_id::text, 0)
  );
  if not exists (
    select 1 from public.community_message_reports
    where id = p_report_id and status = 'open'
  ) then
    raise exception using errcode = '22023', message = 'This message report has already been resolved.';
  end if;
  if p_action in ('warn', 'suspend', 'ban') and (
    v_target_user_id = v_actor
    or exists (
      select 1 from public.profiles
      where id = v_target_user_id and staff_role is not null
    )
  ) then
    raise exception using errcode = '42501', message = 'Remove staff access before moderating this account.';
  end if;

  if p_action = 'hide_content' then
    if v_message_id is null then
      raise exception using errcode = '22023', message = 'This report does not include a specific message to hide.';
    end if;
    if not exists (
      select 1
      from public.community_direct_messages as message
      where message.id = v_message_id
        and message.sender_id = v_target_user_id
    ) then
      raise exception using errcode = '42501', message = 'The reported message does not belong to this account.';
    end if;
    update public.community_direct_messages
    set content = 'This message was deleted',
        is_deleted = true
    where id = v_message_id
      and sender_id = v_target_user_id
      and not is_deleted;
    get diagnostics v_rows = row_count;
    if v_rows = 0 then
      raise exception using errcode = '22023', message = 'The reported message no longer exists or was already deleted.';
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

  update public.community_message_reports
  set status = case when p_action = 'dismiss' then 'dismissed' else 'actioned' end,
      resolved_at = pg_catalog.now(),
      resolved_by = v_actor,
      resolution = p_action
  where status = 'open'
    and reported_user_id = v_target_user_id
    and (
      (v_message_id is not null and message_id = v_message_id)
      or (v_message_id is null and id = p_report_id)
    );
  get diagnostics v_report_count = row_count;

  insert into public.moderation_audit_log (
    actor_id, target_user_id, target_type, target_id, action, note, details
  )
  values (
    v_actor, v_target_user_id, 'message', v_message_id, p_action, v_note,
    pg_catalog.jsonb_build_object(
      'messageReportId', p_report_id,
      'reportCount', v_report_count,
      'suspendDays', case when p_action = 'suspend' then p_suspend_days else null end
    )
  );

  if p_notify_reporters then
    v_message := case p_action
      when 'dismiss' then 'We reviewed your direct-message report and did not find a policy violation.'
      else 'We reviewed your direct-message report and took action on the reported content or account.'
    end;
    insert into public.user_notifications (recipient_id, actor_id, kind, moderation_message)
    select distinct report.reporter_id, v_actor, 'moderation_outcome', v_message
    from public.community_message_reports as report
    where report.reported_user_id = v_target_user_id
      and (
        (v_message_id is not null and report.message_id = v_message_id)
        or (v_message_id is null and report.id = p_report_id)
      )
      and report.reporter_id <> v_actor;
  end if;

  if p_notify_reported and v_target_user_id <> v_actor then
    v_message := case p_action
      when 'dismiss' then 'A report about a direct message was reviewed and dismissed.'
      when 'hide_content' then 'A report about your direct message was reviewed. The message has been removed.'
      when 'warn' then 'A report about a direct message was reviewed. You received a moderation warning.'
      when 'suspend' then 'A report about a direct message was reviewed. Your account has been suspended for '
        || p_suspend_days || ' days.'
      when 'ban' then 'A report about a direct message was reviewed. Your account has been banned.'
    end;
    insert into public.user_notifications (recipient_id, actor_id, kind, moderation_message)
    values (v_target_user_id, v_actor, 'moderation_outcome', v_message);
  end if;
end;
$$;

revoke all on function public.moderate_community_message_report(uuid, text, text, integer, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.moderate_community_message_report(uuid, text, text, integer, boolean, boolean)
  to authenticated;

notify pgrst, 'reload schema';
