'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { BookMarked, ChevronDown, Inbox, Library, LogOut, Menu, Search, Settings, UserRound, X } from 'lucide-react'
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
      className={`flex items-center gap-1.5 rounded-md px-2.5 py-2 text-[11px] font-bold tracking-[0.12em] transition ${
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
        className={`flex items-center gap-1.5 rounded-md px-2.5 py-2 text-[11px] font-bold tracking-[0.12em] transition ${
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
function AccountMenu({ go, logout }: { go: (route: Route) => void; logout: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false), open)

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
        <span className="avatar-placeholder">
          <UserRound className="size-4" />
        </span>
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

// Inline expanding search, like Webnovel's — no dedicated /search page.
// Tapping the icon expands a text field right there in the header; a small
// panel below it responds live as you type. There's no real search index
// behind it yet, so it always resolves to an empty state, same as every
// other list in the app.
function HeaderSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useClickOutside<HTMLDivElement>(() => close(), open)

  function close() {
    setOpen(false)
    setQuery('')
  }

  return (
    <div ref={ref} className="relative">
      {open ? (
        <div className="flex items-center gap-2 rounded-full bg-primary-foreground/10 px-3 py-1.5">
          <Search className="size-4 shrink-0" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search stories, comics, creators..."
            className="w-24 bg-transparent text-xs outline-none placeholder:text-primary-foreground/50 sm:w-52"
          />
          <button onClick={close} aria-label="Close search" className="shrink-0">
            <X className="size-3.5" />
          </button>
        </div>
      ) : (
        <button onClick={() => setOpen(true)} className="rounded-full p-2 hover:bg-primary-foreground/10" aria-label="Search">
          <Search className="size-5" />
        </button>
      )}
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-card p-4 shadow-lg">
          <p className="text-xs leading-5 text-muted-foreground">
            {query ? `Nothing found for “${query}”.` : 'Start typing to search stories, comics, and creators.'}
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
  mobileNav,
  setMobileNav,
  go,
  create,
  requireAuth,
  openAuth,
  logout,
}: {
  route: Route
  creator: boolean
  isLoggedIn: boolean
  mobileNav: boolean
  setMobileNav: (value: boolean) => void
  go: (route: Route) => void
  create: () => void
  requireAuth: (next: Route) => void
  openAuth: (next: Route, tab?: 'login' | 'register') => void
  logout: () => void
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-primary text-primary-foreground shadow-[0_3px_0_rgba(68,45,31,0.12)]">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-5 px-4 sm:px-6">
        <button onClick={() => go('/')} className="flex shrink-0 items-center gap-2" aria-label="StoryLines home">
          <span className="brand-mark">
            <Image
              src="/storylines-logo.png"
              alt=""
              aria-hidden="true"
              width={40}
              height={40}
              className="size-full object-contain"
            />
          </span>
          <span className="font-serif text-xl font-bold tracking-tight">StoryLines</span>
        </button>

        <nav className="hidden flex-1 items-center gap-1.5 lg:flex" aria-label="Main navigation">
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

        <div className="ml-auto flex items-center gap-1.5">
          {!isLoggedIn && (
            <div className="hidden items-center gap-2 sm:flex">
              <button onClick={() => openAuth(route, 'login')} className="flex items-center rounded-full px-3 py-1.5 text-xs font-bold hover:bg-primary-foreground/10">
                Log in
              </button>
              <button
                onClick={() => openAuth(route, 'register')}
                className="flex items-center rounded-full border border-primary-foreground/25 px-3 py-1.5 text-xs font-bold hover:bg-primary-foreground/10"
              >
                Sign up
              </button>
            </div>
          )}
          <HeaderSearch />
          {isLoggedIn && (
            <button className="relative rounded-full p-2 hover:bg-primary-foreground/10" aria-label="Inbox">
              <Inbox className="size-5" />
            </button>
          )}
          {isLoggedIn && <AccountMenu go={go} logout={logout} />}
          <button onClick={() => setMobileNav(!mobileNav)} className="rounded-full p-2 lg:hidden" aria-label="Open menu">
            {mobileNav ? <X /> : <Menu />}
          </button>
        </div>
      </div>

      {mobileNav && (
        <div className="flex flex-col gap-1 border-t border-primary-foreground/10 px-4 py-3 lg:hidden">
          {[
            ['HOME', '/'],
            ['COMMUNITY', '/community'],
            ['BROWSE', '/browse'],
            ['RANKING', '/ranking'],
            ['LIBRARY', '/library'],
          ].map(([label, path]) => (
            <button
              key={path}
              className="rounded-lg px-3 py-2 text-left text-xs font-bold tracking-widest hover:bg-primary-foreground/10"
              onClick={() => go(path as Route)}
            >
              {label}
            </button>
          ))}
          <button className="rounded-lg px-3 py-2 text-left text-xs font-bold tracking-widest hover:bg-primary-foreground/10" onClick={create}>
            CREATE
          </button>
          <button
            className="rounded-lg px-3 py-2 text-left text-xs font-bold tracking-widest hover:bg-primary-foreground/10"
            onClick={() => (isLoggedIn ? go('/collaborate') : requireAuth('/collaborate'))}
          >
            COLLABORATE
          </button>
          {isLoggedIn ? (
            <>
              <button className="rounded-lg px-3 py-2 text-left text-xs font-bold tracking-widest hover:bg-primary-foreground/10" onClick={() => go('/profile')}>
                PROFILE
              </button>
              <button className="rounded-lg px-3 py-2 text-left text-xs font-bold tracking-widest hover:bg-primary-foreground/10" onClick={() => go('/settings')}>
                SETTINGS
              </button>
              <button className="rounded-lg px-3 py-2 text-left text-xs font-bold tracking-widest text-destructive hover:bg-primary-foreground/10" onClick={logout}>
                LOG OUT
              </button>
            </>
          ) : (
            <>
              <button className="rounded-lg px-3 py-2 text-left text-xs font-bold tracking-widest hover:bg-primary-foreground/10" onClick={() => openAuth(route, 'login')}>
                LOG IN
              </button>
              <button className="rounded-lg px-3 py-2 text-left text-xs font-bold tracking-widest hover:bg-primary-foreground/10" onClick={() => openAuth(route, 'register')}>
                SIGN UP
              </button>
            </>
          )}
        </div>
      )}
    </header>
  )
}