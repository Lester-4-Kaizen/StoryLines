# StoryLines

## Supabase authentication

1. Create a Supabase project and enable **Email** under **Authentication → Providers**.
2. In the project's **Connect** or **API Keys** settings, copy its project URL and publishable key.
3. Copy `.env.example` to `.env.local` and fill in the values:

   ```powershell
   Copy-Item .env.example .env.local
   ```

   `NEXT_PUBLIC_SUPABASE_ANON_KEY` is also accepted for projects that still use the legacy anon key. Never use a `service_role` key in this app.
4. In **Authentication → URL Configuration**, set the local site URL to `http://localhost:3000` and add `http://localhost:3000/auth/callback` to the allowed redirect URLs.
5. Start or restart the app with `pnpm dev`.

### Production deployment URL

StoryLines is deployed at **https://story-lines-evangelista.vercel.app**. This is the Vercel-assigned production hostname; it is separate from the Supabase project URL. A custom domain can be added later in **Vercel Dashboard → story-lines → Settings → Domains**.

In Supabase **Authentication → URL Configuration**:

1. Set the production Site URL to `https://story-lines-evangelista.vercel.app`.
2. Add both `http://localhost:3000/auth/callback` and `https://story-lines-evangelista.vercel.app/auth/callback` to the allowed Redirect URLs.

The Supabase URL and publishable key are already configured on the Vercel project for Production, Preview, and Development. If you change a key, update `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in **Vercel Dashboard → story-lines → Settings → Environment Variables**, then redeploy.

Users can register and sign in with email and password. If email confirmation is enabled in Supabase, confirmation links return to the app's `/auth/callback` route, which exchanges the confirmation code for a session and returns the user to the page they were heading to. The selected Reader, Writer, or Artist badge is saved as Supabase user metadata and restored with the authenticated account.

The app's previous demo sign-in was stored only in this browser. It does not create Supabase users; register a real account to use the new authentication flow.
