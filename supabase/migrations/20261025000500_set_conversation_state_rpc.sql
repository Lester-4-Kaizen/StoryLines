create or replace function public.set_community_conversation_state(
  p_partner_id uuid,
  p_status text
)
returns table (partner_id uuid, status text, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  if p_partner_id is null or p_partner_id = v_user_id then
    raise exception using errcode = '22023', message = 'A different conversation participant is required.';
  end if;

  if p_status is null or p_status not in ('active', 'archived', 'deleted') then
    raise exception using errcode = '22023', message = 'Invalid conversation status.';
  end if;

  return query
    insert into public.community_conversation_states as states (user_id, partner_id, status)
    values (v_user_id, p_partner_id, p_status)
    on conflict on constraint community_conversation_states_pkey do update
      set status = excluded.status
    returning states.partner_id, states.status, states.updated_at;
end;
$$;

revoke all on function public.set_community_conversation_state(uuid, text) from public, anon, authenticated;
grant execute on function public.set_community_conversation_state(uuid, text) to authenticated;
