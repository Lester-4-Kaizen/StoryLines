grant update (user_id)
  on public.community_chat_preferences to authenticated;

grant update (user_id, partner_id)
  on public.community_conversation_preferences to authenticated;

alter table public.community_conversation_preferences
  drop constraint if exists community_conversation_preferences_bubble_color_check;

alter table public.community_conversation_preferences
  add constraint community_conversation_preferences_bubble_color_check
  check (bubble_color in ('espresso', 'rust', 'chestnut', 'amber', 'sage', 'blue', 'plum', 'pink'));
