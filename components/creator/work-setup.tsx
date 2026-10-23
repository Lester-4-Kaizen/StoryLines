'use client'

import { useState } from 'react'
import { ChevronRight, ImagePlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CreatorFrame } from '@/components/shared/creator-frame'
import { FieldSelect } from '@/components/shared/field-select'
import { Panel } from '@/components/shared/panel'
import { WorkMoodSelector } from '@/components/shared/work-mood-selector'
import { useWorks } from '@/lib/works-store'
import { normalizeWorkLanguage, WORK_GENRES, WORK_LANGUAGES } from '@/lib/work-taxonomy'
import type { Route } from '@/lib/types'

export function WorkSetup({
  type,
  go,
  children,
}: {
  type: 'Story' | 'Comic'
  go: (route: Route) => void
  children?: React.ReactNode
}) {
  const { addWork, draft, setDraft } = useWorks()
  const [title, setTitle] = useState(draft?.title ?? '')
  const [synopsis, setSynopsis] = useState(draft?.synopsis ?? '')
  const [genre, setGenre] = useState(draft?.genre ?? 'Select genre')
  const [moods, setMoods] = useState(draft?.moods ?? [])
  const [language, setLanguage] = useState(normalizeWorkLanguage(draft?.language))
  const [coverImageUrl, setCoverImageUrl] = useState(draft?.coverImageUrl ?? '')
  const [rating, setRating] = useState(draft?.rating ?? 'All ages')
  const [status, setStatus] = useState<'Draft' | 'Ongoing' | 'Complete'>(draft?.status ?? 'Draft')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const editorRoute: Route = type === 'Story' ? '/create/works/new/story/editor' : '/create/works/new/comic/editor'

  const fields = () => ({
    title: title.trim() || `Untitled ${type}`,
    type: (type === 'Story' ? 'story' : 'comic') as 'story' | 'comic',
    synopsis,
    genre: genre === 'Select genre' ? undefined : genre,
    moods,
    language,
    rating,
    coverImageUrl: coverImageUrl.trim() || undefined,
  })

  // "Save draft" persists a Work right away (forced to Draft status,
  // regardless of what the Status dropdown says — clicking this explicitly
  // means "I'm not ready to write yet"). "Continue to editor" instead
  // hands these fields off via the Works draft slot, since the actual
  // content (chapter text / page count) only exists once you're in the
  // Story/Comic editor on the next page.
  const saveDraft = async () => {
    setSaving(true)
    setError(null)
    try {
      await addWork({ ...fields(), authorId: 'me', status: 'Draft' })
      go('/create/works')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Hindi na-save ang draft. Subukan ulit.')
    } finally {
      setSaving(false)
    }
  }

  const continueToEditor = () => {
    setDraft({ ...fields(), status })
    go(editorRoute)
  }

  return (
    <CreatorFrame eyebrow={`Creator studio / ${type.toLowerCase()} setup`} title={`Set up your ${type.toLowerCase()}.`} go={go}>
      <Panel className="mx-auto w-full max-w-3xl">
        <div className="flex flex-col gap-6">
          <div>
            <label htmlFor="work-title" className="text-sm font-bold">
              Project title <span className="text-accent">*</span>
            </label>
            <input
              id="work-title"
              value={title}
              maxLength={160}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={`Untitled ${type} project`}
              aria-invalid={!title.trim()}
              aria-describedby={!title.trim() ? 'work-title-error' : undefined}
              className="mt-2 min-h-11 w-full rounded-lg border border-input bg-background px-3 py-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {!title.trim() && <p id="work-title-error" className="mt-1 text-xs text-destructive">Maglagay ng title bago magpatuloy.</p>}
          </div>
          <div>
            <label htmlFor="work-cover-url" className="text-sm font-bold">
              Cover image <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <div className="mt-2 flex items-center gap-3 rounded-lg border border-dashed border-border bg-muted/30 p-4">
              <ImagePlus className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <input
                  id="work-cover-url"
                  type="url"
                  value={coverImageUrl}
                  onChange={(event) => setCoverImageUrl(event.target.value)}
                  placeholder="Paste an image URL, or leave this blank for now"
                  className="min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  Puwedeng walang cover habang ginagawa ang project. Hindi ito kailangan para i-save. {type === 'Comic' && 'Kailangan pa rin ng comic pages para i-publish.'}
                </p>
              </div>
            </div>
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
            <FieldSelect label="Genre" value={genre} onChange={setGenre} options={['Select genre', ...WORK_GENRES]} />
            <FieldSelect label="Language" value={language} onChange={setLanguage} options={[...WORK_LANGUAGES]} />
            <FieldSelect label="Rating" value={rating} onChange={setRating} options={['All ages', 'Teen', 'Mature']} />
            <FieldSelect label="Status" value={status} onChange={(v) => setStatus(v as typeof status)} options={['Draft', 'Ongoing', 'Complete']} />
          </div>
          <WorkMoodSelector selected={moods} onChange={setMoods} />
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {children}
          <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-between">
            <Button type="button" variant="outline" disabled={!title.trim() || saving} onClick={() => void saveDraft()} className="min-h-11 rounded-lg">
              {saving ? 'Saving…' : 'Save draft'}
            </Button>
            <Button type="button" disabled={!title.trim() || saving} onClick={continueToEditor} className="min-h-11 rounded-lg bg-accent text-accent-foreground">
              Magpatuloy sa editor <ChevronRight data-icon="inline-end" />
            </Button>
          </div>
        </div>
      </Panel>
    </CreatorFrame>
  )
}