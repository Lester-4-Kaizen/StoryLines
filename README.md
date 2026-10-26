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

### Moderation account restrictions

After the admin moderation migration, apply `20261027000300_enforce_moderation_account_restrictions.sql` in Supabase SQL Editor (or apply pending migrations with the Supabase CLI). It installs the account-status RPC used by the app, restrictive RLS policies, and write guards for RLS-enabled public tables.

If authenticated readers receive `permission denied` errors for chapter or reading-progress queries, also apply `20261027000400_repair_library_reader_grants.sql`. It restores the intended column-level grants; row-level security remains enabled and unchanged.

If `record_my_chapter_reading_progress` returns a `42702` ambiguous `chapter_id` error, apply `20261027000500_fix_chapter_progress_rpc_ambiguity.sql`.

For account blocking and shared conversation customization, apply `20261027000600_blocked_account_visibility_and_shared_chat_customization.sql`. It hides blocked accounts and their content, removes follows in both directions, provides the Settings → Blocked Accounts list, and stores shared chat appearance, nicknames, and quick reactions. Pinning and accessibility preferences remain private to each user. The migration must be applied before using these features.

Active accounts retain their existing access. Suspended accounts can read public community posts and profiles only; they cannot read stories or other app data, or write to app tables/storage. Banned accounts cannot access app tables or storage. The app checks status while open, shows warning and restriction notices, and provides suspended users a read-only community feed. These database protections take effect only after the migration has been applied to the Supabase project.

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

Apply [`supabase/migrations/20261025000000_collaboration_requests.sql`](./supabase/migrations/20261025000000_collaboration_requests.sql) after the profile page migration to enable the Supabase-backed Collaborate page. The directory lists only real profiles that have enabled **Open for collaboration** and match the selected creator role. Creators can send direct proposals, publish public project listings, respond to listings, accept or decline incoming proposals, and mark accepted collaborations complete. Request visibility and allowed status changes are enforced by row-level security.

Liked and Saved profile categories are private to the profile owner and are available to Reader accounts as well as creators. They refer to Community posts; saved Stories and Comics and reading history live in the Library.

On an account's own profile, the **Liked** and **Saved** tabs show that signed-in user's private post activity and are hidden from other profile visitors. **Settings → Upgrade account** follows the account-role layout; badge selections are saved explicitly. The Light/Dark theme preference is stored in that browser, applies across the site, and switches the header logo to match.

Apply [`supabase/migrations/20261023000600_community_post_edits.sql`](./supabase/migrations/20261023000600_community_post_edits.sql) to let a post's author edit its text from the three-dot menu. Only the `content` column is updateable, and row-level security restricts edits to the author. The `/community` route redirects signed-out visitors to login; public profile previews remain available.

Apply [`supabase/migrations/20261026000800_community_content_reports.sql`](./supabase/migrations/20261026000800_community_content_reports.sql), [`supabase/migrations/20261026000900_community_feed_post_controls.sql`](./supabase/migrations/20261026000900_community_feed_post_controls.sql), and [`supabase/migrations/20261026001000_hidden_post_feedback.sql`](./supabase/migrations/20261026001000_hidden_post_feedback.sql) in order to enable private, rate-limited reports, the Community post menu's persistent Hide and Mute actions, and private hide-reason feedback. Save uses the existing private saved-posts table, and Block uses the existing account-control function. Users can read or change only their own hidden-post and muted-author rows. Settings includes a Blocked accounts section with unblock controls; profile action menus also provide Block and Report.

Apply [`supabase/migrations/20261023000700_library_and_reader.sql`](./supabase/migrations/20261023000700_library_and_reader.sql) after the creator works migration to enable private saved works and reading history, plus published story chapters for the reader. Signed-in users can save and remove works, resume stories, filter and sort their saved list, and clear reading history. Chapter records and reading state are protected by row-level security. The current comic creator does not persist comic page images yet, so saved comics can appear in the Library but cannot be read there until page storage is implemented.

On **Settings → Upgrade account**, Reader is always included. Turn on Writer or Artist / Comics and save to add creator capabilities; enabling the first creator badge selects it as the active role. Accounts with multiple badges can choose their active Reader, Writer, or Artist / Comics role in the same settings page.

Apply [`supabase/migrations/20261023000800_creator_studio_fields.sql`](./supabase/migrations/20261023000800_creator_studio_fields.sql) after the Library migration to add story ratings, content warnings, and chapter author notes. Apply it from the Supabase SQL Editor by opening the migration, copying its full contents, and running it against the project; existing creator works receive safe defaults. The Creator Studio loads and saves works through Supabase and requires the earlier creator-work, library, and profile migrations to be applied first. Standalone artwork uploads are not available yet. New Comic project creation is temporarily disabled for all users because comic-page image hosting is not available.

