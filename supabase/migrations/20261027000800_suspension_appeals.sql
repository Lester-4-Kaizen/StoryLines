create table if not exists public.moderation_suspension_appeals (
  id uuid primary key default gen_random_uuid(),
  restriction_audit_id uuid not null references public.moderation_audit_log (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  appeal_text text not null check (char_length(btrim(appeal_text)) between 20 and 2000),
  status text not null default 'pending'
    check (status in ('pending', 'upheld', 'rescinded')),
  created_at timestamptz not null default pg_catalog.now(),
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  review_note text not null default '' check (char_length(review_note) <= 1000),
  constraint moderation_suspension_appeals_one_per_action unique (restriction_audit_id)
);

alter table public.moderation_suspension_appeals enable row level security;
revoke all on table public.moderation_suspension_appeals from public, anon, authenticated;

create or replace function public.get_my_moderation_suspension_appeal()
returns table (
  appeal_id uuid,
  restriction_audit_id uuid,
  restriction_action text,
  restriction_note text,
  restriction_created_at timestamptz,
  suspended_until timestamptz,
  appeal_text text,
  appeal_status text,
  appeal_created_at timestamptz,
  review_note text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    appeal.id,
    restriction.id,
    restriction.action,
    restriction.note,
    restriction.created_at,
    profile.suspended_until,
    appeal.appeal_text,
    appeal.status,
    appeal.created_at,
    appeal.review_note
  from public.profiles as profile
  join lateral (
    select audit.id, audit.action, audit.note, audit.created_at
    from public.moderation_audit_log as audit
    where audit.target_user_id = profile.id
      and audit.action = 'suspend'
    order by audit.created_at desc, audit.id desc
    limit 1
  ) as restriction on true
  left join public.moderation_suspension_appeals as appeal
    on appeal.restriction_audit_id = restriction.id
   and appeal.user_id = profile.id
  where profile.id = (select auth.uid())
    and profile.account_status = 'suspended'
    and profile.suspended_until > pg_catalog.now();
$$;

revoke all on function public.get_my_moderation_suspension_appeal() from public, anon, authenticated;
grant execute on function public.get_my_moderation_suspension_appeal() to authenticated;

create or replace function public.submit_my_moderation_suspension_appeal(
  p_restriction_audit_id uuid,
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
  v_status text;
  v_suspended_until timestamptz;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  if v_text is null or char_length(v_text) not between 20 and 2000 then
    raise exception using errcode = '22023', message = 'Appeals must contain 20 to 2,000 characters.';
  end if;

  select profile.account_status, profile.suspended_until
  into v_status, v_suspended_until
  from public.profiles as profile
  where profile.id = v_user_id
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'The account could not be found.';
  end if;

  if not exists (
    select 1
    from public.moderation_audit_log as restriction
    where restriction.id = p_restriction_audit_id
      and restriction.target_user_id = v_user_id
      and v_status = 'suspended'
      and v_suspended_until > pg_catalog.now()
      and restriction.action = 'suspend'
      and not exists (
        select 1
        from public.moderation_audit_log as newer
        where newer.target_user_id = v_user_id
          and newer.action in ('suspend', 'ban', 'restore')
          and (newer.created_at, newer.id) > (restriction.created_at, restriction.id)
      )
  ) then
    raise exception using errcode = '42501', message = 'This account restriction cannot be appealed.';
  end if;

  insert into public.moderation_suspension_appeals (restriction_audit_id, user_id, appeal_text)
  values (p_restriction_audit_id, v_user_id, v_text)
  returning id into v_appeal_id;

  return v_appeal_id;
exception
  when unique_violation then
    raise exception using errcode = '23505', message = 'An appeal has already been submitted for this suspension.';
end;
$$;

revoke all on function public.submit_my_moderation_suspension_appeal(uuid, text) from public, anon, authenticated;
grant execute on function public.submit_my_moderation_suspension_appeal(uuid, text) to authenticated;

create or replace function public.get_moderation_suspension_appeals()
returns table (
  appeal_id uuid,
  restriction_audit_id uuid,
  user_id uuid,
  display_name text,
  username text,
  restriction_action text,
  restriction_note text,
  restriction_created_at timestamptz,
  suspended_until timestamptz,
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
    appeal.restriction_audit_id,
    appeal.user_id,
    profile.display_name,
    profile.username,
    restriction.action,
    restriction.note,
    restriction.created_at,
    profile.suspended_until,
    appeal.appeal_text,
    appeal.created_at
  from public.moderation_suspension_appeals as appeal
  join public.moderation_audit_log as restriction on restriction.id = appeal.restriction_audit_id
  join public.profiles as profile on profile.id = appeal.user_id
  where appeal.status = 'pending'
  order by appeal.created_at asc, appeal.id;
end;
$$;

revoke all on function public.get_moderation_suspension_appeals() from public, anon, authenticated;
grant execute on function public.get_moderation_suspension_appeals() to authenticated;

create or replace function public.resolve_moderation_suspension_appeal(
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
  v_appeal public.moderation_suspension_appeals%rowtype;
  v_note text := pg_catalog.btrim(coalesce(p_note, ''));
  v_latest_action_id uuid;
  v_message text;
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
    raise exception using errcode = '22023', message = 'Choose whether to uphold or rescind the suspension.';
  end if;
  if char_length(v_note) > 1000 then
    raise exception using errcode = '22023', message = 'The review note is too long.';
  end if;

  select appeal.*
  into v_appeal
  from public.moderation_suspension_appeals as appeal
  where appeal.id = p_appeal_id
    and appeal.status = 'pending'
  for update;
  if not found then
    raise exception using errcode = '22023', message = 'This appeal has already been resolved or no longer exists.';
  end if;

  perform 1 from public.profiles as profile where profile.id = v_appeal.user_id for update;
  if not found then
    raise exception using errcode = '22023', message = 'The account could not be found.';
  end if;

  select audit.id
  into v_latest_action_id
  from public.moderation_audit_log as audit
  where audit.target_user_id = v_appeal.user_id
    and audit.action in ('suspend', 'ban', 'restore')
  order by audit.created_at desc, audit.id desc
  limit 1;
  if v_latest_action_id is distinct from v_appeal.restriction_audit_id then
    raise exception using errcode = '22023', message = 'This restriction has since changed and its appeal cannot be resolved.';
  end if;

  update public.moderation_suspension_appeals
  set status = p_decision,
      reviewed_by = v_actor,
      reviewed_at = pg_catalog.now(),
      review_note = v_note
  where id = v_appeal.id;

  if p_decision = 'rescinded' then
    update public.profiles
    set account_status = 'active', suspended_until = null
    where id = v_appeal.user_id;
  end if;

  insert into public.moderation_audit_log (
    actor_id, target_user_id, target_type, target_id, action, note, details
  )
  values (
    v_actor,
    v_appeal.user_id,
    'account_suspension',
    v_appeal.restriction_audit_id,
    case when p_decision = 'rescinded' then 'suspension_appeal_rescinded' else 'suspension_appeal_upheld' end,
    v_note,
    pg_catalog.jsonb_build_object(
      'appealId', v_appeal.id,
      'restrictionAuditId', v_appeal.restriction_audit_id,
      'restrictionAction', (
        select restriction.action
        from public.moderation_audit_log as restriction
        where restriction.id = v_appeal.restriction_audit_id
      ),
      'decision', p_decision
    )
  );

  v_message := case
    when p_decision = 'rescinded' then 'Your appeal was approved. The account restriction has been removed.'
    else 'Your appeal was reviewed and the account restriction was upheld.'
  end;
  if v_note <> '' then
    v_message := v_message || ' Staff note: ' || v_note;
  end if;
  if v_appeal.user_id <> v_actor then
    insert into public.user_notifications (recipient_id, actor_id, kind, moderation_message)
    values (v_appeal.user_id, v_actor, 'moderation_outcome', v_message);
  end if;
end;
$$;

revoke all on function public.resolve_moderation_suspension_appeal(uuid, text, text) from public, anon, authenticated;
grant execute on function public.resolve_moderation_suspension_appeal(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
