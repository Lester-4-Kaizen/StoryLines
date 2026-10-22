'use client'

import { useState } from 'react'
import { BookMarked, BookOpen } from 'lucide-react'
import { EmptyState } from '@/components/shared/empty-state'

export function LibraryView() {
  const [tab, setTab] = useState('Saved')
  return (
    <div className="flex flex-col gap-8">
      <div>
        <span className="eyebrow">Your private shelf</span>
        <h1 className="mt-3 font-serif text-5xl font-bold">Library.</h1>
        <p className="mt-3 text-sm text-muted-foreground">Keep your saved works and reading history close.</p>
      </div>
      <div className="flex gap-2 border-b border-border">
        <button
          onClick={() => setTab('Saved')}
          className={`border-b-2 px-4 py-3 text-sm font-bold ${tab === 'Saved' ? 'border-accent text-accent' : 'border-transparent text-muted-foreground'}`}
        >
          Saved
        </button>
        <button
          onClick={() => setTab('History')}
          className={`border-b-2 px-4 py-3 text-sm font-bold ${tab === 'History' ? 'border-accent text-accent' : 'border-transparent text-muted-foreground'}`}
        >
          History
        </button>
      </div>
      <EmptyState
        icon={tab === 'Saved' ? <BookMarked /> : <BookOpen />}
        title={tab === 'Saved' ? 'Your saved shelf is empty' : 'Your history is private and empty'}
        message={tab === 'Saved' ? 'Tap the bookmark on a work to keep it here.' : 'Reading history will appear here only for you.'}
      />
    </div>
  )
}
