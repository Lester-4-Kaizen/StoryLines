alter table public.community_posts
  drop constraint if exists community_posts_content_check;

alter table public.community_posts
  add constraint community_posts_content_check
  check (char_length(btrim(content)) between 1 and 5000);

alter table public.community_posts
  add column if not exists work_id uuid;

alter table public.community_posts
  drop constraint if exists community_posts_work_fk;

alter table public.community_posts
  add constraint community_posts_work_fk
  foreign key (work_id)
  references public.creator_works (id)
  on delete set null;

drop policy if exists "Creators can publish their own community posts" on public.community_posts;
create policy "Creators can publish their own community posts"
  on public.community_posts for insert
  to authenticated
  with check (
    (select auth.uid()) = author_id
    and exists (
      select 1
      from public.profiles as profile
      where profile.id = (select auth.uid())
        and author_role = any (profile.roles)
    )
    and (
      work_id is null
      or exists (
        select 1
        from public.creator_works as work
        where work.id = work_id
          and work.author_id = (select auth.uid())
          and work.status <> 'Draft'
          and work.type in ('story', 'comic')
      )
    )
  );

drop policy if exists "Creators can edit their own community posts" on public.community_posts;
create policy "Creators can edit their own community posts"
  on public.community_posts for update
  to authenticated
  using ((select auth.uid()) = author_id)
  with check (
    (select auth.uid()) = author_id
    and (
      work_id is null
      or exists (
        select 1
        from public.creator_works as work
        where work.id = work_id
          and work.author_id = (select auth.uid())
          and work.status <> 'Draft'
          and work.type in ('story', 'comic')
      )
    )
  );

grant select (work_id) on public.community_posts to anon, authenticated;
grant insert (work_id) on public.community_posts to authenticated;
grant update (work_id) on public.community_posts to authenticated;