Apply [`supabase/migrations/20261023000900_comic_editor.sql`](./supabase/migrations/20261023000900_comic_editor.sql) after migration `00800` to save Comic pages, transcripts, reading direction, reader background/spacing, and episode author notes with owner-only draft access. Comic page images use Cloudflare Images Direct Creator Upload, so private API credentials stay server-side. In Cloudflare Dashboard → Images, enable Cloudflare Images and create an account-scoped API token with Images edit permission. Configure these server environment variables in local `.env.local` and in Vercel for Production, Preview, and Development:

```env
CLOUDFLARE_ACCOUNT_ID=<cloudflare-account-id>
CLOUDFLARE_IMAGES_API_TOKEN=<account-scoped-images-edit-token>
CLOUDFLARE_IMAGES_DELIVERY_HASH=<images-delivery-hash>
```

The dashboard URL is for account management, not an upload or image URL. Never use it as a page image URL or expose the API token in a `NEXT_PUBLIC_` variable. Uploaded comic page URLs are public Cloudflare Images delivery URLs; work/page metadata and drafts are still protected by Supabase RLS. Apply the Supabase migration before deploying code that reads the new Comic columns and page table.

Apply [`supabase/migrations/20261024000000_work_covers_storage.sql`](./supabase/migrations/20261024000000_work_covers_storage.sql) in Supabase to enable optional Story and Comic cover uploads through Supabase Storage. The public `work-covers` bucket allows authenticated Writers and Artists to upload into their own user-ID folder; no Cloudflare Images configuration is needed for cover images. Covers are staged locally and uploaded only when the project is saved.

Apply [`supabase/migrations/20261023001000_browse_creator_stats.sql`](./supabase/migrations/20261023001000_browse_creator_stats.sql) to power the Browse Authors directory's follower and published-work counts. The function returns aggregate counts only for Writer and Artist profiles and accepts at most 50 profile IDs per call.

Apply [`supabase/migrations/20261023001100_work_moods.sql`](./supabase/migrations/20261023001100_work_moods.sql) after migration `00900` to store up to three supported moods on each work. Browse uses these values to filter Story and Comic works; the same moods can be selected in the new-work setup, story editor, comic editor, and existing-work editor. Apply `01000` and `01100` in numerical order before deploying the corresponding Browse updates.

Apply [`supabase/migrations/20261023001200_profile_social_and_avatars.sql`](./supabase/migrations/20261023001200_profile_social_and_avatars.sql) after `20261023001100_work_moods.sql` (and the earlier required profile/community migrations) to enable public profile pictures and paginated Followers/Following lists. It creates the public `avatars` Storage bucket with a 5 MB limit, allows each signed-in user to upload or remove files only under their own user-ID folder, and adds the `get_community_connections` RPC. Run the migration before deploying profile-photo or follower-list UI.

Apply [`supabase/migrations/20261025001400_profile_background_photos.sql`](./supabase/migrations/20261025001400_profile_background_photos.sql) after migration `20261025001300_library_liked_works.sql` to add profile background photos and saved framing settings. Profile owners can upload, widen, reposition vertically, replace, or remove their banner from Edit profile. It uses the existing public `avatars` bucket, updates the account-reset function to clear banner settings, and restores the select grants and RLS policies required to read community comments, message reactions, and unread messages.

If migration `20261025001400` was already applied before the latest banner controls and read-permission fixes, apply [`supabase/migrations/20261025001500_profile_banner_and_read_permissions.sql`](./supabase/migrations/20261025001500_profile_banner_and_read_permissions.sql) next. It adds the separate banner width and vertical-position settings and reapplies the column-level read grants and participant/public read policies needed by the profile and community UI.

Apply [`supabase/migrations/20261025001600_community_comment_permissions_and_edits.sql`](./supabase/migrations/20261025001600_community_comment_permissions_and_edits.sql) after `20261025001500`. It restores authenticated comment inserts and enables authors to edit only their own comment content, with database-enforced 1–500 character validation. Run it against the same Supabase project configured for the app before deploying the comment-edit UI.

Account maintenance runs in the Supabase Edge Function at [`supabase/functions/delete-account/index.ts`](./supabase/functions/delete-account/index.ts). Apply all migrations from `20261023000000` through `20261023001400` in numerical order before deploying it with `supabase functions deploy delete-account`.

