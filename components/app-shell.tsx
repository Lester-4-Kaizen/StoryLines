'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { X } from 'lucide-react'
import { SiteHeader } from '@/components/site-header'
import { UpgradeModal } from '@/components/upgrade-modal'
import { AuthModal } from '@/components/auth-modal'
import { useAppState } from '@/lib/app-state'
import type { Route } from '@/lib/types'

// Routes that require an account. Guests can freely browse Home, Browse,
// Ranking, and Community (viewing) — everything here persists identity or
// lets you act as a creator, so it's gated.
const PROTECTED_PREFIXES = ['/create', '/library', '/settings', '/profile', '/collaborate']

function isProtectedPath(pathname: string) {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

// Renders around every page via app/layout.tsx. Owns the chrome that used
// to sit at the bottom of the old monolithic component: header, upgrade
// modal, auth modal — plus two route guards:
//  1. Logged-out visitors hitting a protected route get the auth modal
//     (via requireAuth, which also bounces them to Home underneath it if
//     they're on a page that only makes sense once logged in).
//  2. Logged-in accounts without a creator badge hitting /create/* get
//     bounced to Home with the upgrade modal open — enforced here at the
//     route level, not just inside the CREATE button's click handler, so
//     there's no way to land on /create with the wrong badge and no
//     warning.
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const {
    creator,
    isLoggedIn,
    hydrated,
    mobileNav,
    upgradeOpen,
    authOpen,
    notice,
    dismissNotice,
    setMobileNav,
    setUpgradeOpen,
    toggleBadge,
    go,
    create,
    requireAuth,
    openAuth,
    logout,
  } = useAppState()

  useEffect(() => {
    if (!hydrated) return // wait for the persisted login state to load first

    if (!isLoggedIn && isProtectedPath(pathname)) {
      requireAuth(pathname as Route)
      return
    }

    if (isLoggedIn && pathname.startsWith('/create') && !creator) {
      setUpgradeOpen(true)
      go('/')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, isLoggedIn, hydrated, creator])

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader
        route={(pathname as Route) || '/'}
        creator={creator}
        isLoggedIn={isLoggedIn}
        mobileNav={mobileNav}
        setMobileNav={setMobileNav}
        go={go}
        create={create}
        requireAuth={requireAuth}
        openAuth={openAuth}
        logout={logout}
      />
      {notice && (
        <div role="alert" className="fixed right-4 top-20 z-40 flex max-w-md items-start gap-3 rounded-lg border border-border bg-card p-4 text-sm shadow-lg">
          <p className="flex-1">{notice}</p>
          <button type="button" onClick={dismissNotice} aria-label="Dismiss notification" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>
      )}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-12">{children}</main>
      {upgradeOpen && (
        <UpgradeModal
          onClose={() => setUpgradeOpen(false)}
          onUpgrade={(badge) => {
            toggleBadge(badge)
            setUpgradeOpen(false)
          }}
        />
      )}
      {authOpen && <AuthModal />}
    </div>
  )
}