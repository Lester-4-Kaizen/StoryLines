create table if not exists public.collaboration_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid references public.profiles (id) on delete cascade,
  listing_id uuid references public.collaboration_requests (id) on delete cascade,
  kind text not null check (kind in ('listing', 'proposal')),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  description text not null check (char_length(btrim(description)) between 1 and 2000),
  collaboration_role text not null check (collaboration_role in ('writer', 'artist')),
  status text not null check (status in ('open', 'pending', 'accepted', 'declined', 'completed', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint collaboration_requests_distinct_participants check (
    recipient_id is null or requester_id <> recipient_id
  ),
  constraint collaboration_requests_kind_shape check (
    (kind = 'listing' and recipient_id is null and listing_id is null and status in ('open', 'closed'))
    or (kind = 'proposal' and recipient_id is not null and status in ('pending', 'accepted', 'declined', 'completed'))
  ),
  constraint collaboration_requests_no_self_listing check (listing_id is null or listing_id <> id)
);

create index if not exists collaboration_requests_requester_status_idx
  on public.collaboration_requests (requester_id, status, created_at desc);
create index if not exists collaboration_requests_recipient_status_idx
  on public.collaboration_requests (recipient_id, status, created_at desc);
create index if not exists collaboration_requests_listing_status_idx
  on public.collaboration_requests (listing_id, status, created_at desc)
  where listing_id is not null;
create index if not exists collaboration_requests_open_listings_idx
  on public.collaboration_requests (created_at desc)
  where kind = 'listing' and status = 'open';
create unique index if not exists collaboration_requests_pending_direct_unique_idx
  on public.collaboration_requests (requester_id, recipient_id)
  where kind = 'proposal' and status = 'pending' and listing_id is null;
create unique index if not exists collaboration_requests_pending_listing_unique_idx
  on public.collaboration_requests (requester_id, listing_id)
  where kind = 'proposal' and status = 'pending' and listing_id is not null;

alter table public.collaboration_requests enable row level security;
revoke all on table public.collaboration_requests from anon, authenticated;
grant select (
  id, requester_id, recipient_id, listing_id, kind, title, description,
  collaboration_role, status, created_at, updated_at
) on public.collaboration_requests to authenticated;
grant insert (
  requester_id, recipient_id, listing_id, kind, title, description, collaboration_role, status
) on public.collaboration_requests to authenticated;
grant update (status, updated_at) on public.collaboration_requests to authenticated;
grant delete on public.collaboration_requests to authenticated;

drop policy if exists "Participants and open listings can read collaboration requests" on public.collaboration_requests;
create policy "Participants and open listings can read collaboration requests"
  on public.collaboration_requests for select
  to authenticated
  using (
    requester_id = (select auth.uid())
    or recipient_id = (select auth.uid())
    or (kind = 'listing' and status = 'open')
  );

drop policy if exists "Creators can publish collaboration requests" on public.collaboration_requests;
create policy "Creators can publish collaboration requests"
  on public.collaboration_requests for insert
  to authenticated
  with check (
    requester_id = (select auth.uid())
    and exists (
      select 1
      from public.profiles as requester
      where requester.id = (select auth.uid())
        and requester.roles && array['writer', 'artist']::text[]
    )
    and (
      (
        kind = 'listing'
        and recipient_id is null
        and listing_id is null
        and status = 'open'
      )
      or (
        kind = 'proposal'
        and recipient_id is not null
        and status = 'pending'
        and (
          (
            listing_id is null
            and exists (
              select 1
              from public.profiles as recipient
              where recipient.id = collaboration_requests.recipient_id
                and recipient.open_for_collaboration
                and collaboration_requests.collaboration_role = any(recipient.roles)
            )
          )
          or exists (
            select 1
            from public.collaboration_requests as listing
            join public.profiles as requester on requester.id = (select auth.uid())
            where listing.id = collaboration_requests.listing_id
              and listing.kind = 'listing'
              and listing.status = 'open'
              and listing.requester_id = collaboration_requests.recipient_id
              and listing.collaboration_role = collaboration_requests.collaboration_role
              and collaboration_requests.collaboration_role = any(requester.roles)
          )
        )
      )
    )
  );

drop policy if exists "Recipients can respond to collaboration proposals" on public.collaboration_requests;
create policy "Recipients can respond to collaboration proposals"
  on public.collaboration_requests for update
  to authenticated
  using (
    recipient_id = (select auth.uid())
    and kind = 'proposal'
    and status = 'pending'
  )
  with check (
    recipient_id = (select auth.uid())
    and kind = 'proposal'
    and status in ('accepted', 'declined')
  );

drop policy if exists "Participants can complete accepted collaborations" on public.collaboration_requests;
create policy "Participants can complete accepted collaborations"
  on public.collaboration_requests for update
  to authenticated
  using (
    kind = 'proposal'
    and status = 'accepted'
    and (requester_id = (select auth.uid()) or recipient_id = (select auth.uid()))
  )
  with check (
    kind = 'proposal'
    and status = 'completed'
    and (requester_id = (select auth.uid()) or recipient_id = (select auth.uid()))
  );

drop policy if exists "Owners can close their collaboration listings" on public.collaboration_requests;
create policy "Owners can close their collaboration listings"
  on public.collaboration_requests for update
  to authenticated
  using (
    requester_id = (select auth.uid())
    and kind = 'listing'
    and status = 'open'
  )
  with check (
    requester_id = (select auth.uid())
    and kind = 'listing'
    and status = 'closed'
  );

drop policy if exists "Owners can cancel pending proposals and listings" on public.collaboration_requests;
create policy "Owners can cancel pending proposals and listings"
  on public.collaboration_requests for delete
  to authenticated
  using (
    requester_id = (select auth.uid())
    and (
      (kind = 'proposal' and status = 'pending')
      or (kind = 'listing' and status = 'open')
    )
  );
