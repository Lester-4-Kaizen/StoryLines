create table if not exists public.moderation_warning_appeals (
  id uuid primary key default gen_random_uuid(),
  warning_audit_id uuid not null references public.moderation_audit_log (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  appeal_text text not null check (char_length(btrim(appeal_text)) between 20 and 2000),
  status text not null default 'pending'
    check (status in ('pending', 'upheld', 'rescinded')),
  created_at timestamptz not null default pg_catalog.now(),
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  review_note text not null default '' check (char_length(review_note) <= 1000),
  constraint moderation_warning_appeals_one_per_warning unique (warning_audit_id)
);

alter table public.moderation_warning_appeals enable row level security;
revoke all on table public.moderation_warning_appeals from public, anon, authenticated;

create or replace function public.get_my_moderation_warnings()
returns table (
  warning_audit_id uuid,
  warning_note text,
  warning_created_at timestamptz,
  appeal_id uuid,
  appeal_text text,
  appeal_status text,
  appeal_created_at timestamptz,
  review_note text,
  is_rescinded boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    warning.id,
    warning.note,
    warning.created_at,
    appeal.id,
    appeal.appeal_text,
    appeal.status,
    appeal.created_at,
    appeal.review_note,
    exists (
      select 1
      from public.moderation_audit_log as reversal
      where reversal.target_user_id = warning.target_user_id
        and reversal.action = 'warning_rescinded'
        and reversal.details ->> 'warningAuditId' = warning.id::text
    )
  from public.moderation_audit_log as warning
  left join public.moderation_warning_appeals as appeal
    on appeal.warning_audit_id = warning.id
   and appeal.user_id = warning.target_user_id
  where warning.target_user_id = (select auth.uid())
    and warning.action = 'warn'
  order by warning.created_at desc, warning.id desc;
$$;

revoke all on function public.get_my_moderation_warnings() from public, anon, authenticated;
grant execute on function public.get_my_moderation_warnings() to authenticated;

create or replace function public.submit_my_moderation_warning_appeal(
  p_warning_audit_id uuid,
  p_appeal_text text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_appeal_id uuid;
  v_text text := pg_catalog.btrim(coalesce(p_appeal_text, ''));
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  if v_text is null or char_length(v_text) not between 20 and 2000 then
    raise exception using errcode = '22023', message = 'Appeals must contain 20 to 2,000 characters.';
  end if;
  if not exists (
    select 1
    from public.moderation_audit_log as warning
    where warning.id = p_warning_audit_id
      and warning.target_user_id = v_user_id
      and warning.action = 'warn'
      and not exists (
        select 1
        from public.moderation_audit_log as reversal
        where reversal.target_user_id = warning.target_user_id
          and reversal.action = 'warning_rescinded'
          and reversal.details ->> 'warningAuditId' = warning.id::text
      )
  ) then
    raise exception using errcode = '42501', message = 'This warning cannot be appealed.';
  end if;

  insert into public.moderation_warning_appeals (warning_audit_id, user_id, appeal_text)
  values (p_warning_audit_id, v_user_id, v_text)
  returning id into v_appeal_id;

  return v_appeal_id;
exception
  when unique_violation then
    raise exception using errcode = '23505', message = 'An appeal has already been submitted for this warning.';
end;
$$;

revoke all on function public.submit_my_moderation_warning_appeal(uuid, text) from public, anon, authenticated;
grant execute on function public.submit_my_moderation_warning_appeal(uuid, text) to authenticated;

create or replace function public.get_moderation_warning_appeals()
returns table (
  appeal_id uuid,
  warning_audit_id uuid,
  user_id uuid,
  display_name text,
  username text,
  warning_note text,
  warning_created_at timestamptz,
  appeal_text text,
  appeal_created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not exists (
    select 1
    from public.profiles as staff
    where staff.id = (select auth.uid())
      and staff.staff_role in ('moderator', 'admin')
  ) then
    raise exception using errcode = '42501', message = 'Staff access is required.';
  end if;

  return query
  select
    appeal.id,
    appeal.warning_audit_id,
    appeal.user_id,
    profile.display_name,
    profile.username,
    warning.note,
    warning.created_at,
    appeal.appeal_text,
    appeal.created_at
  from public.moderation_warning_appeals as appeal
  join public.moderation_audit_log as warning on warning.id = appeal.warning_audit_id
  join public.profiles as profile on profile.id = appeal.user_id
  where appeal.status = 'pending'
  order by appeal.created_at asc, appeal.id;
end;
$$;

revoke all on function public.get_moderation_warning_appeals() from public, anon, authenticated;
grant execute on function public.get_moderation_warning_appeals() to authenticated;

create or replace function public.resolve_moderation_warning_appeal(
  p_appeal_id uuid,
  p_decision text,
  p_note text default ''
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_appeal public.moderation_warning_appeals%rowtype;
  v_note text := pg_catalog.btrim(coalesce(p_note, ''));
  v_warning_count_rows integer;
begin
  if v_actor is null or not exists (
    select 1
    from public.profiles as staff
    where staff.id = v_actor
      and staff.staff_role in ('moderator', 'admin')
  ) then
    raise exception using errcode = '42501', message = 'Staff access is required.';
  end if;
  if p_appeal_id is null or p_decision is null or p_decision not in ('upheld', 'rescinded') then
    raise exception using errcode = '22023', message = 'Choose whether to uphold or rescind the warning.';
  end if;
  if char_length(v_note) > 1000 then
    raise exception using errcode = '22023', message = 'The review note is too long.';
  end if;

  select appeal.*
  into v_appeal
  from public.moderation_warning_appeals as appeal
  where appeal.id = p_appeal_id
    and appeal.status = 'pending'
  for update;
  if not found then
    raise exception using errcode = '22023', message = 'This appeal has already been resolved or no longer exists.';
  end if;
  if exists (
    select 1
    from public.moderation_audit_log as reversal
    where reversal.target_user_id = v_appeal.user_id
      and reversal.action = 'warning_rescinded'
      and reversal.details ->> 'warningAuditId' = v_appeal.warning_audit_id::text
  ) then
    raise exception using errcode = '23505', message = 'This warning has already been rescinded.';
  end if;

  update public.moderation_warning_appeals
  set status = p_decision,
      reviewed_by = v_actor,
      reviewed_at = pg_catalog.now(),
      review_note = v_note
  where id = v_appeal.id;

  if p_decision = 'rescinded' then
    update public.profiles
    set warning_count = warning_count - 1
    where id = v_appeal.user_id
      and warning_count > 0;
    get diagnostics v_warning_count_rows = row_count;
    if v_warning_count_rows = 0 then
      raise exception using errcode = '22023', message = 'The account has no active warning count to remove.';
    end if;

    insert into public.moderation_audit_log (
      actor_id, target_user_id, report_id, target_type, target_id, action, note, details
    )
    select
      v_actor,
      v_appeal.user_id,
      warning.report_id,
      warning.target_type,
      warning.target_id,
      'warning_rescinded',
      v_note,
      pg_catalog.jsonb_build_object(
        'warningAuditId', v_appeal.warning_audit_id,
        'appealId', v_appeal.id,
        'decision', p_decision
      )
    from public.moderation_audit_log as warning
    where warning.id = v_appeal.warning_audit_id;
  else
    insert into public.moderation_audit_log (
      actor_id, target_user_id, report_id, target_type, target_id, action, note, details
    )
    select
      v_actor,
      v_appeal.user_id,
      warning.report_id,
      warning.target_type,
      warning.target_id,
      'warning_appeal_upheld',
      v_note,
      pg_catalog.jsonb_build_object(
        'warningAuditId', v_appeal.warning_audit_id,
        'appealId', v_appeal.id,
        'decision', p_decision
      )
    from public.moderation_audit_log as warning
    where warning.id = v_appeal.warning_audit_id;
  end if;

  insert into public.user_notifications (recipient_id, actor_id, kind, moderation_message)
  select
    v_appeal.user_id,
    v_actor,
    'moderation_outcome',
    case p_decision
      when 'rescinded' then 'Your warning appeal was approved. The warning has been removed from your account.'
      else 'Your warning appeal was reviewed and the warning was upheld.'
    end
  where v_appeal.user_id <> v_actor;
end;
$$;

revoke all on function public.resolve_moderation_warning_appeal(uuid, text, text) from public, anon, authenticated;
grant execute on function public.resolve_moderation_warning_appeal(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
