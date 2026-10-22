'use client'

import { useState } from 'react'
import { BookMarked, BookOpen } from 'lucide-react'
import { EmptyState } from '@/components/shared/empty-state'

export function LibraryView() {
  const [tab, setTab] = useState('Saved')
  return (
    <div className="flex flex-col gap-8">
      <div>
        <span className="eyebrow">Sarili mong estante</span>
        <h1 className="mt-3 font-serif text-5xl font-bold">Library.</h1>
        <p className="mt-3 text-sm text-muted-foreground">Nandito ang mga sinave mong gawa at mga huli mong binasa.</p>
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
        title={tab === 'Saved' ? 'Wala pang naka-save sa estante mo' : 'Wala pang laman ang reading history mo'}
        message={tab === 'Saved' ? 'I-tap ang bookmark sa isang gawa para itago rito.' : 'Dito mo makikita ang history ng mga binasa mo.'}
      />
    </div>
  )
}
