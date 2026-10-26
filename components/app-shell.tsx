'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/shared/site-footer'
import { UpgradeModal } from '@/components/upgrade-modal'
import { BackButton } from '@/components/shared/back-button'
import { BackToTop } from '@/components/shared/back-to-top'
import { AccountRestrictedView } from '@/components/account-restricted-view'
import { AccountStatusBanner } from '@/components/account-status-banner'
import { SuspendedCommunityView } from '@/components/suspended-community-view'
import { useAppState } from '@/lib/app-state'
import { CommunityProvider } from '@/lib/community-store'
import { parseModerationStatus, type ModerationStatus } from '@/lib/moderation/status'
import { getSupabaseClient } from '@/lib/supabase'
import { WorksProvider } from '@/lib/works-store'
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
  const router = useRouter()
  const isAuthPage = ['/login', '/signup', '/forgot-password', '/reset-password'].includes(pathname)
  const isAdminPage = pathname === '/admin' || pathname.startsWith('/admin/')
  const isMessagesPage = pathname === '/messages'
  const isRestrictedPage = pathname === '/account-restricted'
  const [moderationStatusState, setModerationStatusState] = useState<{
    userId: string
    status: ModerationStatus
  } | null>(null)
  const [moderationStatusError, setModerationStatusError] = useState(false)
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
  const moderationStatus = moderationStatusState?.userId === currentUserId
    ? moderationStatusState.status
    : null

  useEffect(() => {
    if (!isLoggedIn || !currentUserId || isAuthPage) {
      setModerationStatusState(null)
      setModerationStatusError(false)
      return
    }

    let active = true
    const userId = currentUserId
    const supabase = getSupabaseClient()
    const refreshStatus = async () => {
      const { data, error } = await supabase.rpc('get_my_moderation_status')
      if (error) throw error
      const nextStatus = parseModerationStatus(data)
      if (active) {
        setModerationStatusState({ userId, status: nextStatus })
        setModerationStatusError(false)
      }
    }
    const reportStatusError = (error: unknown) => {
      console.error('Could not refresh account moderation status:', error)
      if (active) setModerationStatusError(true)
    }

    void refreshStatus().catch(reportStatusError)
    const intervalId = window.setInterval(() => {
      void refreshStatus().catch(reportStatusError)
    }, 10_000)
    const refreshOnFocus = () => {
      void refreshStatus().catch(reportStatusError)
    }
    window.addEventListener('focus', refreshOnFocus)

    return () => {
      active = false
      window.clearInterval(intervalId)
      window.removeEventListener('focus', refreshOnFocus)
    }
  }, [currentUserId, isAuthPage, isLoggedIn])

  useEffect(() => {
    if (!hydrated) return // wait for the persisted login state to load first

    if (isLoggedIn && pathname.startsWith('/create') && !creator) {
      setUpgradeOpen(true)
      go('/')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, isLoggedIn, hydrated, creator])

  useEffect(() => {
    if (!moderationStatus || isRestrictedPage) return
    const suspendedCommunity = moderationStatus.status === 'suspended' && pathname === '/community'
    if (moderationStatus.status === 'active' || suspendedCommunity) return
    router.replace(`/account-restricted?status=${moderationStatus.status}`)
  }, [moderationStatus, pathname, isRestrictedPage, router])

  if (isAuthPage) return <>{children}</>
  if (isRestrictedPage) return <>{children}</>
  if (isLoggedIn && currentUserId && !moderationStatus) {
    return (
      <main className="flex min-h-screen items-center justify-center px-5">
        <section className="paper-panel w-full max-w-md p-6 text-center">
          <h1 className="font-serif text-xl font-bold">
            {moderationStatusError ? 'Account status could not be verified' : 'Checking account access…'}
          </h1>
          <p role={moderationStatusError ? 'alert' : 'status'} className="mt-2 text-sm text-muted-foreground">
            {moderationStatusError
              ? 'StoryLines is keeping account data locked until the status check succeeds. Reload the page or contact support if this continues.'
              : 'Please wait while we verify your account permissions.'}
          </p>
          {moderationStatusError && (
            <button type="button" onClick={() => window.location.reload()} className="mt-4 min-h-10 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground">
              Try again
            </button>
          )}
        </section>
      </main>
    )
  }
  if (moderationStatus?.status === 'banned') {
    return <AccountRestrictedView banned />
  }
  if (moderationStatus?.status === 'suspended') {
    if (pathname === '/community') return <SuspendedCommunityView status={moderationStatus} />
    return <AccountRestrictedView banned={false} status={moderationStatus} />
  }
  if (isAdminPage) {
    return (
      <>
        {moderationStatus && <AccountStatusBanner warningCount={moderationStatus.warningCount} message={moderationStatus.latestMessage} />}
        {children}
      </>
    )
  }

  return (
    <WorksProvider>
      <CommunityProvider>
        <div className={`flex flex-col bg-background text-foreground ${isMessagesPage ? 'h-[100dvh] min-h-0 overflow-hidden' : 'min-h-screen'}`}>
          {moderationStatus && (
            <AccountStatusBanner warningCount={moderationStatus.warningCount} message={moderationStatus.latestMessage} />
          )}
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
          <BackToTop />
        </div>
      </CommunityProvider>
    </WorksProvider>
  )
}