The function validates the caller's access token and removes their account-owned Supabase Storage files and Cloudflare Images referenced by their works. The reset action calls `reset_my_account_data()` using the caller's JWT, removes their works, chapters, comic pages, posts, comments, likes, saves, follows, messages, and reading history, clears profile details and media, resets the profile and Auth role to Reader, and keeps the Auth account, email, username, display name, and login. It uses `SUPABASE_ANON_KEY` in the Edge Function runtime with the caller's JWT for the reset RPC; it does not expose a service-role key to the browser. The permanent delete action additionally deletes the Auth account; foreign-key cascades remove its profile and remaining related rows. The service-role key is only used inside the managed Edge Function.

For Cloudflare image cleanup, set the existing account ID and Images edit token as Supabase Edge Function secrets too; Vercel environment variables are not automatically available to Edge Functions:

```sh
supabase secrets set CLOUDFLARE_ACCOUNT_ID=<cloudflare-account-id> CLOUDFLARE_IMAGES_API_TOKEN=<account-scoped-images-edit-token>
```

If account-owned Cloudflare images exist but these Edge Function secrets are missing, account maintenance is refused before its database data is removed. Avatar files and Community post images are removed from Supabase Storage. The current browser's user-specific editor drafts and legacy Community posts are cleared after reset or deletion; drafts stored only in another device's browser cannot be removed remotely. A reset keeps the login active; permanent deletion navigates to `/login?account=deleted`.

Apply [`supabase/migrations/20261023001400_social_notifications_and_comment_replies.sql`](./supabase/migrations/20261023001400_social_notifications_and_comment_replies.sql) after migration `01300` before deploying Messages, Updates, comment replies/reactions, or the latest account-reset code. It adds recipient-only notifications created by database triggers, per-message read timestamps, comment reply references and reaction counts. The new `/messages` and `/updates` routes require a signed-in user; conversation and notification reads are protected by RLS. Messages and notifications load newest-first and can fetch older entries with cursor-based pagination. No additional environment variables or Storage buckets are needed.

Apply [`supabase/migrations/20261025000100_messaging_and_community_counts.sql`](./supabase/migrations/20261025000100_messaging_and_community_counts.sql) after all earlier migrations, including `20261023001400_social_notifications_and_comment_replies.sql` and `20261025000000_collaboration_requests.sql`. It restores the direct-message read/write grants and participant-only row policies, and exposes accurate comment totals to the community feed. The Messages page reports a clear setup error if Supabase rejects these permissions.

Apply [`supabase/migrations/20261025000200_message_replies_and_reactions.sql`](./supabase/migrations/20261025000200_message_replies_and_reactions.sql) after `20261025000100_messaging_and_community_counts.sql` to enable message replies and emoji reactions. Apply [`supabase/migrations/20261025000300_fix_message_policy_recursion.sql`](./supabase/migrations/20261025000300_fix_message_policy_recursion.sql) after `20261025000200_message_replies_and_reactions.sql` to avoid recursive row-level security when validating message replies. Apply [`supabase/migrations/20261025000400_conversation_archiving.sql`](./supabase/migrations/20261025000400_conversation_archiving.sql) after migration `20261025000300` to enable per-user conversation archiving and deletion, then apply [`supabase/migrations/20261025000500_set_conversation_state_rpc.sql`](./supabase/migrations/20261025000500_set_conversation_state_rpc.sql) to perform archive, restore, and delete actions through an authenticated database function. Apply [`supabase/migrations/20261025000600_fix_conversation_state_rpc.sql`](./supabase/migrations/20261025000600_fix_conversation_state_rpc.sql) after `20261025000500` to fix an ambiguous conflict target in that function. Apply [`supabase/migrations/20261025000700_message_requests_and_account_controls.sql`](./supabase/migrations/20261025000700_message_requests_and_account_controls.sql) to require recipient-following before a new direct chat can start, route other first messages to Message Requests, and enable per-account restriction and blocking. Then apply [`supabase/migrations/20261025000800_message_request_chat_flow.sql`](./supabase/migrations/20261025000800_message_request_chat_flow.sql) so pending requests are shared across the conversation, prevent duplicate requests in either direction, and expose request decisions in the chat itself. The Messages inbox provides All, Unread, Archived Messages, Message Requests, Restricted Account, and Blocked accounts folders. Requests from restricted accounts are hidden in Restricted Account; unrestrict an account before accepting its request. Blocked accounts cannot receive messages or requests. Archive and delete require confirmation; delete removes the conversation from only the signed-in user's inbox and conversation view, preserving the other participant's copy. Messaging supports text and emoji only; image, audio, and video attachments are not supported.

