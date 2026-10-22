'use client'

import { WorksView } from '@/components/creator/works-view'
import { useAppState } from '@/lib/app-state'

export default function Page() {
  const { go } = useAppState()
  return <WorksView go={go} />
}
