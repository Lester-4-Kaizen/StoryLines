'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { CreatorFrame } from '@/components/shared/creator-frame'
import { Panel } from '@/components/shared/panel'
import { useWorks } from '@/lib/works-store'
import type { Route } from '@/lib/types'

export function StoryEditorView({ go }: { go: (route: Route) => void }) {
  const { draft, addWork, clearDraft } = useWorks()
  const [body, setBody] = useState('')
  const [chapter, setChapter] = useState('Chapter 1')

  const publish = (status: 'Draft' | 'Ongoing') => {
    addWork({
      title: draft?.title ?? 'Untitled Story',
      type: 'story',
      authorId: 'me',
      synopsis: draft?.synopsis,
      genre: draft?.genre,
      language: draft?.language,
      rating: draft?.rating,
      status,
      chapterTitle: chapter,
      chapterBody: body,
    })
    clearDraft()
    go('/create/works')
  }

  return (
    <CreatorFrame eyebrow="Story editor" title={draft?.title ? `Writing “${draft.title}”` : 'The first chapter.'} go={go} backHref="/create/works/new/story">
      <Panel className="mx-auto w-full max-w-4xl">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <input
              value={chapter}
              onChange={(e) => setChapter(e.target.value)}
              className="font-serif text-2xl font-bold outline-none"
              aria-label="Chapter title"
            />
            <span className="text-xs text-muted-foreground">Autosaved locally · {body.length} characters</span>
          </div>
          <div className="flex flex-wrap gap-2 border-y border-border py-3">
            <Button variant="outline" size="sm" className="rounded-lg font-serif font-bold">
              B
            </Button>
            <Button variant="outline" size="sm" className="rounded-lg italic">
              I
            </Button>
            <Button variant="outline" size="sm" className="rounded-lg">
              Add image
            </Button>
          </div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Dito magsimula ang kuwento mo..."
            className="min-h-90 w-full resize-y bg-transparent font-serif text-lg leading-8 outline-none"
          />
          <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-between">
            <Button variant="outline" onClick={() => publish('Draft')} className="rounded-lg">
              Save draft
            </Button>
            <Button onClick={() => publish('Ongoing')} className="rounded-lg bg-accent text-accent-foreground">
              I-publish ang story
            </Button>
          </div>
        </div>
      </Panel>
    </CreatorFrame>
  )
}