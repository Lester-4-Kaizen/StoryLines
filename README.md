# StoryLines

## Supabase authentication setup

StoryLines uses Supabase Auth with `@supabase/ssr`. The browser and server use only the Supabase publishable key (or the legacy anon key); never add a `service_role` key to this app or expose one as a `NEXT_PUBLIC_` variable.

### Environment variables

Set these two variables in `.env.local` for local development:

```env
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
```

`NEXT_PUBLIC_SUPABASE_ANON_KEY` is accepted as a legacy alternative to `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. If both are present, the publishable key takes precedence.

In **Vercel Dashboard → StoryLines → Settings → Environment Variables**, set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for **Production**, **Preview**, and **Development**, then redeploy. The same public key is suitable for all three; access is restricted by Supabase RLS. No service-role secret, site URL, or Facebook/Google client secret belongs in the Next.js environment.

### Supabase URL and provider configuration

In **Supabase → Authentication → URL Configuration**:

- Set **Site URL** to `https://story-lines-evangelista.vercel.app`.
- Add these **Redirect URLs**:
  - `http://localhost:3000/auth/callback`
  - `https://story-lines-evangelista.vercel.app/auth/callback`
  - `https://*.vercel.app/auth/callback` for Vercel preview deployments. If your Vercel project uses a custom preview domain, add that exact callback URL too.

For a local-only project, set the Site URL to `http://localhost:3000` while developing. Keep the production URL as the Site URL in the production Supabase project.

In **Authentication → Providers**, enable **Email** and configure email confirmation to match the desired signup policy. Enable **Google** and **Facebook** to show working social sign-in:

- In each provider's developer console, register Supabase's callback URL, `https://<project-ref>.supabase.co/auth/v1/callback`, as the provider's OAuth redirect URI.
- Add the Google and Facebook client IDs and client secrets in the corresponding Supabase provider settings. These secrets stay in Supabase; StoryLines does not need them.
- For Facebook, configure the app's OAuth redirect URI and required app/domain details in Meta for Developers before switching the app to Live.

Review **Authentication → Rate Limits** for email sends, token verification, and sign-in attempts. Keep Supabase's protections enabled and tune them against expected traffic and email-provider limits. Username checks are served by an app route and are not covered by Supabase Auth rate limits; add request throttling if that endpoint is abused.

Use branded confirmation and password-reset templates under **Authentication → Email Templates**. Include the Supabase `{{ .ConfirmationURL }}` link in the confirmation template and `{{ .ConfirmationURL }}` for recovery; Supabase redirects through `/auth/callback` to exchange the one-time code. Test the templates on localhost and a Vercel preview before publishing.

### Profiles table and row-level security

Run this SQL in **Supabase → SQL Editor** before accepting signups. The auth trigger creates one `profiles` row per new auth user, including Google/Facebook users. OAuth accounts without a username receive a generated username; users can later update it through their profile settings. The final `INSERT` backfills users created before installing the trigger.

```sql
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  username text not null,
  roles text[] not null default array['reader']::text[],
  created_at timestamptz not null default now(),
  constraint profiles_username_valid
    check (username ~ '^[a-z0-9_]{3,20}$'),
  constraint profiles_roles_valid
    check (
      cardinality(roles) > 0
      and roles <@ array['reader', 'writer', 'artist']::text[]
    )
);

create unique index if not exists profiles_username_lower_unique
  on public.profiles (lower(username));

alter table public.profiles enable row level security;

revoke all on table public.profiles from anon, authenticated;
grant select (id, display_name, username, roles) on public.profiles to anon, authenticated;
grant update (display_name, username, roles) on public.profiles to authenticated;

drop policy if exists "Profiles are publicly readable" on public.profiles;
create policy "Profiles are publicly readable"
  on public.profiles for select
  to anon, authenticated
  using (true);

drop policy if exists "Users update their own profile" on public.profiles;
create policy "Users update their own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_name text;
  profile_username text;
  requested_username text;
  generated_username text;
  profile_roles text[];
begin
  profile_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'StoryLines reader'
  );

  requested_username := lower(nullif(btrim(new.raw_user_meta_data ->> 'username'), ''));
  generated_username := coalesce(
    nullif(
      btrim(left(regexp_replace(lower(profile_name), '[^a-z0-9_]+', '_', 'g'), 11), '_'),
      ''
    ),
    'reader'
  ) || '_' || substr(replace(new.id::text, '-', ''), 1, 8);
  profile_username := case
    when requested_username ~ '^[a-z0-9_]{3,20}$' then requested_username
    else generated_username
  end;

  select coalesce(
    array_agg(distinct requested.role),
    array['reader']::text[]
  )
  into profile_roles
  from jsonb_array_elements_text(
    case
      when jsonb_typeof(new.raw_user_meta_data -> 'roles') = 'array'
        then new.raw_user_meta_data -> 'roles'
      else '[]'::jsonb
    end
  ) as requested(role)
  where requested.role in ('reader', 'writer', 'artist');

  if cardinality(profile_roles) = 0 then
    profile_roles := array['reader']::text[];
  end if;

  insert into public.profiles (id, display_name, username, roles)
  values (new.id, profile_name, profile_username, profile_roles);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

with users_with_names as (
  select
    u.id,
    coalesce(
      nullif(btrim(u.raw_user_meta_data ->> 'display_name'), ''),
      nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
      'StoryLines reader'
    ) as display_name,
    u.raw_user_meta_data
  from auth.users as u
),
profile_rows as (
  select
    u.id,
    u.display_name,
    case
      when lower(nullif(btrim(u.raw_user_meta_data ->> 'username'), '')) ~ '^[a-z0-9_]{3,20}$'
        then lower(btrim(u.raw_user_meta_data ->> 'username'))
      else coalesce(
        nullif(
          btrim(left(regexp_replace(lower(u.display_name), '[^a-z0-9_]+', '_', 'g'), 11), '_'),
          ''
        ),
        'reader'
      ) || '_' || substr(replace(u.id::text, '-', ''), 1, 8)
    end as username,
    coalesce(
      (
        select array_agg(distinct requested.role)
        from jsonb_array_elements_text(
          case
            when jsonb_typeof(u.raw_user_meta_data -> 'roles') = 'array'
              then u.raw_user_meta_data -> 'roles'
            else '[]'::jsonb
          end
        ) as requested(role)
        where requested.role in ('reader', 'writer', 'artist')
      ),
      array['reader']::text[]
    ) as roles
  from users_with_names as u
)
insert into public.profiles (id, display_name, username, roles)
select id, display_name, username, roles
from profile_rows
on conflict (id) do nothing;
```

