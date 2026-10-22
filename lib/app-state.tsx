'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { getSupabaseClient } from '@/lib/supabase'
import type { Badge, Route } from '@/lib/types'

type AppState = {
  badges: Badge[]
  role: Badge
  creator: boolean
  isLoggedIn: boolean
  hydrated: boolean
  mobileNav: boolean
  upgradeOpen: boolean
  authOpen: boolean
  authNext: Route
  authTab: 'login' | 'register'
  notice: string | null
  setMobileNav: (value: boolean) => void
  setUpgradeOpen: (value: boolean) => void
  toggleBadge: (b: Badge) => void
  go: (route: Route) => void
  create: () => void
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, displayName: string, role: Badge, next: Route) => Promise<boolean>
  logout: () => Promise<void>
  requireAuth: (next: Route) => void
  openAuth: (next: Route, tab?: 'login' | 'register') => void
  closeAuth: () => void
  dismissNotice: () => void
}

const AppStateContext = createContext<AppState | null>(null)
const BADGES: Badge[] = ['reader', 'writer', 'artist']

function accountFromUser(user: User): { badges: Badge[]; role: Badge } {
  const metadataBadges = user.user_metadata.badges
  const badges: Badge[] = Array.isArray(metadataBadges)
    ? Array.from(new Set<Badge>(['reader', ...metadataBadges.filter((value): value is Badge => BADGES.includes(value))]))
    : ['reader']
  const selectedRole = user.user_metadata.role
  const role = BADGES.includes(selectedRole) && badges.includes(selectedRole)
    ? selectedRole
    : badges.find((badge) => badge !== 'reader') ?? 'reader'

  return { badges, role }
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<User | null>(null)
  const [badges, setBadges] = useState<Badge[]>(['reader'])
  const [role, setRole] = useState<Badge>('reader')
  const [hydrated, setHydrated] = useState(false)
  const [mobileNav, setMobileNav] = useState(false)
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [authNext, setAuthNext] = useState<Route>('/')
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login')
  const [notice, setNotice] = useState<string | null>(null)
  const creator = badges.includes('writer') || badges.includes('artist')

  const applyUser = (nextUser: User | null) => {
    setUser(nextUser)
    if (nextUser) {
      const account = accountFromUser(nextUser)
      setBadges(account.badges)
      setRole(account.role)
    } else {
      setBadges(['reader'])
      setRole('reader')
    }
  }

  useEffect(() => {
    const query = new URLSearchParams(window.location.search)
    const authResult = query.get('auth')
    if (authResult === 'confirmed') setNotice('Email confirmed. Your account is ready.')
    if (authResult === 'error') setNotice('We could not confirm your email link. Request a new confirmation email and try again.')

    if (authResult) {
      query.delete('auth')
      const remainingQuery = query.toString()
      const cleanUrl = `${window.location.pathname}${remainingQuery ? `?${remainingQuery}` : ''}${window.location.hash}`
      window.history.replaceState(window.history.state, '', cleanUrl)
    }
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setHydrated(true)
      return
    }

    let active = true
    const supabase = getSupabaseClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return
      applyUser(session?.user ?? null)
      setHydrated(true)
    })

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return
      if (error) throw error
      applyUser(data.session?.user ?? null)
      setHydrated(true)
    }).catch((error: unknown) => {
      if (!active) return
      setNotice(error instanceof Error ? error.message : 'Could not restore your Supabase session.')
      setHydrated(true)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  const go = (route: Route) => {
    router.push(route)
    setMobileNav(false)
  }

  const openAuth = (next: Route, tab: 'login' | 'register' = 'login') => {
    setAuthNext(next)
    setAuthTab(tab)
    setAuthOpen(true)
    setMobileNav(false)
  }

  const closeAuth = () => setAuthOpen(false)

  const requireAuth = (next: Route) => {
    openAuth(next, 'login')
    if (pathname !== '/') router.push('/')
  }

  const toggleBadge = async (badge: Badge) => {
    if (!user) {
      requireAuth('/settings')
      return
    }

    const nextBadges = badges.includes(badge)
      ? badges.filter((item) => item !== badge)
      : [...badges, badge]
    const nextRole = role === badge && !nextBadges.includes(badge)
      ? nextBadges.find((item) => item !== 'reader') ?? 'reader'
      : badge !== 'reader' ? badge : role

    try {
      const { data, error } = await getSupabaseClient().auth.updateUser({
        data: { ...user.user_metadata, badges: nextBadges, role: nextRole },
      })
      if (error) throw error
      applyUser(data.user)
    } catch (error) {
      setNotice(error instanceof Error ? `Could not update your badges: ${error.message}` : 'Could not update your badges.')
    }
  }

  const create = () => {
    if (!user) return requireAuth('/create')
    return creator ? go('/create') : setUpgradeOpen(true)
  }

  const signIn = async (email: string, password: string) => {
    const { data, error } = await getSupabaseClient().auth.signInWithPassword({ email, password })
    if (error) throw error
    if (data.user) applyUser(data.user)
  }

  const signUp = async (email: string, password: string, displayName: string, selectedRole: Badge, next: Route) => {
    const badges: Badge[] = selectedRole === 'reader' ? ['reader'] : ['reader', selectedRole]
    const { data, error } = await getSupabaseClient().auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName, badges, role: selectedRole },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    })
    if (error) throw error
    if (data.session && data.user) applyUser(data.user)
    return !data.session
  }

  const logout = async () => {
    try {
      const { error } = await getSupabaseClient().auth.signOut()
      if (error) throw error
      applyUser(null)
      go('/')
    } catch (error) {
      setNotice(error instanceof Error ? `Could not sign out: ${error.message}` : 'Could not sign out.')
    }
  }

  const dismissNotice = () => setNotice(null)

  return (
    <AppStateContext.Provider
      value={{
        badges,
        role,
        creator,
        isLoggedIn: user !== null,
        hydrated,
        mobileNav,
        upgradeOpen,
        authOpen,
        authNext,
        authTab,
        notice,
        setMobileNav,
        setUpgradeOpen,
        toggleBadge,
        go,
        create,
        signIn,
        signUp,
        logout,
        requireAuth,
        openAuth,
        closeAuth,
        dismissNotice,
      }}
    >
      {children}
    </AppStateContext.Provider>
  )
}

export function useAppState() {
  const ctx = useContext(AppStateContext)
  if (!ctx) throw new Error('useAppState must be used within an AppStateProvider')
  return ctx
}
