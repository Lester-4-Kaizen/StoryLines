grant select (is_hidden) on public.community_posts to anon, authenticated;
grant select (is_hidden) on public.creator_works to anon, authenticated;

notify pgrst, 'reload schema';
