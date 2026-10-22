'use client'

import { useState } from 'react'
import { BookOpen, Brush } from 'lucide-react'
import { EmptyState } from '@/components/shared/empty-state'

export function BrowseView() {
  const [tab, setTab] = useState<'Stories' | 'Comics'>('Stories')
  return (
    <div className="flex flex-col gap-8">
      <div>
        <span className="eyebrow">Open shelves</span>
        <h1 className="mt-3 font-serif text-5xl font-bold">Browse {tab.toLowerCase()}.</h1>
        <p className="mt-3 text-sm text-muted-foreground">Find something by mood, genre, or the kind of world you want to enter.</p>
      </div>
      <div className="flex gap-2 border-b border-border">
        <button
          onClick={() => setTab('Stories')}
          className={`border-b-2 px-4 py-3 text-sm font-bold ${tab === 'Stories' ? 'border-accent text-accent' : 'border-transparent text-muted-foreground'}`}
        >
          Stories
        </button>
        <button
          onClick={() => setTab('Comics')}
          className={`border-b-2 px-4 py-3 text-sm font-bold ${tab === 'Comics' ? 'border-accent text-accent' : 'border-transparent text-muted-foreground'}`}
        >
          Comics
        </button>
      </div>
      <EmptyState
        icon={tab === 'Stories' ? <BookOpen /> : <Brush />}
        title={`No ${tab.toLowerCase()} yet`}
        message="The catalog will show its first works here when writers and artists publish them."
      />
    </div>
  )
}
