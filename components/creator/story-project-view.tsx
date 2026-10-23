'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'
import { BookOpen, ExternalLink, ImagePlus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CreatorFrame } from '@/components/shared/creator-frame'
import { FieldSelect } from '@/components/shared/field-select'
import { Panel } from '@/components/shared/panel'
import { StoryEditorView } from '@/components/creator/story-editor-view'
import { getSupabaseClient } from '@/lib/supabase'
import { useWorks } from '@/lib/works-store'
import { normalizeWorkLanguage, WORK_GENRES, WORK_LANGUAGES } from '@/lib/work-taxonomy'
import type { Route, Work } from '@/lib/types'

type ProjectTab = 'details' | 'contents' | 'notes'

export function StoryProjectView({ work, go }: { work: Work; go: (route: Route) => void }) {
  const { updateWork } = useWorks()
  const [tab, setTab] = useState<ProjectTab>('contents')
  const [editingChapter, setEditingChapter] = useState<number | null>(null)
  const [title, setTitle] = useState(work.title)
  const [synopsis, setSynopsis] = useState(work.synopsis ?? '')
  const [genre, setGenre] = useState(work.genre ?? 'Select genre')
  const [language, setLanguage] = useState(normalizeWorkLanguage(work.language))
  const [rating, setRating] = useState(work.rating ?? 'All ages')
  const [coverImageUrl, setCoverImageUrl] = useState(work.coverImageUrl ?? '')
  const [storyNotes, setStoryNotes] = useState(work.authorNote ?? '')
  const [saving, setSaving] = useState(false)
  const [loadingNotes, setLoadingNotes] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const chapters = work.chapters ?? []
  const wordCount = chapters.reduce((total, chapter) => (
    total + (chapter.body.trim() ? chapter.body.trim().split(/\s+/).length : 0)
  ), 0)

  useEffect(() => {
    setTitle(work.title)
    setSynopsis(work.synopsis ?? '')
    setGenre(work.genre ?? 'Select genre')
    setLanguage(normalizeWorkLanguage(work.language))
    setRating(work.rating ?? 'All ages')
    setCoverImageUrl(work.coverImageUrl ?? '')
    setStoryNotes(work.authorNote ?? '')
  }, [work])

  useEffect(() => {
    if (tab !== 'notes') return
    let active = true

    const loadNotes = async () => {
      setLoadingNotes(true)
      setError(null)
      try {
        const { data, error: notesError } = await getSupabaseClient()
          .from('creator_story_notes')
          .select('notes')
          .eq('work_id', work.id)
          .maybeSingle()
        if (notesError) throw notesError
        if (active) setStoryNotes(data?.notes ?? '')
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Hindi ma-load ang story notes.')
      } finally {
        if (active) setLoadingNotes(false)
      }
    }

    void loadNotes()
    return () => { active = false }
  }, [tab, work.id])

  const saveDetails = async () => {
    if (!title.trim()) {
      setError('Ilagay ang pamagat ng project bago i-save.')
      setTab('details')
      return
    }
    if (coverImageUrl.trim()) {
      try {
        const coverUrl = new URL(coverImageUrl)
        if (coverUrl.protocol !== 'http:' && coverUrl.protocol !== 'https:') throw new Error()
      } catch {
        setError('Hindi valid ang cover image URL. Gumamit ng http:// o https:// address, o iwan itong blanko.')
        setTab('details')
        return
      }
    }

    setSaving(true)
    setError(null)
    try {
      await updateWork(work.id, {
        title: title.trim(),
        synopsis,
        genre: genre === 'Select genre' ? undefined : genre,
        language,
        rating,
        coverImageUrl: coverImageUrl.trim() || undefined,
      })
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Hindi na-save ang project details. Subukan ulit.')
    } finally {
      setSaving(false)
    }
  }

  const saveNotes = async () => {
    setSaving(true)
    setError(null)
    try {
      const supabase = getSupabaseClient()
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError
      if (!user || user.id !== work.authorId) throw new Error('Mag-log in sa account na gumawa ng story para i-save ang notes.')
      const { error: notesError } = await supabase
        .from('creator_story_notes')
        .upsert({
          work_id: work.id,
          author_id: user.id,
          notes: storyNotes,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'work_id' })
      if (notesError) throw notesError
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Hindi na-save ang story notes. Subukan ulit.')
    } finally {
      setSaving(false)
    }
  }

  if (editingChapter !== null) {
    return (
      <StoryEditorView
        go={go}
        work={work}
        initialChapterNumber={editingChapter}
        onBack={() => setEditingChapter(null)}
        onSaved={() => setEditingChapter(null)}
      />
    )
  }

  const tabs: { id: ProjectTab; label: string }[] = [
    { id: 'details', label: 'Story details' },
    { id: 'contents', label: 'Table of contents' },
    { id: 'notes', label: 'Story notes' },
  ]

  return (
    <CreatorFrame eyebrow="Creator studio / story project" title={work.title} go={go}>
      <div className="mx-auto grid w-full max-w-6xl items-start gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="flex flex-col gap-3 lg:sticky lg:top-4">
          <Panel className="overflow-hidden p-3">
            <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-secondary">
              {work.coverImageUrl ? (
                <Image
                  src={work.coverImageUrl}
                  alt={`Cover for ${work.title}`}
                  fill
                  unoptimized
                  sizes="(max-width: 1024px) 45vw, 220px"
                  className="object-cover"
                />
              ) : (
                <div className="flex size-full flex-col items-center justify-center gap-2 p-4 text-center text-muted-foreground">
                  <ImagePlus className="size-8" aria-hidden="true" />
                  <p className="text-sm font-semibold">No cover yet</p>
                  <p className="text-xs">Optional — puwedeng idagdag mamaya.</p>
                </div>
              )}
            </div>
            <Button type="button" variant="outline" onClick={() => setTab('details')} className="mt-3 min-h-11 w-full rounded-lg">
              Edit story details
            </Button>
          </Panel>
          <Panel className="p-4">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Project status</p>
            <p className="mt-2 font-semibold">{work.status === 'Draft' ? 'Draft · private' : work.status}</p>
            <p className="mt-1 text-sm text-muted-foreground">{chapters.length} {chapters.length === 1 ? 'chapter' : 'chapters'} · {wordCount.toLocaleString()} words</p>
            <a href={`/works/${work.id}`} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-accent underline underline-offset-4">
              View as reader <ExternalLink className="size-4" aria-hidden="true" />
            </a>
          </Panel>
        </aside>

        <Panel className="min-w-0 overflow-hidden p-0">
          <div className="border-b border-border px-4 pt-2 sm:px-6">
            <div role="tablist" aria-label="Story project sections" className="flex gap-1 overflow-x-auto">
              {tabs.map((item) => (
                <button
                  key={item.id}
                  id={`story-project-tab-${item.id}`}
                  type="button"
                  role="tab"
                  aria-selected={tab === item.id}
                  aria-controls={`story-project-panel-${item.id}`}
                  tabIndex={tab === item.id ? 0 : -1}
                  onClick={() => { setTab(item.id); setError(null) }}
                  onKeyDown={(event) => {
                    const index = tabs.findIndex((candidate) => candidate.id === tab)
                    let nextIndex = index
                    if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length
                    else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length
                    else if (event.key === 'Home') nextIndex = 0
                    else if (event.key === 'End') nextIndex = tabs.length - 1
                    else return
                    event.preventDefault()
                    setTab(tabs[nextIndex].id)
                    setError(null)
                    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex]?.focus()
                  }}
                  className={`min-h-12 shrink-0 border-b-2 px-3 text-sm font-semibold ${tab === item.id ? 'border-accent text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {error && <p role="alert" className="mx-4 mt-4 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive sm:mx-6">{error}</p>}

          {tab === 'details' && (
            <section id="story-project-panel-details" role="tabpanel" aria-labelledby="story-project-tab-details" className="flex flex-col gap-5 p-4 sm:p-6">
              <div>
                <h2 className="font-serif text-2xl font-bold">Story details</h2>
                <p className="mt-1 text-sm text-muted-foreground">These details help readers understand your project. Cover art is optional.</p>
              </div>
              <label className="text-sm font-semibold">
                Project title <span className="text-destructive">*</span>
                <input value={title} maxLength={160} onChange={(event) => setTitle(event.target.value)} aria-invalid={!title.trim()} className="mt-1 min-h-11 w-full rounded-lg border border-input bg-background px-3 font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring" />
              </label>
              <label className="text-sm font-semibold">
                Description <span className="text-xs font-normal text-muted-foreground">(optional)</span>
                <textarea value={synopsis} maxLength={500} onChange={(event) => setSynopsis(event.target.value)} className="mt-1 min-h-28 w-full rounded-lg border border-input bg-background p-3 font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring" />
              </label>
              <label className="text-sm font-semibold">
                Cover image URL <span className="text-xs font-normal text-muted-foreground">(optional)</span>
                <input type="url" value={coverImageUrl} onChange={(event) => setCoverImageUrl(event.target.value)} placeholder="Paste an https:// image link, or leave blank" className="mt-1 min-h-11 w-full rounded-lg border border-input bg-background px-3 font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring" />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <FieldSelect label="Genre" value={genre} onChange={setGenre} options={['Select genre', ...WORK_GENRES]} />
                <FieldSelect label="Language" value={language} onChange={setLanguage} options={[...WORK_LANGUAGES]} />
                <FieldSelect label="Rating" value={rating} onChange={setRating} options={['All ages', 'Teen', 'Mature']} />
              </div>
              <div className="flex justify-end border-t border-border pt-4">
                <Button type="button" disabled={saving || !title.trim()} onClick={() => void saveDetails()} className="min-h-11 rounded-full bg-accent text-accent-foreground">
                  {saving ? 'Saving…' : 'Save details'}
                </Button>
              </div>
            </section>
          )}

          {tab === 'contents' && (
            <section id="story-project-panel-contents" role="tabpanel" aria-labelledby="story-project-tab-contents" className="p-4 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-serif text-2xl font-bold">Table of contents</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Ayusin at ipagpatuloy ang mga kabanata ng project mo.</p>
                </div>
                <Button type="button" onClick={() => setEditingChapter(chapters.length + 1)} className="min-h-11 rounded-full bg-accent text-accent-foreground">
                  <Plus data-icon="inline-start" /> New chapter
                </Button>
              </div>

              {chapters.length ? (
                <ol className="mt-5 divide-y divide-border rounded-xl border border-border">
                  {chapters.map((chapter, index) => {
                    const chapterWords = chapter.body.trim() ? chapter.body.trim().split(/\s+/).length : 0
                    return (
                      <li key={`${chapter.number}-${index}`} className="flex flex-wrap items-center justify-between gap-3 p-4">
                        <button type="button" onClick={() => setEditingChapter(index + 1)} className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left">
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-bold">{index + 1}</span>
                          <span className="min-w-0">
                            <span className="block truncate font-semibold">{chapter.title || `Untitled chapter ${index + 1}`}</span>
                            <span className="mt-1 block text-xs text-muted-foreground">{work.status === 'Draft' ? 'Draft' : 'Published'} · {chapterWords.toLocaleString()} words</span>
                          </span>
                        </button>
                        <Button type="button" variant="outline" onClick={() => setEditingChapter(index + 1)} className="min-h-11 rounded-lg">Edit chapter</Button>
                      </li>
                    )
                  })}
                </ol>
              ) : (
                <div className="mt-5 flex flex-col items-start gap-3 rounded-xl border border-dashed border-border bg-muted/20 p-5">
                  <BookOpen className="size-6 text-accent" aria-hidden="true" />
                  <div>
                    <h3 className="font-semibold">Wala pang kabanata</h3>
                    <p className="mt-1 text-sm text-muted-foreground">Gumawa ng unang kabanata. Maaari itong i-save bilang draft at dagdagan mamaya.</p>
                  </div>
                </div>
              )}
            </section>
          )}

          {tab === 'notes' && (
            <section id="story-project-panel-notes" role="tabpanel" aria-labelledby="story-project-tab-notes" className="flex flex-col gap-4 p-4 sm:p-6">
              <div>
                <h2 className="font-serif text-2xl font-bold">Story notes</h2>
                <p className="mt-1 text-sm text-muted-foreground">Private notes para sa sarili mong reference. Readers cannot access these notes.</p>
              </div>
              <label className="text-sm font-semibold" htmlFor="story-project-notes">Project notes</label>
              <textarea id="story-project-notes" value={storyNotes} maxLength={10000} disabled={loadingNotes} onChange={(event) => setStoryNotes(event.target.value)} placeholder={loadingNotes ? 'Loading notes…' : 'Mga ideya, character details, o reminders…'} className="min-h-48 w-full rounded-lg border border-input bg-background p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60" />
              <div className="flex justify-end border-t border-border pt-4">
                <Button type="button" disabled={saving || loadingNotes} onClick={() => void saveNotes()} className="min-h-11 rounded-full bg-accent text-accent-foreground">
                  {saving ? 'Saving…' : 'Save notes'}
                </Button>
              </div>
            </section>
          )}
        </Panel>
      </div>
    </CreatorFrame>
  )
}