Apply [`supabase/migrations/20261025000900_message_request_race_and_block_fixes.sql`](./supabase/migrations/20261025000900_message_request_race_and_block_fixes.sql) after migration `20261025000800`. It resolves any existing reciprocal pending requests, enforces one pending request per conversation, serializes request submissions and account-control changes, and declines pending requests in either direction when an account is blocked.

Apply [`supabase/migrations/20261025001000_work_engagement_and_rankings.sql`](./supabase/migrations/20261025001000_work_engagement_and_rankings.sql) after migration `20261025000900` to enable work likes, view counts, Ranking, Trending, and creator engagement analytics. Views count once per signed-in reader per work per UTC day; logged-out readers and work authors do not add views. Stories and comics rank by views, creators rank by followers, and likes provide the supporting tie-breaker. Apply [`supabase/migrations/20261026000000_remove_ranking_points.sql`](./supabase/migrations/20261026000000_remove_ranking_points.sql) afterward to remove the earlier points API. Apply this migration set before deploying the updated reader, Ranking, Home, or Creator Analytics pages.

Apply [`supabase/migrations/20261025001100_chapter_reading_completion.sql`](./supabase/migrations/20261025001100_chapter_reading_completion.sql) after migration `20261025001000_work_engagement_and_rankings.sql`. It stores each signed-in reader's chapter status and marks a chapter as read only when its end is reached. Apply it before deploying the updated reader.

Apply [`supabase/migrations/20261025001200_chapter_discussions_chat_unsend_and_reader_position.sql`](./supabase/migrations/20261025001200_chapter_discussions_chat_unsend_and_reader_position.sql) after migration `20261025001100_chapter_reading_completion.sql`. It adds paragraph-anchored chapter discussions and reactions, message unsend tombstones, and saved scroll position for the reader. It also updates account-data reset to remove chapter comments and reactions. Apply it before deploying the updated reader or Messages UI. Community Following and My Posts feeds use the existing follows and posts tables; direct-message unread counts appear separately from social notification counts.

Apply [`supabase/migrations/20261027001100_chapter_wide_discussions_and_policy_fix.sql`](./supabase/migrations/20261027001100_chapter_wide_discussions_and_policy_fix.sql) after the other `20261027` moderation migrations and before deploying this reader update. It fixes recursive chapter-comment insert-policy evaluation and enables a separate chapter-wide discussion at the end of each chapter, while preserving paragraph-anchored discussions.

Apply [`supabase/migrations/20261027001200_chapter_discussion_reactions.sql`](./supabase/migrations/20261027001200_chapter_discussion_reactions.sql) after migration `20261027001100_chapter_wide_discussions_and_policy_fix.sql`. It adds the chapter reaction bar and securely stores one reaction per account per published chapter.

Apply [`supabase/migrations/20261027001300_work_wide_discussions.sql`](./supabase/migrations/20261027001300_work_wide_discussions.sql) after migration `20261027001200_chapter_discussion_reactions.sql` to add a whole-story discussion below the work overview and chapter list, including threaded replies, comment reactions, reporting, and moderation. The migration applies published-work, account-status, and block checks, and includes work discussion comments in account-data reset.

Apply [`supabase/migrations/20261027001400_discussion_notifications.sql`](./supabase/migrations/20261027001400_discussion_notifications.sql) after the work-wide discussion migration to notify work and chapter authors when readers comment or reply in those discussions. Notifications appear in the Updates activity feed and link back to the relevant discussion.

Apply [`supabase/migrations/20261027001500_discussion_mention_notifications.sql`](./supabase/migrations/20261027001500_discussion_mention_notifications.sql) after migration `20261027001400_discussion_notifications.sql` to enable `@username` notifications inside chapter and story discussions. Community posts, comments, and replies support username autocomplete and mentions through their existing notification triggers.

Apply [`supabase/migrations/20261027001600_staff_safe_mentions_and_work_author_notifications.sql`](./supabase/migrations/20261027001600_staff_safe_mentions_and_work_author_notifications.sql) after migration `20261027001500_discussion_mention_notifications.sql`. It removes moderators and admins from mention suggestions and ensures story authors are notified about new discussion comments and replies.

Apply [`supabase/migrations/20261027001700_mention_following_suggestions.sql`](./supabase/migrations/20261027001700_mention_following_suggestions.sql) after migration `20261027001600_staff_safe_mentions_and_work_author_notifications.sql`. Typing `@` shows up to six followed creators; typing a username prefix searches all non-staff accounts.

Apply [`supabase/migrations/20261027001800_mention_everyone_notifications.sql`](./supabase/migrations/20261027001800_mention_everyone_notifications.sql) after migration `20261027001700_mention_following_suggestions.sql` to add `@everyone` mentions. These notify the non-staff accounts that follow the commenter, in community posts/comments and chapter/story discussions.

