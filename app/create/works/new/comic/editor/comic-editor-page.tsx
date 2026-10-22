'use client'

import { ComicEditorView } from '@/components/creator/comic-editor-view'
import { useAppState } from '@/lib/app-state'

export default function Page() {
  const { go } = useAppState()
  return <ComicEditorView go={go} />
}