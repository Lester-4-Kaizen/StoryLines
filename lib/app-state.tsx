'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { getSupabaseClient } from '@/lib/supabase'
import type { Badge, Route } from '@/lib/types'

type AppState = {
  badges: Badge[]
  role: Badge
  themeMode: 'light' | 'dark'
  creator: boolean
  isLoggedIn: boolean
  hydrated: boolean
  mobileNav: boolean
  upgradeOpen: boolean
  notice: string | null
  setMobileNav: (value: boolean) => void
  setUpgradeOpen: (value: boolean) => void
  setThemeMode: (mode: 'light' | 'dark') => void
  changeRole: (role: Badge) => Promise<void>
  saveBadges: (badges: Badge[]) => Promise<void>
  toggleBadge: (b: Badge) => void
  go: (route: Route) => void
  refreshSession: () => Promise<void>
  create: () => void
  logout: () => Promise<void>
  requireAuth: (next: Route) => void
  dismissNotice: () => void
}

const AppStateContext = createContext<AppState | null>(null)
const BADGES: Badge[] = ['reader', 'writer', 'artist']
const THEME_STORAGE_KEY = 'storylines-theme-mode'

function accountFromUser(user: User): { badges: Badge[]; role: Badge } {
  const metadataBadges = user.user_metadata.roles ?? user.user_metadata.badges
  const badges: Badge[] = Array.isArray(metadataBadges)
    ? Array.from(new Set<Badge>(metadataBadges.filter((value): value is Badge => BADGES.includes(value))))
    : ['reader']
  const selectedRole = user.user_metadata.role
  const role = BADGES.includes(selectedRole) && badges.includes(selectedRole)
    ? selectedRole
    : badges.find((badge) => badge !== 'reader') ?? badges[0] ?? 'reader'

  return { badges, role }
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [badges, setBadges] = useState<Badge[]>(['reader'])
  const [role, setRole] = useState<Badge>('reader')
  const [themeMode, setThemeModeState] = useState<'light' | 'dark'>('light')
  const [hydrated, setHydrated] = useState(false)
  const [mobileNav, setMobileNav] = useState(false)
  const [upgradeOpen, setUpgradeOpen] = useState(false)
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
    try {
      const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)
      const mode = savedTheme === 'dark' ? 'dark' : 'light'
      setThemeModeState(mode)
      document.documentElement.classList.toggle('dark', mode === 'dark')
    } catch (error) {
      setNotice(error instanceof Error ? `Could not load your theme preference: ${error.message}` : 'Could not load your theme preference.')
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

  const requireAuth = (next: Route) => {
    const destination = `${next}${typeof window !== 'undefined' ? window.location.search : ''}`
    router.push(`/login?next=${encodeURIComponent(destination)}`)
    setMobileNav(false)
  }

  const toggleBadge = async (badge: Badge) => {
    if (!user) {
      requireAuth('/settings')
      return
    }

    const selectedBadges = badges.includes(badge)
      ? badges.filter((item) => item !== badge)
      : [...badges, badge]
    const nextBadges = selectedBadges.length ? selectedBadges : ['reader' as const]
    try {
      await saveBadges(nextBadges)
    } catch (error) {
      setNotice(error instanceof Error ? `Could not update your badges: ${error.message}` : 'Could not update your badges.')
    }
  }

  const saveBadges = async (selectedBadges: Badge[]) => {
    if (!user) {
      requireAuth('/settings')
      throw new Error('Log in to save your account roles.')
    }
    const nextBadges = Array.from(new Set<Badge>(['reader', ...selectedBadges]))
    const isAddingFirstCreatorBadge = !badges.some((badge) => badge !== 'reader')
      && nextBadges.some((badge) => badge !== 'reader')
    const nextRole = isAddingFirstCreatorBadge
      ? nextBadges.find((badge) => badge !== 'reader') ?? 'reader'
      : nextBadges.includes(role) ? role : nextBadges.find((badge) => badge !== 'reader') ?? 'reader'
    const { error: profileError } = await getSupabaseClient()
      .from('profiles')
      .update({ roles: nextBadges })
      .eq('id', user.id)
    if (profileError) throw profileError
    const { data, error } = await getSupabaseClient().auth.updateUser({
      data: { ...user.user_metadata, badges: nextBadges, roles: nextBadges, role: nextRole },
    })
    if (error) throw error
    applyUser(data.user)
  }

  const changeRole = async (nextRole: Badge) => {
    if (!user) {
      requireAuth('/settings')
      throw new Error('Mag-log in para palitan ang active account role.')
    }
    if (!badges.includes(nextRole)) throw new Error('I-enable muna ang badge na ito sa account settings.')
    const { data, error } = await getSupabaseClient().auth.updateUser({
      data: { ...user.user_metadata, role: nextRole },
    })
    if (error) throw error
    applyUser(data.user)
  }

  const setThemeMode = (mode: 'light' | 'dark') => {
    setThemeModeState(mode)
    document.documentElement.classList.toggle('dark', mode === 'dark')
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, mode)
    } catch (error) {
      setNotice(error instanceof Error ? `Theme changed, but could not save your preference: ${error.message}` : 'Theme changed, but could not save your preference.')
    }
  }

  const create = () => {
    if (!user) return requireAuth('/create')
    return creator ? go('/create') : setUpgradeOpen(true)
  }

  const refreshSession = async () => {
    const { data, error } = await getSupabaseClient().auth.getSession()
    if (error) throw error
    applyUser(data.session?.user ?? null)
    setHydrated(true)
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
        themeMode,
        creator,
        isLoggedIn: user !== null,
        hydrated,
        mobileNav,
        upgradeOpen,
        notice,
        setMobileNav,
        setUpgradeOpen,
        setThemeMode,
        changeRole,
        saveBadges,
        toggleBadge,
        go,
        refreshSession,
        create,
        logout,
        requireAuth,
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
