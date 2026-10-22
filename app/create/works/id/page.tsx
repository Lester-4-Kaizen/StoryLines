'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { WorkEditorView } from '@/components/creator/work-editor-view'
import { useWorks } from '@/lib/works-store'

export default function Page() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { works, hydrated } = useWorks()
  const work = works.find((w) => w.id === params.id)

  // If the id doesn't match any work — bad link, or it was deleted — bounce
  // back to the list once we're sure (post-hydration) it really isn't there.
  useEffect(() => {
    if (hydrated && !work) router.replace('/create/works')
  }, [hydrated, work, router])

  if (!hydrated || !work) return null

  return <WorkEditorView work={work} />
}