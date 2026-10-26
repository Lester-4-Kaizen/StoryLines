'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { parseModerationStatus, type ModerationStatus } from '@/lib/moderation/status'
import { getSupabaseClient } from '@/lib/supabase'

export function AccountRestrictedView({
  banned,
  status: initialStatus,
}: {
  banned: boolean
  status?: ModerationStatus
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<ModerationStatus | null>(initialStatus ?? null)

  useEffect(() => {
    let active = true
    void (async () => {
      const supabase = getSupabaseClient()
      const { data, error: statusError } = await supabase.rpc('get_my_moderation_status')
      if (statusError) throw statusError
      const nextStatus = parseModerationStatus(data)
      if (!active) return
      if (nextStatus.status === 'active') {
        router.replace('/')
        return
      }
      setStatus(nextStatus)
    })().catch((loadError: unknown) => {
      if (active) setError(loadError instanceof Error ? loadError.message : 'Could not load moderation updates.')
    })
    return () => {
      active = false
    }
  }, [router])

  const signOut = async () => {
    setBusy(true)
    setError(null)
    const { error: signOutError } = await getSupabaseClient().auth.signOut()
    if (signOutError) {
      setError(signOutError.message)
      setBusy(false)
      return
    }
    window.location.assign('/login')
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-5 text-center">
      <div className="paper-panel w-full p-8">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-accent">Account access</p>
        <h1 className="mt-3 font-serif text-3xl font-bold">
          {!status ? 'Checking account status…' : status.status === 'banned' ? 'Account disabled' : 'Account temporarily suspended'}
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {!status
            ? 'Checking the current access status for this account.'
            : status.status === 'banned'
            ? 'This account is not currently able to access StoryLines. Contact the support team if you believe this is a mistake.'
            : 'This account is temporarily limited to viewing public community posts. Posting, commenting, reporting, messaging, and reading stories are unavailable until the suspension ends.'}
        </p>
        {status?.status === 'suspended' && status.suspendedUntil && (
          <p className="mt-3 text-sm font-semibold">
            Suspension ends {new Date(status.suspendedUntil).toLocaleString()}.
          </p>
        )}
        {status?.warningCount ? (
          <p className="mt-3 text-sm font-semibold">Warnings on your account: {status.warningCount}</p>
        ) : null}
        {status?.latestMessage && (
          <section className="mt-5 border-t border-border pt-4 text-left" aria-label="Moderation outcomes">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Message from the moderation team</h2>
            <p className="mt-2 rounded-lg bg-secondary/60 p-3 text-sm">{status.latestMessage}</p>
          </section>
        )}
        {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {status?.status === 'suspended' && (
            <Link href="/community" className="inline-flex min-h-11 items-center rounded-full border border-border px-5 text-sm font-bold hover:bg-muted">
              View public posts
            </Link>
          )}
          <button type="button" disabled={busy} onClick={() => void signOut()} className="min-h-11 rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground disabled:opacity-60">
            {busy ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </div>
    </main>
  )
}
