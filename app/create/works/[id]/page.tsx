'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { StoryEditorView } from '@/components/creator/story-editor-view'
import { WorkEditorView } from '@/components/creator/work-editor-view'
import { useAppState } from '@/lib/app-state'
import { useWorks } from '@/lib/works-store'
import { Button } from '@/components/ui/button'
import { ComicEditorView } from '@/components/creator/comic-editor-view'

export default function Page() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { go } = useAppState()
  const { works, hydrated, loadError, refreshWorks } = useWorks()
  const work = works.find((w) => w.id === params.id)

  // If the id doesn't match any work — bad link, or it was deleted — bounce
  // back to the list once we're sure (post-hydration) it really isn't there.
  useEffect(() => {
    if (hydrated && !work) router.replace('/create/works')
  }, [hydrated, work, router])

  if (!hydrated) {
    return <div className="mx-auto flex w-full max-w-4xl flex-col gap-4" aria-label="Loading work editor">
      {[0, 1, 2].map((item) => <div key={item} className="h-20 animate-pulse rounded-xl bg-card motion-reduce:animate-none" />)}
    </div>
  }
  if (loadError) {
    return <div role="alert" className="mx-auto flex w-full max-w-xl flex-col items-start gap-4 rounded-xl border border-destructive/40 bg-destructive/5 p-5">
      <p className="text-sm text-destructive">{loadError}</p>
      <Button type="button" variant="outline" onClick={() => void refreshWorks()}>Try again</Button>
    </div>
  }
  if (!work) return null

  if (work.type === 'story') return <StoryEditorView go={go} work={work} />
  if (work.type === 'comic') return <ComicEditorView go={go} work={work} />
  return <WorkEditorView work={work} go={go} />
}