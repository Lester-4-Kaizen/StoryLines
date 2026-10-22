'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FieldSelect } from '@/components/shared/field-select'
import { Panel } from '@/components/shared/panel'
import { useWorks } from '@/lib/works-store'
import type { Work } from '@/lib/types'

// One screen for editing an existing Work, story or comic — unlike the
// New Work flow (format picker → setup → editor as separate steps), an
// existing work already knows its type and just needs its fields open for
// change, so this collapses setup + content into a single page.
export function WorkEditorView({ work }: { work: Work }) {
  const router = useRouter()
  const { updateWork, deleteWork } = useWorks()

  const [title, setTitle] = useState(work.title)
  const [synopsis, setSynopsis] = useState(work.synopsis ?? '')
  const [genre, setGenre] = useState(work.genre ?? 'Select genre')
  const [language, setLanguage] = useState(work.language ?? 'English')
  const [rating, setRating] = useState(work.rating ?? 'All ages')
  const [status, setStatus] = useState<Work['status']>(work.status)
  const [chapterTitle, setChapterTitle] = useState(work.chapterTitle ?? 'Chapter 1')
  const [chapterBody, setChapterBody] = useState(work.chapterBody ?? '')
  const [pageCount, setPageCount] = useState(work.pageCount ?? 0)

  const backToWorks = () => router.push('/create/works')

  const save = () => {
    updateWork(work.id, {
      title: title.trim() || work.title,
      synopsis,
      genre: genre === 'Select genre' ? undefined : genre,
      language,
      rating,
      status,
      ...(work.type === 'story' ? { chapterTitle, chapterBody } : { pageCount }),
    })
    backToWorks()
  }

  const remove = () => {
    if (confirm(`Delete "${work.title}"? This can't be undone.`)) {
      deleteWork(work.id)
      backToWorks()
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <button onClick={backToWorks} className="flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-foreground">
            <ChevronLeft className="size-3.5" /> Back to works
          </button>
          <span className="eyebrow mt-3 block">Editing {work.type === 'story' ? 'story' : 'comic'}</span>
          <h1 className="mt-1 font-serif text-5xl font-bold text-balance">{work.title}</h1>
        </div>
        <Button variant="destructive" onClick={remove} className="shrink-0 rounded-lg">
          <Trash2 data-icon="inline-start" /> Delete
        </Button>
      </div>

      <Panel className="mx-auto w-full max-w-3xl">
        <div className="flex flex-col gap-6">
          <div>
            <label className="text-sm font-bold">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-2 w-full rounded-lg border border-input bg-background px-3 py-3 text-sm outline-none focus:border-accent"
            />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold">Synopsis</label>
              <span className="text-xs text-muted-foreground">{synopsis.length}/500</span>
            </div>
            <textarea
              value={synopsis}
              onChange={(e) => setSynopsis(e.target.value.slice(0, 500))}
              placeholder="What should readers know before they begin?"
              className="mt-2 min-h-28 w-full resize-none rounded-lg border border-input bg-background px-3 py-3 text-sm outline-none focus:border-accent"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldSelect label="Genre" value={genre} onChange={setGenre} options={['Select genre', 'Fantasy', 'Romance', 'Slice of life', 'Mystery']} />
            <FieldSelect label="Language" value={language} onChange={setLanguage} options={['English', 'Filipino', 'Other']} />
            <FieldSelect label="Rating" value={rating} onChange={setRating} options={['All ages', 'Teen', 'Mature']} />
            <FieldSelect label="Status" value={status} onChange={(v) => setStatus(v as Work['status'])} options={['Draft', 'Ongoing', 'Complete']} />
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
                placeholder="Begin writing here..."
                className="min-h-70 w-full resize-y bg-transparent font-serif text-base leading-7 outline-none"
              />
            </div>
          ) : (
            <div className="border-t border-border pt-6">
              <label className="text-sm font-bold">Page count</label>
              <p className="mt-1 text-xs text-muted-foreground">Re-uploading pages isn't available yet — you can adjust the count for now.</p>
              <input
                type="number"
                min={0}
                value={pageCount}
                onChange={(e) => setPageCount(Math.max(0, Number(e.target.value)))}
                className="mt-2 w-32 rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-accent"
              />
            </div>
          )}

          <div className="flex justify-end border-t border-border pt-5">
            <Button onClick={save} className="rounded-lg bg-accent text-accent-foreground">
              Save changes
            </Button>
          </div>
        </div>
      </Panel>
    </div>
  )
}