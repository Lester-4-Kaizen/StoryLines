'use client'

import { useSearchParams } from 'next/navigation'
import { CollaborateView } from '@/components/views/collaborate-view'
import { useAppState } from '@/lib/app-state'

// Split out from the page so useSearchParams (reading ?tab= from the
// Collaborate dropdown) can sit inside the Suspense boundary Next.js
// requires for it.
export function CollaboratePageClient() {
  const { creator, role, go, setUpgradeOpen } = useAppState()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab')
  const initialTab = tabParam === 'active' || tabParam === 'pending' || tabParam === 'past' ? tabParam : 'find'
  return <CollaborateView creator={creator} role={role} go={go} onUpgrade={() => setUpgradeOpen(true)} initialTab={initialTab} />
}