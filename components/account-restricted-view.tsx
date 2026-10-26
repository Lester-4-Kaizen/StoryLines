'use client'

import { useEffect, useState } from 'react'
import { getSupabaseClient } from '@/lib/supabase'

export function AccountRestrictedView({ banned }: { banned: boolean }) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [outcomes, setOutcomes] = useState<Array<{ message: string; createdAt: string }>>([])

  useEffect(() => {
    let active = true
    void (async () => {
      const supabase = getSupabaseClient()
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError
      if (!user) return
      const { data, error: notificationsError } = await supabase
        .from('user_notifications')
        .select('moderation_message, created_at')
        .eq('recipient_id', user.id)
        .eq('kind', 'moderation_outcome')
        .not('moderation_message', 'is', null)
        .order('created_at', { ascending: false })
        .limit(5)
      if (notificationsError) throw notificationsError
      if (active) {
        setOutcomes((data ?? []).flatMap((notification) => (
          notification.moderation_message
            ? [{ message: notification.moderation_message, createdAt: notification.created_at }]
            : []
        )))
      }
    })().catch((loadError: unknown) => {
      if (active) setError(loadError instanceof Error ? loadError.message : 'Could not load moderation updates.')
    })
    return () => {
      active = false
    }
  }, [])

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
        <h1 className="mt-3 font-serif text-3xl font-bold">{banned ? 'Account disabled' : 'Account temporarily suspended'}</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {banned
            ? 'This account is not currently able to access StoryLines. Contact the support team if you believe this is a mistake.'
            : 'This account is temporarily unable to access StoryLines. Please try again after the suspension period or contact the support team.'}
        </p>
        {outcomes.length > 0 && (
          <section className="mt-5 border-t border-border pt-4 text-left" aria-label="Moderation outcomes">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Recent account updates</h2>
            <ul className="mt-2 space-y-2">
              {outcomes.map((outcome) => (
                <li key={`${outcome.createdAt}-${outcome.message}`} className="rounded-lg bg-secondary/60 p-3 text-sm">
                  <p>{outcome.message}</p>
                  <time className="mt-1 block text-xs text-muted-foreground">{new Date(outcome.createdAt).toLocaleString()}</time>
                </li>
              ))}
            </ul>
          </section>
        )}
        {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
        <button type="button" disabled={busy} onClick={() => void signOut()} className="mt-6 min-h-11 rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground disabled:opacity-60">
          {busy ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </main>
  )
}
