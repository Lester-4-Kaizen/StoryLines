'use client'

import { NewWorkView } from '@/components/creator/new-work-view'
import { useAppState } from '@/lib/app-state'

export default function Page() {
  const { go, badges } = useAppState()
  return <NewWorkView go={go} badges={badges} />
}
