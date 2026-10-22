import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isSupabaseConfigured, supabaseKey, supabaseUrl } from '@/lib/supabase/config'

function getSafeDestination(request: NextRequest) {
  const next = request.nextUrl.searchParams.get('next') ?? '/'
  if (!next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return new URL('/', request.url)
  return new URL(next, request.url)
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const destination = getSafeDestination(request)
  const response = NextResponse.redirect(destination)

  if (!code || !isSupabaseConfigured || !supabaseUrl || !supabaseKey) {
    destination.searchParams.set('auth', 'error')
    response.headers.set('Location', destination.toString())
    return response
  }

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value))
      },
    },
  })

  const { error } = await supabase.auth.exchangeCodeForSession(code)
  destination.searchParams.set('auth', error ? 'error' : 'confirmed')
  response.headers.set('Location', destination.toString())
  return response
}
