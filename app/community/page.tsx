'use client'

import { CommunityView } from '@/components/views/community-view'
import { useAppState } from '@/lib/app-state'

export default function Page() {
  const { creator, isLoggedIn, role, setUpgradeOpen, requireAuth } = useAppState()
  const onUnlock = () => {
    if (isLoggedIn) setUpgradeOpen(true)
    else requireAuth('/community')
  }

  return <CommunityView creator={creator} isLoggedIn={isLoggedIn} role={role} onUnlock={onUnlock} />
}