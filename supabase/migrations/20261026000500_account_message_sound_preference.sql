alter table public.community_chat_preferences
  add column if not exists message_sound boolean not null default true;

grant select (message_sound)
  on public.community_chat_preferences to authenticated;
grant insert (message_sound)
  on public.community_chat_preferences to authenticated;
grant update (message_sound)
  on public.community_chat_preferences to authenticated;

alter table public.community_conversation_preferences
  drop column if exists message_sound;
