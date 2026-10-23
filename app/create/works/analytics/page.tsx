'use client'

import { AnalyticsView } from '@/components/creator/analytics-view'
import { useAppState } from '@/lib/app-state'

export default function Page() {
  const { go } = useAppState()
  return <AnalyticsView go={go} />
}
