'use client'

import { WorkSetup } from '@/components/creator/work-setup'
import { useAppState } from '@/lib/app-state'

export default function Page() {
  const { go } = useAppState()
  return <WorkSetup type="Comic" go={go} />
}
