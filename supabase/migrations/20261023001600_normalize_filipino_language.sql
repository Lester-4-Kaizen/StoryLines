update public.creator_works
set language = 'Filipino'
where lower(btrim(language)) = 'tagalog';

update public.profiles as profile
set writing_languages = (
  select coalesce(array_agg(normalized.language order by normalized.first_position), '{}'::text[])
  from (
    select
      case when lower(btrim(language)) = 'tagalog' then 'Filipino' else language end as language,
      min(position) as first_position
    from unnest(profile.writing_languages) with ordinality as language_values(language, position)
    group by case when lower(btrim(language)) = 'tagalog' then 'Filipino' else language end
  ) as normalized
)
where exists (
  select 1
  from unnest(profile.writing_languages) as language_values(language)
  where lower(btrim(language_values.language)) = 'tagalog'
);
