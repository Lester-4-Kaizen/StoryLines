'use client'

import { useState, type FormEvent } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Check, Flag, X } from 'lucide-react'
import { getSupabaseClient } from '@/lib/supabase'

export type ReportTargetType = 'post' | 'comment' | 'chapter_comment' | 'work' | 'profile'
type ReportReason =
  | 'spam_scam'
  | 'harassment_bullying'
  | 'hate_speech'
  | 'sexual_graphic_content'
  | 'violence_self_harm'
  | 'copied_stolen_work'
  | 'something_else'

const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'spam_scam', label: 'Spam or scam' },
  { value: 'harassment_bullying', label: 'Harassment or bullying' },
  { value: 'hate_speech', label: 'Hate speech' },
  { value: 'sexual_graphic_content', label: 'Sexual or graphic content' },
  { value: 'violence_self_harm', label: 'Violence or self-harm' },
  { value: 'copied_stolen_work', label: 'Copied or stolen work' },
  { value: 'something_else', label: 'Something else' },
]

export function ContentReportMenuItem({
  targetType,
  targetId,
  reportedUserId,
  reportedName,
  reportedUsername,
  currentUserId,
  contentLabel,
  onHide,
}: {
  targetType: ReportTargetType
  targetId: string
  reportedUserId: string
  reportedName: string
  reportedUsername?: string | null
  currentUserId: string | null
  contentLabel: string
  onHide?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [reason, setReason] = useState<ReportReason>('harassment_bullying')
  const [note, setNote] = useState('')
  const [alsoBlock, setAlsoBlock] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [blocking, setBlocking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const pathname = usePathname()

  if (currentUserId === reportedUserId) return null

  const close = () => {
    if (submitting || blocking) return
    setOpen(false)
    setSubmitted(false)
    setError(null)
    setNote('')
    setAlsoBlock(false)
    setBlocked(false)
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!currentUserId) {
      router.push(`/login?next=${encodeURIComponent(pathname)}`)
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const { error: reportError } = await getSupabaseClient().rpc('submit_community_content_report', {
        p_target_type: targetType,
        p_target_id: targetId,
        p_reason: reason,
        p_note: note.trim(),
        p_block_reported: alsoBlock,
      })
      if (reportError) throw reportError
      setBlocked(alsoBlock)
      setSubmitted(true)
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : 'Could not submit your report.'
      setError(message.includes('report limit')
        ? 'You’ve reached the report limit. Please try again later.'
        : message || 'Could not submit your report. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const blockReportedAccount = async () => {
    setBlocking(true)
    setError(null)
    try {
      const { error: blockError } = await getSupabaseClient().rpc('set_community_message_account_control', {
        p_account_id: reportedUserId,
        p_status: 'blocked',
      })
      if (blockError) throw blockError
      setBlocked(true)
    } catch (blockError) {
      setError(blockError instanceof Error ? blockError.message : 'Could not block this account.')
    } finally {
      setBlocking(false)
    }
  }

  const usernameLabel = reportedUsername ? `@${reportedUsername}` : reportedName

  return (
    <>
      <button
        type="button"
        role="menuitem"
        className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-semibold text-destructive hover:bg-destructive/10"
        onClick={(event) => {
          event.currentTarget.closest('details')?.removeAttribute('open')
          if (!currentUserId) {
            router.push(`/login?next=${encodeURIComponent(pathname)}`)
            return
          }
          setOpen(true)
        }}
      >
        <Flag className="size-4" /> Report {contentLabel}
      </button>
      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/45 p-3 sm:p-5"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close()
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') close()
          }}
        >
          {submitted ? (
            <section role="dialog" aria-modal="true" aria-labelledby="report-thanks-title" className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl sm:p-6">
              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-accent/10 text-accent">
                <Check className="size-6" aria-hidden="true" />
              </div>
              <h2 id="report-thanks-title" className="mt-3 text-center font-serif text-2xl font-bold">Salamat sa pag-report.</h2>
              <p className="mt-2 text-center text-sm leading-6 text-muted-foreground">
                We’ll review it. You may not hear back, but we read every report. The reported person will not be told who sent it.
              </p>
              {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {onHide && (
                  <button type="button" onClick={() => { onHide(); close() }} className="min-h-11 rounded-full border border-border px-4 text-sm font-semibold hover:bg-muted">
                    Hide {contentLabel}
                  </button>
                )}
                {!blocked && (
                  <button type="button" onClick={() => void blockReportedAccount()} disabled={blocking} className="min-h-11 rounded-full border border-border px-4 text-sm font-semibold hover:border-destructive hover:text-destructive disabled:opacity-60">
                    {blocking ? 'Blocking…' : `Block ${usernameLabel}`}
                  </button>
                )}
                {blocked && <span className="inline-flex min-h-11 items-center rounded-full bg-muted px-4 text-sm font-semibold">Blocked {usernameLabel}</span>}
                <button type="button" onClick={close} className="min-h-11 rounded-full bg-accent px-4 text-sm font-bold text-accent-foreground">Done</button>
              </div>
            </section>
          ) : (
            <form role="dialog" aria-modal="true" aria-labelledby="report-dialog-title" onSubmit={(event) => void submit(event)} className="max-h-[min(92dvh,48rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-2xl sm:p-6">
              <header className="flex items-start justify-between gap-3">
                <div>
                  <h2 id="report-dialog-title" className="font-serif text-2xl font-bold">Report this {contentLabel}</h2>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">Why are you reporting this? Choose the closest reason.</p>
                </div>
                <button type="button" onClick={close} disabled={submitting} className="flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-muted disabled:opacity-50" aria-label="Close report dialog">
                  <X className="size-5" />
                </button>
              </header>
              <fieldset className="mt-4 space-y-2" disabled={submitting}>
                <legend className="sr-only">Report reason</legend>
                {REPORT_REASONS.map((item) => (
                  <label key={item.value} className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 text-sm ${reason === item.value ? 'border-accent bg-accent/5' : 'border-border hover:bg-muted/50'}`}>
                    <input type="radio" name="report-reason" value={item.value} checked={reason === item.value} onChange={() => setReason(item.value)} className="size-4 accent-accent" />
                    {item.label}
                  </label>
                ))}
              </fieldset>
              <label htmlFor="report-note" className="mt-4 block text-xs font-semibold">Anything else we should know? (optional)</label>
              <textarea id="report-note" value={note} onChange={(event) => setNote(event.target.value.slice(0, 1000))} maxLength={1000} rows={4} disabled={submitting} className="mt-2 w-full resize-y rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60" />
              <p className="mt-1 text-right text-[11px] text-muted-foreground">{note.length}/1000</p>
              <label className="mt-2 flex min-h-11 items-center gap-2 text-xs">
                <input type="checkbox" checked={alsoBlock} onChange={(event) => setAlsoBlock(event.target.checked)} disabled={submitting} className="size-4 accent-accent" />
                Also block {usernameLabel}
              </label>
              {error && <p role="alert" className="mt-3 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={close} disabled={submitting} className="min-h-11 rounded-full border border-border px-4 text-sm font-semibold disabled:opacity-50">Cancel</button>
                <button type="submit" disabled={submitting} className="min-h-11 rounded-full bg-destructive px-4 text-sm font-bold text-destructive-foreground disabled:opacity-60">
                  {submitting ? 'Submitting…' : 'Submit report'}
                </button>
              </div>
              <p className="mt-3 text-[11px] leading-5 text-muted-foreground">If someone is in immediate danger, contact local emergency services.</p>
            </form>
          )}
        </div>
      )}
    </>
  )
}
