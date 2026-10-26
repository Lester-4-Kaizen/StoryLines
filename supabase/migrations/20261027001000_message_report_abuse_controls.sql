create index if not exists community_message_reports_rate_limit_idx
  on public.community_message_reports (reporter_id, created_at desc);

revoke insert (reporter_id, reported_user_id, message_id, reason, details)
  on public.community_message_reports from authenticated;

drop policy if exists "Users can report message participants"
  on public.community_message_reports;

create or replace function public.enforce_community_report_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recent_reports bigint;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.reporter_id::text, 0)
  );

  select
    (select count(*)
     from public.community_message_reports as report
     where report.reporter_id = new.reporter_id
       and report.created_at > pg_catalog.now() - interval '1 hour')
    +
    (select count(*)
     from public.community_content_reports as report
     where report.reporter_id = new.reporter_id
       and report.created_at > pg_catalog.now() - interval '1 hour')
    into v_recent_reports;

  if v_recent_reports >= 5 then
    raise exception using errcode = '22023', message = 'You have reached the report limit. Please try again later.';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_community_report_rate_limit()
  from public, anon, authenticated;

drop trigger if exists enforce_community_report_rate_limit
  on public.community_message_reports;
create trigger enforce_community_report_rate_limit
  before insert on public.community_message_reports
  for each row execute function public.enforce_community_report_rate_limit();

drop trigger if exists enforce_community_report_rate_limit
  on public.community_content_reports;
create trigger enforce_community_report_rate_limit
  before insert on public.community_content_reports
  for each row execute function public.enforce_community_report_rate_limit();

create or replace function public.submit_community_message_report(
  p_reported_user_id uuid,
  p_message_id uuid,
  p_reason text,
  p_details text default ''
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reporter_id uuid := (select auth.uid());
  v_message_sender_id uuid;
  v_recent_reports bigint;
begin
  if v_reporter_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  if p_reported_user_id is null
    or p_reported_user_id = v_reporter_id
    or coalesce(p_reason, '') not in ('harassment', 'spam', 'inappropriate', 'other')
    or pg_catalog.char_length(coalesce(p_details, '')) > 1000
  then
    raise exception using errcode = '22023', message = 'Invalid message report details.';
  end if;

  if p_message_id is null then
    if not exists (
      select 1
      from public.community_direct_messages as message
      where (message.sender_id = v_reporter_id and message.recipient_id = p_reported_user_id)
        or (message.sender_id = p_reported_user_id and message.recipient_id = v_reporter_id)
    ) then
      raise exception using errcode = '22023', message = 'The reported account could not be found in this conversation.';
    end if;
  else
    select message.sender_id
      into v_message_sender_id
    from public.community_direct_messages as message
    where message.id = p_message_id
      and message.sender_id = p_reported_user_id
      and v_reporter_id in (message.sender_id, message.recipient_id);

    if v_message_sender_id is null then
      raise exception using errcode = '22023', message = 'The reported message could not be found in this conversation.';
    end if;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_reporter_id::text, 0)
  );

  if exists (
    select 1
    from public.community_message_reports as report
    where report.reporter_id = v_reporter_id
      and report.reported_user_id = p_reported_user_id
      and report.message_id is not distinct from p_message_id
  ) then
    raise exception using errcode = '22023', message = 'You have already reported this account or message.';
  end if;

  select
    (select count(*)
     from public.community_message_reports as report
     where report.reporter_id = v_reporter_id
       and report.created_at > pg_catalog.now() - interval '1 hour')
    +
    (select count(*)
     from public.community_content_reports as report
     where report.reporter_id = v_reporter_id
       and report.created_at > pg_catalog.now() - interval '1 hour')
    into v_recent_reports;

  if v_recent_reports >= 5 then
    raise exception using errcode = '22023', message = 'You have reached the report limit. Please try again later.';
  end if;

  insert into public.community_message_reports (
    reporter_id,
    reported_user_id,
    message_id,
    reason,
    details
  )
  values (
    v_reporter_id,
    p_reported_user_id,
    p_message_id,
    p_reason,
    pg_catalog.btrim(coalesce(p_details, ''))
  );
end;
$$;

revoke all on function public.submit_community_message_report(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.submit_community_message_report(uuid, uuid, text, text)
  to authenticated;

notify pgrst, 'reload schema';
