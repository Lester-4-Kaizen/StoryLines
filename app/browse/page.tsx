import { Suspense } from 'react'
import { BrowseView } from '@/components/views/browse-view'
import { getBrowsePageData } from '@/lib/browse-data'

async function BrowsePageContent() {
  const initialData = await getBrowsePageData()
  return <BrowseView initialData={initialData} />
}

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-[24rem] animate-pulse rounded-2xl bg-card/60 motion-reduce:animate-none" aria-label="Naglo-load ng mga nailathalang gawa" />}>
      <BrowsePageContent />
    </Suspense>
  )
}
