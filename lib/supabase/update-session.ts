import { clearAuthCookiesAtScopes, createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { safeNextPath } from '@/lib/auth/redirect'
import { isStaleRefreshTokenError } from '@/lib/supabase/auth-errors'
import { isSupabaseConfigured, supabaseKey, supabaseUrl } from '@/lib/supabase/config'

const PROTECTED_PREFIXES = ['/community', '/create', '/library', '/settings', '/collaborate', '/messages', '/updates']

function isProtectedPath(pathname: string) {
  return pathname === '/profile'
    || PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

function redirectWithCookies(url: URL, response: NextResponse) {
  const redirect = NextResponse.redirect(url)
  response.cookies.getAll().forEach(({ name, value, ...options }) => redirect.cookies.set(name, value, options))
  response.headers.forEach((value, name) => {
    if (name !== 'location' && name !== 'set-cookie') redirect.headers.set(name, value)
  })
  return redirect
}

export async function updateSession(request: NextRequest) {
  if (!isSupabaseConfigured || !supabaseUrl || !supabaseKey) {
    if (isProtectedPath(request.nextUrl.pathname)) {
      const login = new URL('/login', request.url)
      login.searchParams.set('next', safeNextPath(`${request.nextUrl.pathname}${request.nextUrl.search}`))
      return NextResponse.redirect(login)
    }
    return NextResponse.next({ request })
  }

  let response = NextResponse.next({ request })
  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value))
      },
    },
  })

  const storageKey = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`
  const clearStaleSession = async () => {
    await clearAuthCookiesAtScopes({
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
      storageKey,
      scopes: [{}],
    })

    if (isProtectedPath(request.nextUrl.pathname)) {
      const login = new URL('/login', request.url)
      login.searchParams.set('next', safeNextPath(`${request.nextUrl.pathname}${request.nextUrl.search}`))
      return redirectWithCookies(login, response)
    }

    return response
  }

  let isLoggedIn = false
  try {
    const result = await supabase.auth.getClaims()
    if (isStaleRefreshTokenError(result.error)) return clearStaleSession()
    if (result.error && result.error.name !== 'AuthSessionMissingError') throw result.error
    isLoggedIn = Boolean(result.data?.claims?.sub)
  } catch (error) {
    if (isStaleRefreshTokenError(error)) return clearStaleSession()
    throw error
  }

  if (isLoggedIn && ['/login', '/signup'].includes(request.nextUrl.pathname)) {
    return redirectWithCookies(new URL('/', request.url), response)
  }

  if (!isLoggedIn && isProtectedPath(request.nextUrl.pathname)) {
    const login = new URL('/login', request.url)
    login.searchParams.set('next', safeNextPath(`${request.nextUrl.pathname}${request.nextUrl.search}`))
    return redirectWithCookies(login, response)
  }

  return response
}