Public users can read only the safe profile columns granted above. Authenticated users can update only their own profile row, and cannot insert/delete rows or change the profile ID. The username unique index is case-insensitive. The signup UI checks username availability, but the database constraint remains authoritative during concurrent signups.

### Shared community posts

Community posts are stored in Supabase so they appear to all visitors, rather than only in the browser that created them. Apply [`supabase/migrations/20261023000000_community_posts.sql`](./supabase/migrations/20261023000000_community_posts.sql) in **Supabase → SQL Editor** after creating the `profiles` table above. It creates the public post feed, creator-only insert policy, and public image bucket with per-user upload permissions. The feed also uses the public profile columns to show authors and provide name/username search. Posts saved by the old device-only version remain visible on that device and are labeled **On this device**; they are not silently published to the shared feed.

The migration is additive and safe to run again. After applying it, deploy the app so the community page uses the shared feed.

The follow-up [`supabase/migrations/20261023000100_add_random_community_post_type.sql`](./supabase/migrations/20261023000100_add_random_community_post_type.sql) adds the **Random story / post** type to the composer, with matching suggested tags.

Apply [`supabase/migrations/20261023000200_community_comments_and_saved_posts.sql`](./supabase/migrations/20261023000200_community_comments_and_saved_posts.sql) to enable public comment reading, signed-in comments, and private saved posts. Saved posts are available from the community **Saved** shortcut. Author names on posts and comments, as well as entries in **Authors**, open that author's posts in the feed.

Apply [`supabase/migrations/20261023000300_allow_owners_to_delete_community_posts.sql`](./supabase/migrations/20261023000300_allow_owners_to_delete_community_posts.sql) to let signed-in authors delete their own shared posts. The delete policy checks the authenticated user ID; device-only legacy posts can be removed from that device.

Apply [`supabase/migrations/20261023000400_creator_follows.sql`](./supabase/migrations/20261023000400_creator_follows.sql) to enable follows on Writer and Artist profiles. Any signed-in account can follow creators; Reader profiles are not followable. Public profiles are available at `/profile/<user-id>`, while `/profile` remains the signed-in user's own profile.

Apply [`supabase/migrations/20261023000500_profile_page_data.sql`](./supabase/migrations/20261023000500_profile_page_data.sql) after the community posts and follows migrations to enable editable profile details and links, collaboration preferences, published creator works, persistent post likes, public follow counts, and direct messages. The profile page reads public profile data and published works on the server; private drafts and profile edits remain restricted by row-level security. The migration also creates the `creator_works` table used when creators save, update, and delete Story or Comic works.

Liked and Saved profile categories are private to the profile owner and are available to Reader accounts as well as creators. They refer to Community posts; saved Stories and Comics and reading history live in the Library.

On an account's own profile, the **Liked** and **Saved** tabs show that signed-in user's private post activity and are hidden from other profile visitors. **Settings → Upgrade account** follows the account-role layout; badge selections are saved explicitly. The Light/Dark theme preference is stored in that browser, applies across the site, and switches the header logo to match.

Apply [`supabase/migrations/20261023000600_community_post_edits.sql`](./supabase/migrations/20261023000600_community_post_edits.sql) to let a post's author edit its text from the three-dot menu. Only the `content` column is updateable, and row-level security restricts edits to the author. The `/community` route redirects signed-out visitors to login; public profile previews remain available.

Apply [`supabase/migrations/20261023000700_library_and_reader.sql`](./supabase/migrations/20261023000700_library_and_reader.sql) after the creator works migration to enable private saved works and reading history, plus published story chapters for the reader. Signed-in users can save and remove works, resume stories, filter and sort their saved list, and clear reading history. Chapter records and reading state are protected by row-level security. The current comic creator does not persist comic page images yet, so saved comics can appear in the Library but cannot be read there until page storage is implemented.

On **Settings → Upgrade account**, Reader is always included. Turn on Writer or Artist / Comics and save to add creator capabilities; enabling the first creator badge selects it as the active role. Accounts with multiple badges can choose their active Reader, Writer, or Artist / Comics role in the same settings page.

## Auth routes and behavior

- `/login`, `/signup`, `/forgot-password`, and `/reset-password` are standalone pages.
- `/auth/callback` exchanges confirmation, recovery, and OAuth codes for an SSR session.
- Protected routes redirect guests to `/login?next=...`; the `next` destination is restricted to same-site relative paths.
- Email confirmation and resend behavior depends on the Email provider configuration above. New signups show a check-your-inbox state when confirmation is enabled.
- Social buttons work only after the corresponding Google/Facebook provider is enabled in Supabase.
- CAPTCHA is not enabled by default. Add Supabase CAPTCHA protection (for example, Cloudflare Turnstile or hCaptcha) only if signup abuse becomes a measured problem; enable it in Supabase Auth and pass the provider token to the relevant Auth calls on both signup and recovery forms.
