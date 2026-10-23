alter table public.creator_works
  add column if not exists moods text[] not null default '{}';

alter table public.creator_works
  drop constraint if exists creator_works_moods_valid,
  add constraint creator_works_moods_valid check (
    cardinality(moods) <= 3
    and moods <@ array[
      'Kilig',
      'Cozy',
      'Heartbreak',
      'Madilim at magulo',
      'Nakakakaba',
      'Comfort read'
    ]::text[]
  );

grant select (moods) on public.creator_works to anon, authenticated;
grant insert (moods) on public.creator_works to authenticated;
grant update (moods) on public.creator_works to authenticated;
