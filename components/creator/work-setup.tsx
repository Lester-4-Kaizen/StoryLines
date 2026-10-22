'use client'

import { useState } from 'react'
import { ChevronRight, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CreatorFrame } from '@/components/shared/creator-frame'
import { FieldSelect } from '@/components/shared/field-select'
import { Panel } from '@/components/shared/panel'
import { useWorks } from '@/lib/works-store'
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
  const { addWork, setDraft } = useWorks()
  const [title, setTitle] = useState('')
  const [synopsis, setSynopsis] = useState('')
  const [genre, setGenre] = useState('Select genre')
  const [language, setLanguage] = useState('English')
  const [rating, setRating] = useState('All ages')
  const [status, setStatus] = useState<'Draft' | 'Ongoing' | 'Complete'>('Draft')

  const editorRoute: Route = type === 'Story' ? '/create/works/new/story/editor' : '/create/works/new/comic/editor'

  const fields = () => ({
    title: title.trim() || `Untitled ${type}`,
    type: (type === 'Story' ? 'story' : 'comic') as 'story' | 'comic',
    synopsis,
    genre: genre === 'Select genre' ? undefined : genre,
    language,
    rating,
  })

  // "Save draft" persists a Work right away (forced to Draft status,
  // regardless of what the Status dropdown says — clicking this explicitly
  // means "I'm not ready to write yet"). "Continue to editor" instead
  // hands these fields off via the Works draft slot, since the actual
  // content (chapter text / page count) only exists once you're in the
  // Story/Comic editor on the next page.
  const saveDraft = () => {
    addWork({ ...fields(), authorId: 'me', status: 'Draft' })
    go('/create/works')
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
            <label className="text-sm font-bold">
              Title <span className="text-accent">*</span>
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={`Untitled ${type}`}
              className="mt-2 w-full rounded-lg border border-input bg-background px-3 py-3 text-sm outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="text-sm font-bold">Cover image</label>
            <div className="mt-2 flex min-h-36 items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 text-center text-sm text-muted-foreground">
              <Upload className="mr-2 size-4" /> Mag-upload ng cover, o idagdag na lang mamaya
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold">Synopsis</label>
              <span className="text-xs text-muted-foreground">{synopsis.length}/500</span>
            </div>
            <textarea
              value={synopsis}
              onChange={(e) => setSynopsis(e.target.value.slice(0, 500))}
              placeholder="Ano ang dapat malaman ng readers bago magsimula?"
              className="mt-2 min-h-28 w-full resize-none rounded-lg border border-input bg-background px-3 py-3 text-sm outline-none focus:border-accent"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldSelect label="Genre" value={genre} onChange={setGenre} options={['Select genre', 'Fantasy', 'Romance', 'Slice of life', 'Mystery']} />
            <FieldSelect label="Language" value={language} onChange={setLanguage} options={['English', 'Filipino', 'Other']} />
            <FieldSelect label="Rating" value={rating} onChange={setRating} options={['All ages', 'Teen', 'Mature']} />
            <FieldSelect label="Status" value={status} onChange={(v) => setStatus(v as typeof status)} options={['Draft', 'Ongoing', 'Complete']} />
          </div>
          {children}
          <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-between">
            <Button variant="outline" disabled={!title.trim()} onClick={saveDraft} className="rounded-lg">
              Save draft
            </Button>
            <Button disabled={!title.trim()} onClick={continueToEditor} className="rounded-lg bg-accent text-accent-foreground">
              Magpatuloy sa editor <ChevronRight data-icon="inline-end" />
            </Button>
          </div>
        </div>
      </Panel>
    </CreatorFrame>
  )
}