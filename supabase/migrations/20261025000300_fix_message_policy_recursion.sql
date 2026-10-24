create or replace function public.can_reply_to_community_message(
  p_reply_to_message_id uuid,
  p_sender_id uuid,
  p_recipient_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.community_direct_messages as replied
    where replied.id = p_reply_to_message_id
      and (select auth.uid()) = p_sender_id
      and (
        (p_sender_id = replied.sender_id and p_recipient_id = replied.recipient_id)
        or (p_sender_id = replied.recipient_id and p_recipient_id = replied.sender_id)
      )
  );
$$;

revoke all on function public.can_reply_to_community_message(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.can_reply_to_community_message(uuid, uuid, uuid) to authenticated;

drop policy if exists "Users can send messages as themselves" on public.community_direct_messages;
create policy "Users can send messages as themselves"
  on public.community_direct_messages for insert
  to authenticated
  with check (
    (select auth.uid()) = sender_id
    and community_direct_messages.sender_id <> community_direct_messages.recipient_id
    and (
      community_direct_messages.reply_to_message_id is null
      or public.can_reply_to_community_message(
        community_direct_messages.reply_to_message_id,
        community_direct_messages.sender_id,
        community_direct_messages.recipient_id
      )
    )
  );