Apply [`supabase/migrations/20261027001900_fix_community_comment_policy_recursion.sql`](./supabase/migrations/20261027001900_fix_community_comment_policy_recursion.sql) after migration `20261027001800_mention_everyone_notifications.sql`. It fixes recursive RLS evaluation when inserting replies to community comments; apply it before using comment notifications, since the Updates activity feed also reads those comments for notification context.

Apply [`supabase/migrations/20261027002000_paragraph_discussion_comment_counts.sql`](./supabase/migrations/20261027002000_paragraph_discussion_comment_counts.sql) after migration `20261027001900_fix_community_comment_policy_recursion.sql` to show comment counts beside paragraph discussion controls in the story reader.

Apply [`supabase/migrations/20261025001300_library_liked_works.sql`](./supabase/migrations/20261025001300_library_liked_works.sql) after migration `20261025001200_chapter_discussions_chat_unsend_and_reader_position.sql` to let signed-in users view their own liked works in a separate Library category. It grants access only to each user's own like records.

## Auth routes and behavior

- `/login`, `/signup`, `/forgot-password`, and `/reset-password` are standalone pages.
- `/auth/callback` exchanges confirmation, recovery, and OAuth codes for an SSR session.
- Protected routes redirect guests to `/login?next=...`; the `next` destination is restricted to same-site relative paths.
- Email confirmation and resend behavior depends on the Email provider configuration above. New signups show a check-your-inbox state when confirmation is enabled.
- Social buttons work only after the corresponding Google/Facebook provider is enabled in Supabase.
- CAPTCHA is not enabled by default. Add Supabase CAPTCHA protection (for example, Cloudflare Turnstile or hCaptcha) only if signup abuse becomes a measured problem; enable it in Supabase Auth and pass the provider token to the relevant Auth calls on both signup and recovery forms.

## Staff moderation console

Apply [`supabase/migrations/20261027000000_admin_moderation.sql`](./supabase/migrations/20261027000000_admin_moderation.sql) after the reports, profiles, community content, works, chapter discussion, and notifications migrations. It adds staff-only moderation RPCs, account status and warning history, hidden-content flags, outcome notifications, and a protected audit log. Apply it before deploying the admin console.

Also apply [`supabase/migrations/20261027000100_hidden_content_policy_permissions.sql`](./supabase/migrations/20261027000100_hidden_content_policy_permissions.sql) after the moderation migration. It grants the hidden-flag column permissions required by public content policies.

Apply [`supabase/migrations/20261027000700_warning_appeals.sql`](./supabase/migrations/20261027000700_warning_appeals.sql) after the other `20261027` migrations to enable per-warning appeals. Users can submit and track an appeal in Settings or on the account-restricted screen; staff review pending appeals at `/admin/appeals`. Uphold/rescind decisions update the warning count when appropriate, notify the user, and remain in the audit log.

Apply [`supabase/migrations/20261027000900_message_moderation.sql`](./supabase/migrations/20261027000900_message_moderation.sql) after the existing message reports, moderation, account-restriction, and appeal migrations and before deploying message moderation. It adds message-report status tracking, staff-only queue/detail data with nearby conversation context, and audited Dismiss, Hide message, Warn, Suspend, and Ban actions. Reporters and reported users can receive in-app outcome notifications. Message reports then appear in the existing `/admin/reports` queue alongside community-content reports.

Apply [`supabase/migrations/20261027001000_message_report_abuse_controls.sql`](./supabase/migrations/20261027001000_message_report_abuse_controls.sql) after message moderation and before deploying message-report submission changes. It moves report submission behind an authenticated database function, validates that the report is tied to a real conversation and a message authored by the reported user, rejects duplicate reports, and limits combined content and message reports to five per reporter per hour.

Staff privileges are stored in `profiles.staff_role`, a column that is not selectable or writable by regular app clients. To grant the first administrator, use the Supabase SQL Editor with the account's existing username:

```sql
update public.profiles
set staff_role = 'admin'
where username = 'your_admin_username';
```

Moderators can review reports and act on accounts and content. Only administrators can add/remove staff or change staff roles. Each page and API request checks the signed-in user's database role, and every privileged database function checks it again; ordinary profile roles or browser metadata do not grant staff access. Administrator accounts are routed to the admin console instead of the regular site. A suspended account is blocked from app routes until its suspension expires; a banned account remains blocked until restored by staff. Moderation outcomes can be sent to reporters and reported users as in-app Updates.
