alter table public.community_posts
  drop constraint if exists community_posts_type_check;

alter table public.community_posts
  add constraint community_posts_type_check
  check (
    type in (
      'update',
      'recommendation',
      'work-in-progress',
      'collaborator',
      'feedback',
      'poll',
      'random'
    )
  );
