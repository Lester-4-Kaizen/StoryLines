import { Suspense } from 'react'
import { CollaboratePageClient } from '@/components/collaborate-page-client'

export default function Page() {
  return (
    <Suspense fallback={null}>
      <CollaboratePageClient />
    </Suspense>
  )
}