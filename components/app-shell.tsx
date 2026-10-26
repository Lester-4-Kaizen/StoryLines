'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { X } from 'lucide-react'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/shared/site-footer'
import { UpgradeModal } from '@/components/upgrade-modal'
import { BackButton } from '@/components/shared/back-button'
import { useAppState } from '@/lib/app-state'
import type { Route } from '@/lib/types'

// Renders around every page via app/layout.tsx. Owns the shared chrome and
// the creator route guard. Authentication redirects are handled by proxy.ts.
// Logged-in accounts without a creator badge hitting /create/* get
//     bounced to Home with the upgrade modal open — enforced here at the
//     route level, not just inside the CREATE button's click handler, so
//     there's no way to land on /create with the wrong badge and no
//     warning.
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isAuthPage = ['/login', '/signup', '/forgot-password', '/reset-password'].includes(pathname)
  const isMessagesPage = pathname === '/messages'
  const {
    creator,
    badges,
    role,
    changeRole,
    isLoggedIn,
    currentUserId,
    hydrated,
    themeMode,
    setThemeMode,
    upgradeOpen,
    notice,
    dismissNotice,
    setUpgradeOpen,
    toggleBadge,
    go,
    create,
    requireAuth,
    logout,
  } = useAppState()

  useEffect(() => {
    if (!hydrated) return // wait for the persisted login state to load first

    if (isLoggedIn && pathname.startsWith('/create') && !creator) {
      setUpgradeOpen(true)
      go('/')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, isLoggedIn, hydrated, creator])

  if (isAuthPage) return <>{children}</>

  return (
    <div className={`flex flex-col bg-background text-foreground ${isMessagesPage ? 'h-[100dvh] min-h-0 overflow-hidden' : 'min-h-screen'}`}>
      {!isMessagesPage && (
        <SiteHeader
          route={(pathname as Route) || '/'}
          creator={creator}
          badges={badges}
          role={role}
          changeRole={changeRole}
          isLoggedIn={isLoggedIn}
          currentUserId={currentUserId}
          themeMode={themeMode}
          setThemeMode={setThemeMode}
          go={go}
          create={create}
          requireAuth={requireAuth}
          logout={logout}
        />
      )}
      {notice && (
        <div role="alert" className="fixed right-4 top-20 z-40 flex max-w-md items-start gap-3 rounded-lg border border-border bg-card p-4 text-sm shadow-lg">
          <p className="flex-1">{notice}</p>
          <button type="button" onClick={dismissNotice} aria-label="Dismiss notification" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>
      )}
      <main className={isMessagesPage
        ? 'flex min-h-0 w-full flex-1 overflow-hidden'
        : 'mx-auto w-full max-w-7xl flex-1 px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-8 sm:px-6 lg:pb-12 lg:py-12'}>
        {!isMessagesPage && (
          <div className="mb-4">
            <BackButton fallbackHref="/" />
          </div>
        )}
        {children}
      </main>
      {!isMessagesPage && <SiteFooter />}
      {upgradeOpen && (
        <UpgradeModal
          onClose={() => setUpgradeOpen(false)}
          onUpgrade={(badge) => {
            toggleBadge(badge)
            setUpgradeOpen(false)
          }}
        />
      )}
    </div>
  )
}