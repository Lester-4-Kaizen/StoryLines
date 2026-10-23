'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CreatorFrame } from '@/components/shared/creator-frame'
import { FieldSelect } from '@/components/shared/field-select'
import { Panel } from '@/components/shared/panel'
import { useWorks } from '@/lib/works-store'
import type { Route, Work } from '@/lib/types'

// One screen for editing an existing Work, story or comic — unlike the
// New Work flow (format picker → setup → editor as separate steps), an
// existing work already knows its type and just needs its fields open for
// change, so this collapses setup + content into a single page.
export function WorkEditorView({ work, go }: { work: Work; go: (route: Route) => void }) {
  const router = useRouter()
  const { updateWork, deleteWork } = useWorks()

  const [title, setTitle] = useState(work.title)
  const [synopsis, setSynopsis] = useState(work.synopsis ?? '')
  const [genre, setGenre] = useState(work.genre ?? 'Select genre')
  const [language, setLanguage] = useState(work.language ?? 'English')
  const [rating, setRating] = useState(work.rating ?? 'All ages')
  const [chapterTitle, setChapterTitle] = useState(work.chapterTitle ?? 'Chapter 1')
  const [chapterBody, setChapterBody] = useState(work.chapterBody ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const backToWorks = () => router.push('/create/works')

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      await updateWork(work.id, {
        title: title.trim() || work.title,
        synopsis,
        genre: genre === 'Select genre' ? undefined : genre,
        language,
        rating,
        status: work.status,
        ...(work.type === 'story' ? { chapterTitle, chapterBody } : {}),
      })
      backToWorks()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Hindi na-save ang changes. Subukan ulit.')
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    setSaving(true)
    setError(null)
    try {
      await deleteWork(work.id)
      backToWorks()
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Hindi na-delete ang work. Subukan ulit.')
      setSaving(false)
    }
  }

  return (
    <CreatorFrame eyebrow={`Editing ${work.type === 'story' ? 'story' : work.type === 'comic' ? 'comic' : 'artwork'}`} title={work.title} go={go} backHref="/create/works">
      <Panel className="mx-auto w-full max-w-3xl">
        <div className="flex flex-col gap-6">
          <div>
            <label htmlFor="work-title" className="text-sm font-bold">Title</label>
            <input
              id="work-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={160}
              required
              className="mt-2 min-h-11 w-full rounded-lg border border-input bg-background px-3 py-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="work-synopsis" className="text-sm font-bold">Synopsis</label>
              <span id="synopsis-count" className="text-xs text-muted-foreground">{synopsis.length}/500</span>
            </div>
            <textarea
              id="work-synopsis"
              value={synopsis}
              maxLength={500}
              onChange={(e) => setSynopsis(e.target.value)}
              aria-describedby="synopsis-count"
              placeholder="Ano ang dapat malaman ng readers bago magsimula?"
              className="mt-2 min-h-28 w-full resize-y rounded-lg border border-input bg-background px-3 py-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldSelect label="Genre" value={genre} onChange={setGenre} options={['Select genre', 'Fantasy', 'Romance', 'Slice of life', 'Mystery']} />
            <FieldSelect label="Language" value={language} onChange={setLanguage} options={['English', 'Filipino', 'Other']} />
            <FieldSelect label="Rating" value={rating} onChange={setRating} options={['All ages', 'Teen', 'Mature']} />
          </div>

          {work.type === 'story' ? (
            <div className="flex flex-col gap-3 border-t border-border pt-6">
              <div className="flex items-center justify-between">
                <input
                  value={chapterTitle}
                  onChange={(e) => setChapterTitle(e.target.value)}
                  className="font-serif text-xl font-bold outline-none"
                  aria-label="Chapter title"
                />
                <span className="text-xs text-muted-foreground">{chapterBody.length} characters</span>
              </div>
              <textarea
                value={chapterBody}
                onChange={(e) => setChapterBody(e.target.value)}
                placeholder="Dito magsimula ang kuwento mo..."
                className="min-h-70 w-full resize-y bg-transparent font-serif text-base leading-7 outline-none"
              />
            </div>
          ) : (
            <div className="border-t border-border pt-6">
              <p className="text-sm text-muted-foreground">Page uploads and publishing are not available yet. You can update the saved work details here.</p>
            </div>
          )}

          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-col-reverse justify-between gap-3 border-t border-border pt-5 sm:flex-row">
            <Button type="button" variant="destructive" disabled={saving} onClick={() => setConfirmDelete(true)} className="min-h-11 rounded-lg">
              <Trash2 data-icon="inline-start" /> Delete work
            </Button>
            <Button type="button" disabled={saving || !title.trim()} onClick={() => void save()} className="min-h-11 rounded-lg bg-accent text-accent-foreground">
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </div>
      </Panel>
      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-primary/45 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) setConfirmDelete(false)
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-work-title"
            className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-xl"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setConfirmDelete(false)
                return
              }
              if (event.key !== 'Tab') return
              const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
              const first = buttons[0]
              const last = buttons[buttons.length - 1]
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault()
                last?.focus()
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault()
                first?.focus()
              }
            }}
          >
            <h2 id="delete-work-title" className="font-serif text-xl font-bold">Delete this work?</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Burahin ang “{work.title}”? Hindi na ito maibabalik.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setConfirmDelete(false)} className="rounded-lg" autoFocus>
                Cancel
              </Button>
              <Button type="button" variant="destructive" disabled={saving} onClick={() => void remove()} className="min-h-11 rounded-lg">
                <Trash2 data-icon="inline-start" /> {saving ? 'Deleting…' : 'Delete work'}
              </Button>
            </div>
          </section>
        </div>
      )}
    </CreatorFrame>
  )
}