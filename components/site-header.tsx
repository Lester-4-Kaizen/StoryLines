'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { BookMarked, ChevronDown, Inbox, Library, LogOut, Menu, Search, Settings, UserRound, X } from 'lucide-react'
import { ProfileAvatar } from '@/components/shared/profile-avatar'
import { getSupabaseClient } from '@/lib/supabase'
import type { Route } from '@/lib/types'

// Detects a click/tap outside the returned ref and calls onOutside. Used
// instead of the old invisible-full-screen-button trick — that pattern
// stacked above the rest of the header (the header has its own z-index via
// `sticky` + `z-30`, so a `fixed inset-0` child inside it ends up covering
// everything, including sibling buttons like Log in/Sign up, swallowing
// the very next tap instead of reaching whatever it was aimed at).
function useClickOutside<T extends HTMLElement>(onOutside: () => void, active: boolean) {
  const ref = useRef<T>(null)
  useEffect(() => {
    if (!active) return
    const handler = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside()
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('touchstart', handler)
    }
  }, [active, onOutside])
  return ref
}

function NavItem({
  label,
  active,
  locked,
  icon,
  onClick,
}: {
  label: string
  active?: boolean
  locked?: boolean
  icon?: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-2 text-[11px] font-bold tracking-[0.04em] transition ${
        active ? 'bg-primary-foreground/12 text-accent' : 'text-primary-foreground/75 hover:bg-primary-foreground/10 hover:text-primary-foreground'
      }`}
    >
      {icon && <span className="[&>svg]:size-3.5">{icon}</span>}
      {label}
      {locked && <span className="ml-0.5 text-[10px] opacity-60">•</span>}
    </button>
  )
}

// Used for CREATE and COLLABORATE. Unlike Webnovel, where the creator side
// lives on an entirely separate site, this stays a dropdown right off the
// main nav — clicking it either opens a quick menu of where to go (if
// you're eligible) or triggers the same login/upgrade gate as before (if
// you're not). `onBlocked` reuses the existing create()/requireAuth logic
// rather than duplicating it.
function NavMenu({
  label,
  locked,
  active,
  allowOpen,
  onBlocked,
  items,
}: {
  label: string
  locked: boolean
  active: boolean
  allowOpen: boolean
  onBlocked: () => void
  items: { label: string; href: string }[]
}) {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false), open)

  const trigger = () => {
    if (!allowOpen) {
      onBlocked()
      return
    }
    setOpen((v) => !v)
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={trigger}
        className={`flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-2 text-[11px] font-bold tracking-[0.04em] transition ${
          active ? 'bg-primary-foreground/12 text-accent' : 'text-primary-foreground/75 hover:bg-primary-foreground/10 hover:text-primary-foreground'
        }`}
      >
        {label}
        {locked && <span className="ml-0.5 text-[10px] opacity-60">•</span>}
      </button>
      {open && (
        <div className="absolute left-0 z-20 mt-2 w-48 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-card p-1 shadow-lg">
          {items.map((menuItem) => (
            <button
              key={menuItem.href}
              onClick={() => {
                setOpen(false)
                router.push(menuItem.href)
              }}
              className="block w-full rounded-md px-3 py-2 text-left text-xs font-bold text-foreground hover:bg-muted"
            >
              {menuItem.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Matches the convention on Wattpad/Webnovel/NovelFull: signed-out visitors
// get separate Log in / Sign up links; once signed in, the avatar opens an
// account menu (Profile, Library, Settings, Log out) instead of Logout
// being buried only inside Settings.
function AccountMenu({ go, logout, userId }: { go: (route: Route) => void; logout: () => void; userId: string | null }) {
  const [open, setOpen] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false), open)

  useEffect(() => {
    if (!userId) {
      setAvatarUrl(null)
      return
    }
    let active = true
    void (async () => {
      const { data, error } = await getSupabaseClient()
        .from('profiles')
        .select('avatar_path')
        .eq('id', userId)
        .maybeSingle()
      if (error) throw error
      if (active) {
        setAvatarUrl(data?.avatar_path
          ? getSupabaseClient().storage.from('avatars').getPublicUrl(data.avatar_path).data.publicUrl
          : null)
      }
    })().catch((error: unknown) => console.error('Could not load your profile photo in the header', error))
    const onAvatarUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ userId: string; avatarUrl: string | null }>).detail
      if (detail?.userId === userId) setAvatarUrl(detail.avatarUrl)
    }
    window.addEventListener('storylines:profile-avatar-updated', onAvatarUpdated)
    return () => {
      active = false
      window.removeEventListener('storylines:profile-avatar-updated', onAvatarUpdated)
    }
  }, [userId])

  const item = (label: string, route: Route, icon: React.ReactNode) => (
    <button
      onClick={() => {
        setOpen(false)
        go(route)
      }}
      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-bold text-foreground hover:bg-muted"
    >
      {icon} {label}
    </button>
  )

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded-full p-2 hover:bg-primary-foreground/10"
        aria-label="Account menu"
        aria-expanded={open}
      >
        <ProfileAvatar src={avatarUrl} name="Your profile" className="size-8" imageSizes="32px" />
        <ChevronDown className="hidden size-3.5 sm:block" />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-48 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-card p-1 shadow-lg">
          {item('Profile', '/profile', <UserRound className="size-3.5" />)}
          {item('Library', '/library', <BookMarked className="size-3.5" />)}
          {item('Settings', '/settings', <Settings className="size-3.5" />)}
          <div className="my-1 border-t border-border" />
          <button
            onClick={() => {
              setOpen(false)
              logout()
            }}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-bold text-destructive hover:bg-destructive/10"
          >
            <LogOut className="size-3.5" /> Log out
          </button>
        </div>
      )}
    </div>
  )
}

function unreadCountErrorMessage(error: unknown) {
  const readField = (field: string) => (
    typeof error === 'object' && error !== null && field in error
      ? String(Reflect.get(error, field))
      : ''
  )
  const code = readField('code')
  const message = readField('message')

  if (message.toLowerCase().includes('refresh token') || code === 'refresh_token_not_found' || code === 'PGRST301') {
    return 'Your Supabase session has expired. Sign out and sign in again to reload unread counts.'
  }
  if (code === '42703' || code === 'PGRST204' || code === 'PGRST205') {
    return 'Unread counts need the latest Supabase migrations. Apply the messaging and read-permissions migrations, then retry.'
  }
  if (code === '42501') {
    return 'Supabase denied access to unread counts. Apply migration 20261025001500_profile_banner_and_read_permissions.sql, then reload.'
  }
  return message || 'Could not load unread updates.'
}

function logUnreadCountError(context: string, error: unknown) {
  const readField = (field: string) => (
    typeof error === 'object' && error !== null && field in error
      ? Reflect.get(error, field)
      : undefined
  )
  const cause = readField('cause')
  const readCauseField = (field: string) => (
    typeof cause === 'object' && cause !== null && field in cause
      ? Reflect.get(cause, field)
      : undefined
  )
  const causeProperties = typeof cause === 'object' && cause !== null
    ? Object.fromEntries(Object.getOwnPropertyNames(cause).map((field) => {
      const value = Reflect.get(cause, field)
      return [field, value === null || ['string', 'number', 'boolean'].includes(typeof value) ? value : String(value)]
    }))
    : String(cause ?? '')
  const diagnostic = {
    query: readField('query'),
    code: readField('code') ?? readCauseField('code'),
    message: readField('message') || readCauseField('message') || String(cause ?? error),
    details: readField('details') ?? readCauseField('details'),
    hint: readField('hint') ?? readCauseField('hint'),
    status: readField('status') ?? readCauseField('status'),
    cause: causeProperties,
  }
  console.error(`${context}: ${JSON.stringify(diagnostic)}`)
}

function unreadCountQueryError(
  query: string,
  error: { message: string; code: string; details: string; hint: string; status?: number },
) {
  const message = error.message
    || (error.status === 403
      ? `Supabase denied access to ${query}. Apply the latest messaging and unread-count database migrations, then verify the signed-in user's RLS permissions.`
      : `Supabase request failed for ${query}.`)
  return Object.assign(new Error(message), {
    query,
    code: error.code,
    details: error.details,
    hint: error.hint,
    cause: error,
  })
}

