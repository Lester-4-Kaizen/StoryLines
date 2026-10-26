create table if not exists public.community_content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reported_user_id uuid not null references public.profiles (id) on delete cascade,
  target_type text not null
    check (target_type in ('post', 'comment', 'chapter_comment', 'work', 'profile')),
  target_id uuid not null,
  reason text not null check (
    reason in (
      'spam_scam',
      'harassment_bullying',
      'hate_speech',
      'sexual_graphic_content',
      'violence_self_harm',
      'copied_stolen_work',
      'something_else'
    )
  ),
  note text not null default '' check (char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  constraint community_content_reports_no_self check (reporter_id <> reported_user_id)
);

create index if not exists community_content_reports_rate_limit_idx
  on public.community_content_reports (reporter_id, created_at desc);

alter table public.community_content_reports enable row level security;
revoke all on table public.community_content_reports from public, anon, authenticated;

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
    or p_target_type not in ('post', 'comment', 'chapter_comment', 'work', 'profile')
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
      from public.community_posts as post
      where post.id = p_target_id;
    when 'comment' then
      select comment.author_id into v_reported_user_id
      from public.community_post_comments as comment
      where comment.id = p_target_id;
    when 'chapter_comment' then
      select comment.author_id into v_reported_user_id
      from public.creator_chapter_comments as comment
      where comment.id = p_target_id;
    when 'work' then
      select work.author_id into v_reported_user_id
      from public.creator_works as work
      where work.id = p_target_id;
    when 'profile' then
      select profile.id into v_reported_user_id
      from public.profiles as profile
      where profile.id = p_target_id;
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
    v_reporter_id, v_reported_user_id, p_target_type, p_target_id, p_reason, btrim(coalesce(p_note, ''))
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
