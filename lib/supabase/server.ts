import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { supabaseKey, supabaseUrl } from '@/lib/supabase/config'

export async function createSupabaseServerClient() {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.')
  }

  const cookieStore = await cookies()
  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
      },
    },
  })
}
