create table if not exists public.community_conversation_states (
  user_id uuid not null references public.profiles (id) on delete cascade,
  partner_id uuid not null references public.profiles (id) on delete cascade,
  status text not null check (status in ('active', 'archived', 'deleted')),
  updated_at timestamptz not null default now(),
  primary key (user_id, partner_id),
  constraint community_conversation_states_no_self check (user_id <> partner_id)
);

create index if not exists community_conversation_states_user_status_idx
  on public.community_conversation_states (user_id, status);

create or replace function public.update_community_conversation_state_timestamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists community_conversation_states_updated_at
  on public.community_conversation_states;
create trigger community_conversation_states_updated_at
  before update on public.community_conversation_states
  for each row execute function public.update_community_conversation_state_timestamp();

alter table public.community_conversation_states enable row level security;
revoke all on table public.community_conversation_states from anon, authenticated;
grant select (user_id, partner_id, status, updated_at)
  on public.community_conversation_states to authenticated;
grant insert (user_id, partner_id, status)
  on public.community_conversation_states to authenticated;
grant update (status)
  on public.community_conversation_states to authenticated;

drop policy if exists "Users can read their own conversation states"
  on public.community_conversation_states;
create policy "Users can read their own conversation states"
  on public.community_conversation_states for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own conversation states"
  on public.community_conversation_states;
create policy "Users can create their own conversation states"
  on public.community_conversation_states for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and user_id <> partner_id
    and status in ('active', 'archived', 'deleted')
  );

drop policy if exists "Users can update their own conversation states"
  on public.community_conversation_states;
create policy "Users can update their own conversation states"
  on public.community_conversation_states for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and user_id <> partner_id
    and status in ('active', 'archived', 'deleted')
  );
