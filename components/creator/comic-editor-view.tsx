'use client'

import { useState } from 'react'
import { Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CreatorFrame } from '@/components/shared/creator-frame'
import { Panel } from '@/components/shared/panel'
import { useWorks } from '@/lib/works-store'
import type { Route } from '@/lib/types'

export function ComicEditorView({ go }: { go: (route: Route) => void }) {
  const { draft, addWork, clearDraft } = useWorks()
  const [pages, setPages] = useState(0)

  const publish = (status: 'Draft' | 'Ongoing') => {
    addWork({
      title: draft?.title ?? 'Untitled Comic',
      type: 'comic',
      authorId: 'me',
      synopsis: draft?.synopsis,
      genre: draft?.genre,
      language: draft?.language,
      rating: draft?.rating,
      status,
      pageCount: pages,
    })
    clearDraft()
    go('/create/works')
  }

  return (
    <CreatorFrame eyebrow="Comic editor" title={draft?.title ? `Laying out “${draft.title}”` : 'Lay out the pages.'} go={go}>
      <Panel className="mx-auto w-full max-w-4xl">
        <div className="flex flex-col gap-6">
          <div>
            <h2 className="font-serif text-2xl font-bold">Upload your pages</h2>
            <p className="mt-1 text-sm text-muted-foreground">PNG, JPG, or WEBP · Recommended width 1080px · Up to 20MB per file.</p>
          </div>
          <label className="flex min-h-64 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 text-center">
            <Upload className="size-7 text-accent" />
            <span className="mt-3 text-sm font-bold">Choose comic pages</span>
            <span className="mt-1 text-xs text-muted-foreground">Drag and drop is coming soon</span>
            <input type="file" multiple className="sr-only" onChange={(e) => setPages(e.target.files?.length ?? 0)} />
          </label>
          <div className="flex items-center justify-between rounded-lg bg-muted/40 p-4 text-sm">
            <span>
              {pages} page{pages === 1 ? '' : 's'} selected
            </span>
            <span className="text-muted-foreground">Reorder and crop controls unlock after upload.</span>
          </div>
          <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-between">
            <Button variant="outline" onClick={() => publish('Draft')} className="rounded-lg">
              Save draft
            </Button>
            <Button onClick={() => publish('Ongoing')} disabled={!pages} className="rounded-lg bg-accent text-accent-foreground">
              Publish comic
            </Button>
          </div>
        </div>
      </Panel>
    </CreatorFrame>
  )
}