import { Suspense } from 'react'
import { MessagesView } from '@/components/views/messages-view'

export default function Page() {
  return (
    <Suspense fallback={<div className="mx-auto h-[60vh] w-full max-w-6xl animate-pulse rounded-2xl bg-secondary/50" aria-label="Loading messages" />}>
      <MessagesView />
    </Suspense>
  )
}
