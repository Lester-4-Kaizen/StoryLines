alter table public.community_conversation_mutes
  add column if not exists expires_at timestamptz;

grant select (expires_at) on public.community_conversation_mutes to authenticated;
grant insert (expires_at) on public.community_conversation_mutes to authenticated;
grant update (expires_at) on public.community_conversation_mutes to authenticated;

drop policy if exists "Users can update their own conversation mutes"
  on public.community_conversation_mutes;
create policy "Users can update their own conversation mutes"
  on public.community_conversation_mutes for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and user_id <> partner_id
  );

create table if not exists public.community_conversation_preferences (
  user_id uuid not null references public.profiles (id) on delete cascade,
  partner_id uuid not null references public.profiles (id) on delete cascade,
  bubble_color text not null default 'espresso'
    check (bubble_color in ('espresso', 'rust', 'chestnut', 'amber', 'sage', 'blue', 'plum')),
  chat_background text not null default 'paper'
    check (chat_background in ('paper', 'sepia', 'night', 'plain')),
  nickname_self text not null default '' check (char_length(nickname_self) <= 40),
  nickname_partner text not null default '' check (char_length(nickname_partner) <= 40),
  quick_reaction text not null default '❤️'
    check (quick_reaction in ('❤️', '😂', '😮', '😢', '👍', '🔥')),
  pinned boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, partner_id),
  constraint community_conversation_preferences_no_self check (user_id <> partner_id)
);

alter table public.community_conversation_preferences enable row level security;
revoke all on table public.community_conversation_preferences from public, anon, authenticated;
grant select (
  user_id, partner_id, bubble_color, chat_background, nickname_self, nickname_partner,
  quick_reaction, pinned, updated_at
) on public.community_conversation_preferences to authenticated;
grant insert (
  user_id, partner_id, bubble_color, chat_background, nickname_self, nickname_partner,
  quick_reaction, pinned
) on public.community_conversation_preferences to authenticated;
grant update (
  user_id, partner_id, bubble_color, chat_background, nickname_self, nickname_partner,
  quick_reaction, pinned
) on public.community_conversation_preferences to authenticated;

drop policy if exists "Users can read their own conversation preferences"
  on public.community_conversation_preferences;
create policy "Users can read their own conversation preferences"
  on public.community_conversation_preferences for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own conversation preferences"
  on public.community_conversation_preferences;
create policy "Users can create their own conversation preferences"
  on public.community_conversation_preferences for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and user_id <> partner_id
  );

drop policy if exists "Users can update their own conversation preferences"
  on public.community_conversation_preferences;
create policy "Users can update their own conversation preferences"
  on public.community_conversation_preferences for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and user_id <> partner_id
  );

create table if not exists public.community_chat_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  text_size text not null default 'medium' check (text_size in ('small', 'medium', 'large')),
  message_sound boolean not null default true,
  reduce_motion boolean not null default false,
  high_contrast boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.community_chat_preferences
  add column if not exists message_sound boolean not null default true;

alter table public.community_chat_preferences enable row level security;
revoke all on table public.community_chat_preferences from public, anon, authenticated;
grant select (user_id, text_size, message_sound, reduce_motion, high_contrast, updated_at)
  on public.community_chat_preferences to authenticated;
grant insert (user_id, text_size, message_sound, reduce_motion, high_contrast)
  on public.community_chat_preferences to authenticated;
grant update (text_size, message_sound, reduce_motion, high_contrast)
  on public.community_chat_preferences to authenticated;

drop policy if exists "Users can read their own chat preferences"
  on public.community_chat_preferences;
create policy "Users can read their own chat preferences"
  on public.community_chat_preferences for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own chat preferences"
  on public.community_chat_preferences;
create policy "Users can create their own chat preferences"
  on public.community_chat_preferences for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own chat preferences"
  on public.community_chat_preferences;
create policy "Users can update their own chat preferences"
  on public.community_chat_preferences for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function public.notify_community_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.community_conversation_mutes as mute
    where mute.user_id = new.recipient_id
      and mute.partner_id = new.sender_id
      and (mute.expires_at is null or mute.expires_at > pg_catalog.now())
  ) then
    insert into public.user_notifications (recipient_id, actor_id, kind, message_id)
    values (new.recipient_id, new.sender_id, 'message', new.id);
  end if;
  return new;
end;
$$;
