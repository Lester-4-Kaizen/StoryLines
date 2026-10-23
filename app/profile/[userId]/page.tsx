'use client'

import { useParams } from 'next/navigation'
import { ProfileView } from '@/components/views/profile-view'
import { useAppState } from '@/lib/app-state'

export default function PublicProfilePage() {
  const { userId } = useParams<{ userId: string }>()
  const { go } = useAppState()

  return <ProfileView profileId={userId} onEdit={() => go('/settings')} />
}
