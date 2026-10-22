'use client'

import { DashboardView } from '@/components/creator/dashboard-view'
import { useAppState } from '@/lib/app-state'

export default function Page() {
  const { go } = useAppState()
  return <DashboardView go={go} />
}
