'use client'

import { ProfileView } from '@/components/views/profile-view'
import { useAppState } from '@/lib/app-state'

export default function Page() {
  const { go } = useAppState()
  return <ProfileView onEdit={() => go('/settings')} />
}
