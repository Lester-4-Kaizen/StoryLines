'use client'

import { HomeView } from '@/components/views/home-view'
import { useAppState } from '@/lib/app-state'

export default function Page() {
  const { creator, create, go } = useAppState()
  return <HomeView creator={creator} onCreate={create} go={go} />
}
