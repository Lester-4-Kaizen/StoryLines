'use client'

import { StoryEditorView } from '@/components/creator/story-editor-view'
import { useAppState } from '@/lib/app-state'

export default function Page() {
  const { go } = useAppState()
  return <StoryEditorView go={go} />
}
