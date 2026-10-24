alter table public.community_direct_messages enable row level security;

revoke all on table public.community_direct_messages from anon, authenticated;
grant select (id, sender_id, recipient_id, content, created_at, read_at)
  on public.community_direct_messages to authenticated;
grant insert (sender_id, recipient_id, content)
  on public.community_direct_messages to authenticated;
grant update (read_at) on public.community_direct_messages to authenticated;
grant delete on public.community_direct_messages to authenticated;

drop policy if exists "Users can read messages they sent or received" on public.community_direct_messages;
create policy "Users can read messages they sent or received"
  on public.community_direct_messages for select
  to authenticated
  using ((select auth.uid()) in (sender_id, recipient_id));

drop policy if exists "Users can send messages as themselves" on public.community_direct_messages;
create policy "Users can send messages as themselves"
  on public.community_direct_messages for insert
  to authenticated
  with check (
    (select auth.uid()) = sender_id
    and sender_id <> recipient_id
  );

drop policy if exists "Recipients can mark their own messages as read" on public.community_direct_messages;
create policy "Recipients can mark their own messages as read"
  on public.community_direct_messages for update
  to authenticated
  using ((select auth.uid()) = recipient_id)
  with check ((select auth.uid()) = recipient_id);

drop policy if exists "Senders can delete their own messages" on public.community_direct_messages;
create policy "Senders can delete their own messages"
  on public.community_direct_messages for delete
  to authenticated
  using ((select auth.uid()) = sender_id);

alter table public.community_post_comments enable row level security;

revoke all on table public.community_post_comments from anon, authenticated;
grant select (id, post_id, author_id, content, created_at, parent_comment_id)
  on public.community_post_comments to anon, authenticated;
grant insert (post_id, author_id, content, parent_comment_id)
  on public.community_post_comments to authenticated;
grant delete on public.community_post_comments to authenticated;

drop policy if exists "Community post comments are publicly readable" on public.community_post_comments;
create policy "Community post comments are publicly readable"
  on public.community_post_comments for select
  to anon, authenticated
  using (true);

drop policy if exists "Users can comment as themselves" on public.community_post_comments;
create policy "Users can comment as themselves"
  on public.community_post_comments for insert
  to authenticated
  with check (
    (select auth.uid()) = author_id
    and (
      parent_comment_id is null
      or exists (
        select 1
        from public.community_post_comments as parent
        where parent.id = parent_comment_id
          and parent.post_id = community_post_comments.post_id
      )
    )
  );

drop policy if exists "Users can delete their own community comments" on public.community_post_comments;
create policy "Users can delete their own community comments"
  on public.community_post_comments for delete
  to authenticated
  using ((select auth.uid()) = author_id);

alter table public.community_comment_reactions enable row level security;

revoke all on table public.community_comment_reactions from anon, authenticated;
grant select (comment_id, user_id, reaction) on public.community_comment_reactions to authenticated;
grant insert (comment_id, user_id, reaction) on public.community_comment_reactions to authenticated;
grant update (reaction) on public.community_comment_reactions to authenticated;
grant delete on public.community_comment_reactions to authenticated;

drop policy if exists "Users can see their own comment reactions" on public.community_comment_reactions;
create policy "Users can see their own comment reactions"
  on public.community_comment_reactions for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can react as themselves" on public.community_comment_reactions;
create policy "Users can react as themselves"
  on public.community_comment_reactions for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can change their own comment reactions" on public.community_comment_reactions;
create policy "Users can change their own comment reactions"
  on public.community_comment_reactions for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can remove their own comment reactions" on public.community_comment_reactions;
create policy "Users can remove their own comment reactions"
  on public.community_comment_reactions for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.get_community_post_comment_counts(post_ids uuid[])
returns table (post_id uuid, comment_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select comments.post_id, count(*)::bigint
  from public.community_post_comments as comments
  where cardinality(post_ids) <= 50
    and comments.post_id = any(post_ids)
  group by comments.post_id;
$$;

revoke all on function public.get_community_post_comment_counts(uuid[]) from public, anon, authenticated;
grant execute on function public.get_community_post_comment_counts(uuid[]) to anon, authenticated;
