import { Suspense } from 'react'
import { BrowseView } from '@/components/views/browse-view'

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-[24rem]" aria-hidden="true" />}>
      <BrowseView />
    </Suspense>
  )
}
