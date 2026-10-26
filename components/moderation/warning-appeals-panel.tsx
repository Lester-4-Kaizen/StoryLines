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

export function WarningAppealsPanel() {
  const [warnings, setWarnings] = useState<WarningAppeal[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const data = await fetchWarnings()
        if (active) setWarnings(data)
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Could not load warnings.')
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [])

  const submitAppeal = async (event: FormEvent<HTMLFormElement>, warningId: string) => {
    event.preventDefault()
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
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not submit this appeal.')
    } finally {
      setBusyId(null)
    }
  }

  if (loading) {
    return <p className="mt-5 text-sm text-muted-foreground" role="status">Loading warnings and appeals…</p>
  }
  if (!warnings.length && !error) return null

  return (
    <Panel className="mt-5 p-5 sm:p-7">
      <span className="eyebrow">Account status</span>
      <h2 className="mt-2 font-serif text-2xl font-bold">Warnings and appeals</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        You can submit one appeal for each warning. Staff decisions are recorded and cannot be changed from this page.
      </p>
      {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
      {warnings.length > 0 && (
        <ul className="mt-4 space-y-3">
          {warnings.map((warning) => (
            <li key={warning.warning_audit_id} className="rounded-xl border border-border p-4">
              <p className="text-xs font-semibold text-muted-foreground">Warning · {formatDate(warning.warning_created_at)}</p>
              <p className="mt-2 whitespace-pre-wrap text-sm">{warning.warning_note || 'No additional reason was provided.'}</p>
              {warning.is_rescinded ? (
                <p className="mt-3 text-sm font-semibold text-green-700">This warning was rescinded.</p>
              ) : warning.appeal_status ? (
                <div className="mt-3 border-t border-border pt-3">
                  <p className="text-sm font-semibold">
                    Appeal {warning.appeal_status === 'pending' ? 'pending review' : warning.appeal_status}.
                  </p>
                  {warning.appeal_text && <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{warning.appeal_text}</p>}
                  {warning.review_note && <p className="mt-2 text-sm">Staff note: {warning.review_note}</p>}
                </div>
              ) : (
                <form onSubmit={(event) => void submitAppeal(event, warning.warning_audit_id)} className="mt-4 border-t border-border pt-3">
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
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
