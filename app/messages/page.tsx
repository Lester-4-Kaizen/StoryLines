import { Suspense } from 'react'
import { MessagesView } from '@/components/views/messages-view'

export default function Page() {
  return (
    <Suspense fallback={<div className="h-full min-h-0 w-full animate-pulse bg-card" aria-label="Loading messages" />}>
      <MessagesView />
    </Suspense>
  )
}
