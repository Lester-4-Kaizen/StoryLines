'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { Panel } from '@/components/shared/panel'
import { getSupabaseClient } from '@/lib/supabase'

type WarningAppeal = {
  warning_audit_id: string
  warning_note: string
  warning_created_at: string
  appeal_id: string | null
  appeal_text: string | null
  appeal_status: 'pending' | 'upheld' | 'rescinded' | null
  appeal_created_at: string | null
  review_note: string | null
  is_rescinded: boolean
}

async function fetchWarnings() {
  const { data, error } = await getSupabaseClient().rpc('get_my_moderation_warnings')
  if (error) throw error
  return (data ?? []) as WarningAppeal[]
}

function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date)
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
    return error.message
  }
  return fallback
}

export function WarningAppealsPanel() {
  const [warnings, setWarnings] = useState<WarningAppeal[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [confirmWarningId, setConfirmWarningId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const data = await fetchWarnings()
        if (active) setWarnings(data)
      } catch (loadError) {
        if (active) setError(getErrorMessage(loadError, 'Could not load warnings.'))
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [])

  const requestAppealConfirmation = (event: FormEvent<HTMLFormElement>, warningId: string) => {
    event.preventDefault()
    const appealText = drafts[warningId]?.trim() ?? ''
    if (appealText.length < 20 || appealText.length > 2000 || busyId) return
    setError(null)
    setNotice(null)
    setConfirmWarningId(warningId)
  }

  const submitAppeal = async (warningId: string) => {
    const appealText = drafts[warningId]?.trim() ?? ''
    if (appealText.length < 20 || appealText.length > 2000 || busyId) return
    setBusyId(warningId)
    setError(null)
    try {
      const { data: appealId, error: submitError } = await getSupabaseClient().rpc('submit_my_moderation_warning_appeal', {
        p_warning_audit_id: warningId,
        p_appeal_text: appealText,
      })
      if (submitError) throw submitError
      setWarnings((current) => current.map((warning) => warning.warning_audit_id === warningId
        ? {
          ...warning,
          appeal_id: appealId,
          appeal_text: appealText,
          appeal_status: 'pending',
          appeal_created_at: new Date().toISOString(),
        }
        : warning))
      setConfirmWarningId(null)
      setNotice('Your appeal was submitted and is awaiting review.')
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Could not submit this appeal.'))
    } finally {
      setBusyId(null)
    }
  }

  if (loading) {
    return (
      <Panel className="p-4 text-left sm:p-5">
        <p className="text-sm text-muted-foreground" role="status">Loading warnings and appeals…</p>
      </Panel>
    )
  }
  if (!warnings.length && !error) return null

  return (
    <Panel className="h-full p-4 text-left sm:p-5 lg:p-6">
      <span className="eyebrow">Moderation</span>
      <h3 className="mt-2 font-serif text-xl font-bold">Warnings and appeals</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Review warnings or appeal a decision. Open a warning to see its details.
      </p>
      {notice && <p role="status" className="mt-4 rounded-lg border border-green-700/20 bg-green-700/10 p-3 text-sm font-semibold text-green-800">{notice}</p>}
      {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
      {warnings.length > 0 && (
        <ul className="mt-4 divide-y divide-border rounded-xl border border-border">
          {warnings.map((warning) => (
            <li key={warning.warning_audit_id}>
              <details className="group">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 marker:hidden hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">Warning · {formatDate(warning.warning_created_at)}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {warning.is_rescinded
                        ? 'Rescinded'
                        : warning.appeal_status === 'pending'
                          ? 'Appeal pending'
                          : warning.appeal_status
                            ? `Appeal ${warning.appeal_status}`
                            : 'Appeal available'}
                    </span>
                  </span>
                  <span aria-hidden="true" className="shrink-0 text-lg text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none">⌄</span>
                </summary>
                <div className="border-t border-border px-4 py-4">
                  <p className="whitespace-pre-wrap text-sm leading-6">{warning.warning_note || 'No additional reason was provided.'}</p>
                  {warning.is_rescinded ? (
                    <p className="mt-3 text-sm font-semibold text-green-700">This warning was rescinded.</p>
                  ) : warning.appeal_status ? (
                    <div className="mt-4 rounded-lg bg-secondary/50 p-3">
                      <p className="text-sm font-semibold">
                        Appeal {warning.appeal_status === 'pending' ? 'pending review' : warning.appeal_status}.
                      </p>
                      {warning.appeal_text && <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{warning.appeal_text}</p>}
                      {warning.review_note && <p className="mt-2 text-sm">Staff note: {warning.review_note}</p>}
                    </div>
                  ) : (
                    <form onSubmit={(event) => requestAppealConfirmation(event, warning.warning_audit_id)} className="mt-4 border-t border-border pt-4">
                      <label htmlFor={`appeal-${warning.warning_audit_id}`} className="text-sm font-semibold">Why should staff review this warning?</label>
                      <textarea
                        id={`appeal-${warning.warning_audit_id}`}
                        value={drafts[warning.warning_audit_id] ?? ''}
                        onChange={(event) => setDrafts((current) => ({ ...current, [warning.warning_audit_id]: event.target.value }))}
                        minLength={20}
                        maxLength={2000}
                        required
                        rows={4}
                        className="mt-2 w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        placeholder="Explain what you believe was misunderstood or why the warning should be reconsidered."
                      />
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">20–2,000 characters</span>
                        <button
                          type="submit"
                          disabled={busyId !== null || (drafts[warning.warning_audit_id]?.trim().length ?? 0) < 20}
                          className="min-h-10 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {busyId === warning.warning_audit_id ? 'Submitting…' : 'Submit appeal'}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
      {confirmWarningId && (() => {
        const warning = warnings.find((item) => item.warning_audit_id === confirmWarningId)
        if (!warning) return null
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
            onClick={(event) => {
              if (!busyId && event.target === event.currentTarget) setConfirmWarningId(null)
            }}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="appeal-confirmation-title"
              className="max-h-[min(85dvh,40rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-2xl sm:p-6"
            >
              <span className="eyebrow">Before you submit</span>
              <h3 id="appeal-confirmation-title" className="mt-2 font-serif text-2xl font-bold">Confirm your appeal</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Your appeal will be sent to the moderation team for this warning. You can’t edit it after it has been submitted.
              </p>
              <div className="mt-4 rounded-xl bg-secondary/50 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Warning · {formatDate(warning.warning_created_at)}</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{warning.warning_note || 'No additional reason was provided.'}</p>
              </div>
              <div className="mt-3 rounded-xl border border-border p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Your appeal</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{drafts[confirmWarningId]?.trim()}</p>
              </div>
              {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  disabled={busyId !== null}
                  onClick={() => setConfirmWarningId(null)}
                  className="min-h-11 rounded-full border border-border px-5 text-sm font-semibold hover:bg-muted disabled:opacity-60"
                >
                  Go back and edit
                </button>
                <button
                  type="button"
                  disabled={busyId !== null}
                  onClick={() => void submitAppeal(confirmWarningId)}
                  className="min-h-11 rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busyId === confirmWarningId ? 'Submitting…' : 'Confirm and submit'}
                </button>
              </div>
            </section>
          </div>
        )
      })()}
    </Panel>
  )
}
