'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CreatorFrame } from '@/components/shared/creator-frame'
import { CoverImageField } from '@/components/shared/cover-image-field'
import { FieldSelect } from '@/components/shared/field-select'
import { Panel } from '@/components/shared/panel'
import { WorkMoodSelector } from '@/components/shared/work-mood-selector'
import { deleteCreatorCoverByUrl, uploadCreatorCover } from '@/lib/creator-image-upload'
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
  const router = useRouter()
  const { addWork, draft, clearDraft } = useWorks()
  const [title, setTitle] = useState(draft?.title ?? '')
  const [synopsis, setSynopsis] = useState(draft?.synopsis ?? '')
  const [genre, setGenre] = useState(draft?.genre ?? 'Select genre')
  const [moods, setMoods] = useState(draft?.moods ?? [])
  const [language, setLanguage] = useState(normalizeWorkLanguage(draft?.language))
  const [coverImageUrl, setCoverImageUrl] = useState(draft?.coverImageUrl ?? '')
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [rating, setRating] = useState(draft?.rating ?? 'All ages')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fields = (coverUrl: string) => ({
    title: title.trim() || `Untitled ${type}`,
    type: (type === 'Story' ? 'story' : 'comic') as 'story' | 'comic',
    synopsis,
    genre: genre === 'Select genre' ? undefined : genre,
    moods,
    language,
    rating,
    coverImageUrl: coverUrl.trim() || undefined,
  })

  const createProject = async (openProject: boolean) => {
    if (saving) return
    setSaving(true)
    setError(null)
    let uploadedCoverUrl: string | null = null
    try {
      const uploadedCover = coverFile ? await uploadCreatorCover(coverFile) : null
      uploadedCoverUrl = uploadedCover?.imageUrl ?? null
      const work = await addWork({ ...fields(uploadedCover?.imageUrl ?? coverImageUrl), authorId: 'me', status: 'Draft' })
      clearDraft()
      if (openProject) router.push(`/create/works/${work.id}`)
      else router.push('/create/works')
    } catch (saveError) {
      if (uploadedCoverUrl) {
        try {
          await deleteCreatorCoverByUrl(uploadedCoverUrl)
        } catch (cleanupError) {
          console.error('Could not clean up an unsaved cover image', cleanupError)
        }
      }
      setError(saveError instanceof Error ? saveError.message : 'Hindi nagawa ang project. Subukan ulit.')
    } finally {
      setSaving(false)
    }
  }

  const saveDraft = async () => {
    await createProject(false)
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
          <CoverImageField imageUrl={coverImageUrl} pendingFile={coverFile} onFileChange={setCoverFile} onRemove={() => setCoverImageUrl('')} />
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
          </div>
          <WorkMoodSelector selected={moods} onChange={setMoods} />
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {children}
          <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-between">
            <Button type="button" variant="outline" disabled={!title.trim() || saving} onClick={() => void saveDraft()} className="min-h-11 rounded-lg">
              {saving ? 'Creating…' : 'Save as draft'}
            </Button>
            <Button type="button" disabled={!title.trim() || saving} onClick={() => void createProject(true)} className="min-h-11 rounded-lg bg-accent text-accent-foreground">
              {saving ? 'Creating project…' : 'Create project'} <ChevronRight data-icon="inline-end" />
            </Button>
          </div>
        </div>
      </Panel>
    </CreatorFrame>
  )
}