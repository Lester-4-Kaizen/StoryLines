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

There is no production domain configured in this workspace yet. The production URL is assigned by your hosting provider when you deploy; it is not the Supabase project URL.

For Vercel, after the project is deployed:

1. Open **Vercel Dashboard → your project → Deployments** and open the deployment marked **Production**. Its assigned `*.vercel.app` URL is a working production domain.
2. If you connected a custom domain, find it under **Project → Settings → Domains**. Use whichever production hostname you want people to visit.
3. In Supabase **Authentication → URL Configuration → Redirect URLs**, add the exact callback URL: `https://<your-production-hostname>/auth/callback` (replace the example hostname with the real one shown by Vercel).
4. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to the Vercel project's **Settings → Environment Variables** for Production, then redeploy.

Do not enter `https://your-domain.example` literally; it is only a placeholder. If you have not deployed the app or assigned a custom domain, use the Vercel `*.vercel.app` hostname from the Production deployment. This local workspace is not linked to a Vercel project, so its production hostname cannot be determined here.

Users can register and sign in with email and password. If email confirmation is enabled in Supabase, confirmation links return to the app's `/auth/callback` route, which exchanges the confirmation code for a session and returns the user to the page they were heading to. The selected Reader, Writer, or Artist badge is saved as Supabase user metadata and restored with the authenticated account.

The app's previous demo sign-in was stored only in this browser. It does not create Supabase users; register a real account to use the new authentication flow.
