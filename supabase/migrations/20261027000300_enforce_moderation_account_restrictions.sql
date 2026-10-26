create or replace function public.get_my_moderation_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'status',
      case
        when profile.account_status = 'suspended'
          and profile.suspended_until is not null
          and profile.suspended_until <= pg_catalog.now()
          then 'active'
        else profile.account_status
      end,
    'warningCount', profile.warning_count,
    'suspendedUntil', profile.suspended_until,
    'latestMessage', latest_notification.moderation_message
  )
  from public.profiles as profile
  left join lateral (
    select notification.moderation_message
    from public.user_notifications as notification
    where notification.recipient_id = profile.id
      and notification.kind = 'moderation_outcome'
      and notification.moderation_message is not null
      and case
        when profile.account_status = 'banned'
          then notification.moderation_message ilike '%banned%'
        when profile.account_status = 'suspended'
          and (profile.suspended_until is null or profile.suspended_until > pg_catalog.now())
          then notification.moderation_message ilike '%suspended%'
        when profile.warning_count > 0
          then notification.moderation_message ilike '%warning%'
        else true
      end
    order by notification.created_at desc, notification.id desc
    limit 1
  ) as latest_notification on true
  where profile.id = (select auth.uid());
$$;

revoke all on function public.get_my_moderation_status() from public, anon, authenticated;
grant execute on function public.get_my_moderation_status() to authenticated;

create or replace function public.moderation_account_is_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is null
    or exists (
      select 1
      from public.profiles as profile
      where profile.id = (select auth.uid())
        and (
          profile.account_status = 'active'
          or (
            profile.account_status = 'suspended'
            and profile.suspended_until is not null
            and profile.suspended_until <= pg_catalog.now()
          )
        )
    );
$$;

revoke all on function public.moderation_account_is_active() from public, anon, authenticated;
grant execute on function public.moderation_account_is_active() to authenticated;

create or replace function public.moderation_account_can_read(p_table_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.moderation_account_is_active()
    or exists (
      select 1
      from public.profiles as profile
      where profile.id = (select auth.uid())
        and profile.account_status = 'suspended'
        and (
          profile.suspended_until is null
          or profile.suspended_until > pg_catalog.now()
        )
        and p_table_name in ('community_posts', 'profiles')
    );
$$;

revoke all on function public.moderation_account_can_read(text) from public, anon, authenticated;
grant execute on function public.moderation_account_can_read(text) to authenticated;

create or replace function public.reject_restricted_account_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.moderation_account_is_active() then
    raise exception using
      errcode = '42501',
      message = 'This account cannot change StoryLines data while suspended or banned.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.reject_restricted_account_write() from public, anon, authenticated;

do $migration$
declare
  v_table record;
begin
  for v_table in
    select cls.relname
    from pg_catalog.pg_class as cls
    join pg_catalog.pg_namespace as nsp on nsp.oid = cls.relnamespace
    where nsp.nspname = 'public'
      and cls.relkind in ('r', 'p')
      and cls.relrowsecurity
  loop
    execute pg_catalog.format(
      'drop policy if exists moderation_select_gate on public.%I',
      v_table.relname
    );
    execute pg_catalog.format(
      'create policy moderation_select_gate on public.%I as restrictive for select to authenticated using (public.moderation_account_can_read(%L))',
      v_table.relname,
      v_table.relname
    );

    execute pg_catalog.format(
      'drop policy if exists moderation_insert_gate on public.%I',
      v_table.relname
    );
    execute pg_catalog.format(
      'create policy moderation_insert_gate on public.%I as restrictive for insert to authenticated with check (public.moderation_account_is_active())',
      v_table.relname
    );

    execute pg_catalog.format(
      'drop policy if exists moderation_update_gate on public.%I',
      v_table.relname
    );
    execute pg_catalog.format(
      'create policy moderation_update_gate on public.%I as restrictive for update to authenticated using (public.moderation_account_is_active()) with check (public.moderation_account_is_active())',
      v_table.relname
    );

    execute pg_catalog.format(
      'drop policy if exists moderation_delete_gate on public.%I',
      v_table.relname
    );
    execute pg_catalog.format(
      'create policy moderation_delete_gate on public.%I as restrictive for delete to authenticated using (public.moderation_account_is_active())',
      v_table.relname
    );

    execute pg_catalog.format(
      'drop trigger if exists moderation_write_gate on public.%I',
      v_table.relname
    );
    execute pg_catalog.format(
      'create trigger moderation_write_gate before insert or update or delete on public.%I for each row execute function public.reject_restricted_account_write()',
      v_table.relname
    );
  end loop;
end;
$migration$;

do $storage$
begin
  if pg_catalog.to_regclass('storage.objects') is not null then
    execute 'drop policy if exists moderation_select_gate on storage.objects';
    execute 'create policy moderation_select_gate on storage.objects as restrictive for select to authenticated using (public.moderation_account_is_active())';
    execute 'drop policy if exists moderation_insert_gate on storage.objects';
    execute 'create policy moderation_insert_gate on storage.objects as restrictive for insert to authenticated with check (public.moderation_account_is_active())';
    execute 'drop policy if exists moderation_update_gate on storage.objects';
    execute 'create policy moderation_update_gate on storage.objects as restrictive for update to authenticated using (public.moderation_account_is_active()) with check (public.moderation_account_is_active())';
    execute 'drop policy if exists moderation_delete_gate on storage.objects';
    execute 'create policy moderation_delete_gate on storage.objects as restrictive for delete to authenticated using (public.moderation_account_is_active())';
  end if;
end;
$storage$;

notify pgrst, 'reload schema';
