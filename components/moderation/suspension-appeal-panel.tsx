'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { Panel } from '@/components/shared/panel'
import { getSupabaseClient } from '@/lib/supabase'

type SuspensionAppeal = {
  appeal_id: string | null
  restriction_audit_id: string
  restriction_action: 'suspend'
  restriction_note: string
  restriction_created_at: string
  suspended_until: string | null
  appeal_text: string | null
  appeal_status: 'pending' | 'upheld' | 'rescinded' | null
  appeal_created_at: string | null
  review_note: string | null
}

function formatDate(value: string | null) {
  if (!value) return 'Date unavailable'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

export function SuspensionAppealPanel() {
  const [suspension, setSuspension] = useState<SuspensionAppeal | null>(null)
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void (async () => {
      const { data, error: loadError } = await getSupabaseClient().rpc('get_my_moderation_suspension_appeal')
      if (loadError) throw loadError
      const row = Array.isArray(data) ? data[0] as SuspensionAppeal | undefined : undefined
      if (active) {
        setSuspension(row ?? null)
        if (!row) setError('Suspension appeal details could not be loaded. Please contact support.')
      }
    })().catch((loadError: unknown) => {
      if (active) setError(loadError instanceof Error ? loadError.message : 'Could not load suspension appeal details.')
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => {
      active = false
    }
  }, [])

  const requestConfirmation = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!suspension || draft.trim().length < 20 || draft.trim().length > 2000 || busy) return
    setError(null)
    setConfirmOpen(true)
  }

  const submitAppeal = async () => {
    if (!suspension || draft.trim().length < 20 || draft.trim().length > 2000 || busy) return
    setBusy(true)
    setError(null)
    try {
      const { data: appealId, error: submitError } = await getSupabaseClient().rpc('submit_my_moderation_suspension_appeal', {
        p_restriction_audit_id: suspension.restriction_audit_id,
        p_appeal_text: draft.trim(),
      })
      if (submitError) throw submitError
      setSuspension((current) => current ? {
        ...current,
        appeal_id: appealId,
        appeal_text: draft.trim(),
        appeal_status: 'pending',
        appeal_created_at: new Date().toISOString(),
      } : current)
      setConfirmOpen(false)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not submit this suspension appeal.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <Panel className="p-5 text-left sm:p-6">
        <p className="text-sm text-muted-foreground" role="status">Loading suspension appeal…</p>
      </Panel>
    )
  }

  return (
    <>
      <Panel className="h-full p-4 text-left sm:p-5 lg:p-6">
        <span className="eyebrow">Account review</span>
        <h2 className="mt-2 font-serif text-xl font-bold">Appeal your suspension</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          You can ask the moderation team to review this suspension. Appeals are reviewed by staff and do not restore access while pending.
        </p>
        {suspension && (
          <div className="mt-4 rounded-xl bg-secondary/50 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Suspension issued · {formatDate(suspension.restriction_created_at)}</p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{suspension.restriction_note || 'No additional reason was provided.'}</p>
            {suspension.suspended_until && <p className="mt-2 text-xs text-muted-foreground">Scheduled to end {formatDate(suspension.suspended_until)}.</p>}
          </div>
        )}
        {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
        {suspension?.appeal_status ? (
          <div className="mt-4 rounded-xl border border-border p-4">
            <p className="text-sm font-semibold">
              {suspension.appeal_status === 'pending'
                ? 'Your suspension appeal is awaiting review.'
                : `Your suspension appeal was ${suspension.appeal_status}.`}
            </p>
            {suspension.appeal_created_at && <p className="mt-1 text-xs text-muted-foreground">Submitted {formatDate(suspension.appeal_created_at)}</p>}
            {suspension.appeal_text && <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{suspension.appeal_text}</p>}
            {suspension.review_note && <p className="mt-3 text-sm">Staff note: {suspension.review_note}</p>}
          </div>
        ) : suspension && (
          <form onSubmit={requestConfirmation} className="mt-4">
            <label htmlFor="suspension-appeal-text" className="text-sm font-semibold">Why should staff review this suspension?</label>
            <textarea
              id="suspension-appeal-text"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              minLength={20}
              maxLength={2000}
              required
              rows={4}
              className="mt-2 w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Explain why you believe the suspension should be reconsidered."
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">20–2,000 characters</span>
              <button
                type="submit"
                disabled={draft.trim().length < 20 || busy}
                className="min-h-11 rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
              >
                Review and submit
              </button>
            </div>
          </form>
        )}
      </Panel>
      {confirmOpen && suspension && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          onClick={(event) => {
            if (!busy && event.target === event.currentTarget) setConfirmOpen(false)
          }}
        >
          <section role="dialog" aria-modal="true" aria-labelledby="suspension-appeal-confirm-title" className="max-h-[min(85dvh,40rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-2xl sm:p-6">
            <span className="eyebrow">Before you submit</span>
            <h2 id="suspension-appeal-confirm-title" className="mt-2 font-serif text-2xl font-bold">Confirm suspension appeal</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">Your appeal will be sent to the moderation team. You can’t edit it after it has been submitted.</p>
            <div className="mt-4 rounded-xl border border-border p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Your appeal</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{draft.trim()}</p>
            </div>
            {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" disabled={busy} onClick={() => setConfirmOpen(false)} className="min-h-11 rounded-full border border-border px-5 text-sm font-semibold hover:bg-muted disabled:opacity-60">
                Go back and edit
              </button>
              <button type="button" disabled={busy} onClick={() => void submitAppeal()} className="min-h-11 rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground disabled:opacity-60">
                {busy ? 'Submitting…' : 'Confirm and submit'}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  )
}