function InboxMenu({ userId, active }: { userId: string | null; active: boolean }) {
  const [open, setOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [unreadMessageCount, setUnreadMessageCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false), open)

  const refreshUnreadCount = useCallback(async () => {
    if (!userId) {
      setUnreadCount(0)
      setUnreadMessageCount(0)
      return
    }
    const supabase = getSupabaseClient()
    const [updatesResult, messagesResult] = await Promise.all([
      supabase
        .from('user_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_id', userId)
        .neq('kind', 'message')
        .is('read_at', null),
      supabase
        .from('community_direct_messages')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_id', userId)
        .eq('is_deleted', false)
        .is('read_at', null),
    ])
    if (updatesResult.error) throw unreadCountQueryError('user_notifications', updatesResult.error)
    if (messagesResult.error) throw unreadCountQueryError('community_direct_messages', messagesResult.error)
    setUnreadCount(updatesResult.count ?? 0)
    setUnreadMessageCount(messagesResult.count ?? 0)
    setError(null)
  }, [userId])

  useEffect(() => {
    let mounted = true
    const loadUnreadCount = () => {
      void refreshUnreadCount().catch((loadError: unknown) => {
        if (!mounted) return
        setError(unreadCountErrorMessage(loadError))
        logUnreadCountError('Could not load unread updates in the header', loadError)
      })
    }
    loadUnreadCount()
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') loadUnreadCount()
    }
    window.addEventListener('storylines:notifications-updated', loadUnreadCount)
    window.addEventListener('storylines:messages-updated', loadUnreadCount)
    window.addEventListener('focus', loadUnreadCount)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      mounted = false
      window.removeEventListener('storylines:notifications-updated', loadUnreadCount)
      window.removeEventListener('storylines:messages-updated', loadUnreadCount)
      window.removeEventListener('focus', loadUnreadCount)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [active, refreshUnreadCount])

  return (
    <div ref={ref} className="relative" onKeyDown={(event) => {
      if (event.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`flex size-10 items-center justify-center rounded-md bg-primary-foreground/10 text-primary-foreground transition-colors hover:bg-primary-foreground/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${active ? 'ring-1 ring-primary-foreground/25' : ''}`}
        aria-label="Open inbox and updates"
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls="header-inbox-menu"
      >
        <Inbox className="size-5" />
      </button>
      {open && (
        <nav id="header-inbox-menu" aria-label="Inbox and updates" className="absolute right-0 z-40 mt-2 w-48 overflow-hidden rounded-md border border-border bg-card py-1 text-card-foreground shadow-xl">
          <Link
            href="/messages"
            onClick={() => setOpen(false)}
            className="flex min-h-11 items-center justify-between px-3 text-base hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
          >
            <span>Inbox</span>
            {unreadMessageCount > 0 && (
              <span className="flex size-6 items-center justify-center rounded-full bg-destructive text-xs font-extrabold text-white" aria-label={`${unreadMessageCount} unread messages`}>
                {unreadMessageCount > 99 ? '99+' : unreadMessageCount}
              </span>
            )}
          </Link>
          <Link
            href="/updates"
            onClick={() => setOpen(false)}
            className="flex min-h-11 items-center justify-between px-3 text-base hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
          >
            <span>Updates</span>
            {unreadCount > 0 && (
              <span className="flex size-6 items-center justify-center rounded-full bg-destructive text-xs font-extrabold text-white" aria-hidden="true">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </Link>
          {error && (
            <div className="border-t border-border px-3 py-2">
              <p role="alert" className="text-xs text-destructive">{error}</p>
              <button type="button" onClick={() => void refreshUnreadCount().catch((retryError: unknown) => {
                setError(unreadCountErrorMessage(retryError))
                logUnreadCountError('Could not refresh unread updates in the header', retryError)
              })} className="mt-1 min-h-8 text-xs font-bold text-accent">Try again</button>
            </div>
          )}
        </nav>
      )}
    </div>
  )
}

function HeaderSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const router = useRouter()
  const ref = useClickOutside<HTMLDivElement>(() => close(), open)

  function close() {
    setOpen(false)
    setQuery('')
  }

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const search = query.trim()
    router.push(search ? `/browse?search=${encodeURIComponent(search)}` : '/browse')
    close()
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex size-11 items-center justify-center rounded-full hover:bg-primary-foreground/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        aria-label={open ? 'Isara ang paghahanap' : 'Search'}
        aria-expanded={open}
        aria-controls="header-search-panel"
      >
        {open ? <X className="size-5" /> : <Search className="size-5" />}
      </button>
      {open && (
        <div id="header-search-panel" className="absolute right-0 top-full z-30 mt-2 w-[min(24rem,calc(100vw-1.5rem))] rounded-xl border border-border bg-card p-3 text-foreground shadow-xl max-[600px]:fixed max-[600px]:inset-x-3 max-[600px]:top-[4.5rem] max-[600px]:mt-0 max-[600px]:w-auto">
          <form onSubmit={submitSearch} role="search" className="flex min-h-12 items-center gap-2 rounded-lg border border-input bg-background px-3 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
            <Search className="size-4 shrink-0" />
            <input
              autoFocus
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Hanap pamagat, genre, o keyword..."
              aria-label="Maghanap ayon sa pamagat, genre, o keyword"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <button type="submit" className="flex min-h-10 shrink-0 items-center rounded-md bg-accent px-3 text-xs font-bold text-accent-foreground hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              Hanapin
            </button>
          </form>
          <p className="px-1 pt-2 text-xs leading-5 text-muted-foreground">
            Maghanap sa pamagat, genre, at description ng mga nailathalang gawa.
          </p>
        </div>
      )}
    </div>
  )
}

export function SiteHeader({
  route,
  creator,
  isLoggedIn,
  currentUserId,
  mobileNav,
  setMobileNav,
  go,
  create,
  requireAuth,
  logout,
}: {
  route: Route
  creator: boolean
  isLoggedIn: boolean
  currentUserId: string | null
  mobileNav: boolean
  setMobileNav: (value: boolean) => void
  go: (route: Route) => void
  create: () => void
  requireAuth: (next: Route) => void
  logout: () => void
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-primary text-primary-foreground shadow-[0_3px_0_rgba(68,45,31,0.12)]">
      <div className="mx-auto flex h-[4.5rem] max-w-7xl items-center gap-4 px-4 sm:gap-6 sm:px-6">
        <button onClick={() => go('/')} className="flex shrink-0 items-center gap-2" aria-label="StoryLines home">
          <span className="brand-mark">
            <Image
              src="/storylines-logo.png"
              alt=""
              aria-hidden="true"
              width={40}
              height={40}
              className="size-full object-contain dark:hidden"
            />
            <Image
              src="/storylines-logo-dark.png"
              alt=""
              aria-hidden="true"
              width={40}
              height={40}
              className="hidden size-full object-contain dark:block"
            />
          </span>
          <span className="font-serif text-xl font-bold tracking-tight">StoryLines</span>
        </button>

        <nav className="hidden flex-1 items-center gap-2 min-[1200px]:flex" aria-label="Main navigation">
          <NavItem label="HOME" active={route === '/'} onClick={() => go('/')} />
          <NavItem label="COMMUNITY" active={route === '/community'} onClick={() => go('/community')} />
          <NavItem label="BROWSE" active={route === '/browse'} onClick={() => go('/browse')} />
          <NavItem label="RANKING" active={route === '/ranking'} onClick={() => go('/ranking')} />
          <NavMenu
            label="CREATE"
            locked={!isLoggedIn || !creator}
            active={route.startsWith('/create')}
            allowOpen={isLoggedIn && creator}
            onBlocked={create}
            items={[
              { label: 'Dashboard', href: '/create' },
              { label: 'New work', href: '/create/works/new' },
              { label: 'My works', href: '/create/works' },
              { label: 'Portfolio', href: '/create/portfolio' },
              { label: 'Analytics', href: '/create/works/analytics' },
            ]}
          />
          <NavMenu
            label="COLLABORATE"
            locked={!isLoggedIn}
            active={route === '/collaborate'}
            allowOpen={isLoggedIn}
            onBlocked={() => requireAuth('/collaborate')}
            items={[
              { label: 'Find collaborators', href: '/collaborate?tab=find' },
              { label: 'Active', href: '/collaborate?tab=active' },
              { label: 'Pending', href: '/collaborate?tab=pending' },
              { label: 'Past', href: '/collaborate?tab=past' },
            ]}
          />
          <NavItem label="LIBRARY" icon={<Library />} locked={!isLoggedIn} active={route === '/library'} onClick={() => go('/library')} />
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
          <HeaderSearch />
          {!isLoggedIn && (
            <div className="hidden shrink-0 items-center gap-2 sm:flex">
              <Link href={{ pathname: '/login', query: { next: route } }} className="flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-bold hover:bg-primary-foreground/10">
                Log in
              </Link>
              <Link
                href={{ pathname: '/signup', query: { next: route } }}
                className="flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full border border-primary-foreground/25 px-4 py-1.5 text-sm font-bold hover:bg-primary-foreground/10"
              >
                Sign up
              </Link>
            </div>
          )}
          {isLoggedIn && (
            <InboxMenu userId={currentUserId} active={route === '/messages' || route === '/updates'} />
          )}
          {isLoggedIn && <AccountMenu go={go} logout={logout} userId={currentUserId} />}
          <button onClick={() => setMobileNav(!mobileNav)} className="flex size-11 items-center justify-center rounded-full hover:bg-primary-foreground/10 min-[1200px]:hidden" aria-label={mobileNav ? 'Close menu' : 'Open menu'} aria-expanded={mobileNav}>
            {mobileNav ? <X /> : <Menu />}
          </button>
        </div>
      </div>

      {mobileNav && (
        <div className="flex flex-col gap-1 border-t border-primary-foreground/10 px-4 py-3 min-[1200px]:hidden">
          {[
            ['HOME', '/'],
            ['COMMUNITY', '/community'],
            ['BROWSE', '/browse'],
            ['RANKING', '/ranking'],
            ['LIBRARY', '/library'],
          ].map(([label, path]) => (
            <button
              key={path}
              className="flex min-h-11 items-center rounded-lg px-3 text-left text-sm font-bold tracking-wide hover:bg-primary-foreground/10"
              onClick={() => go(path as Route)}
            >
              {label}
            </button>
          ))}
          <button className="flex min-h-11 items-center rounded-lg px-3 text-left text-sm font-bold tracking-wide hover:bg-primary-foreground/10" onClick={create}>
            CREATE
          </button>
          <button
            className="flex min-h-11 items-center rounded-lg px-3 text-left text-sm font-bold tracking-wide hover:bg-primary-foreground/10"
            onClick={() => (isLoggedIn ? go('/collaborate') : requireAuth('/collaborate'))}
          >
            COLLABORATE
          </button>
          {isLoggedIn ? (
            <>
              <button className="flex min-h-11 items-center rounded-lg px-3 text-left text-sm font-bold tracking-wide hover:bg-primary-foreground/10" onClick={() => go('/profile')}>
                PROFILE
              </button>
              <button className="flex min-h-11 items-center rounded-lg px-3 text-left text-sm font-bold tracking-wide hover:bg-primary-foreground/10" onClick={() => go('/settings')}>
                SETTINGS
              </button>
              <button className="flex min-h-11 items-center rounded-lg px-3 text-left text-sm font-bold tracking-wide text-destructive hover:bg-primary-foreground/10" onClick={logout}>
                LOG OUT
              </button>
            </>
          ) : (
            <>
              <Link className="flex min-h-11 items-center rounded-lg px-3 py-2 text-left text-xs font-bold tracking-widest hover:bg-primary-foreground/10" href={{ pathname: '/login', query: { next: route } }}>
                LOG IN
              </Link>
              <Link className="flex min-h-11 items-center rounded-lg px-3 py-2 text-left text-xs font-bold tracking-widest hover:bg-primary-foreground/10" href={{ pathname: '/signup', query: { next: route } }}>
                SIGN UP
              </Link>
            </>
          )}
        </div>
      )}
    </header>
  )
}