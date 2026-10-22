'use client'

import { useState } from 'react'
import { BookMarked, Inbox, Search, Sparkles, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/shared/empty-state'
import { Panel } from '@/components/shared/panel'
import type { Badge, Route } from '@/lib/types'

export function CollaborateView({
  creator,
  role,
  go,
  onUpgrade,
  initialTab = 'find',
}: {
  creator: boolean
  role: Badge
  go: (route: Route) => void
  onUpgrade: () => void
  initialTab?: 'find' | 'active' | 'pending' | 'past'
}) {
  const [tab, setTab] = useState<'find' | 'active' | 'pending' | 'past'>(initialTab)
  const [kind, setKind] = useState<'artist' | 'writer'>('artist')
  const [query, setQuery] = useState('')
  const canFind = creator

  return (
    <div className="flex flex-col gap-8">
      <div>
        <span className="eyebrow">Find your people</span>
        <h1 className="mt-3 font-serif text-5xl font-bold text-balance">Make something together.</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
          Find a thoughtful creative partner for the story or images you have been carrying.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-border">
        <button
          onClick={() => setTab('find')}
          className={`rounded-t-lg px-4 py-3 text-sm font-bold ${tab === 'find' ? 'border-b-2 border-accent text-accent' : 'text-muted-foreground'}`}
        >
          Find collaborators
        </button>
        {['active', 'pending', 'past'].map((item) => (
          <button
            key={item}
            onClick={() => setTab(item as typeof tab)}
            className={`rounded-t-lg px-4 py-3 text-sm font-bold capitalize ${tab === item ? 'border-b-2 border-accent text-accent' : 'text-muted-foreground'}`}
          >
            {item}
          </button>
        ))}
      </div>

      {!canFind ? (
        <Panel className="flex flex-col items-center p-8 text-center">
          <Users className="size-10 text-accent" />
          <h2 className="mt-4 font-serif text-2xl font-bold">Creator access opens collaboration.</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            Add a Writer or Artist badge to find partners, send requests, and open a shared workspace.
          </p>
          <Button onClick={onUpgrade} className="mt-6 rounded-lg bg-accent text-accent-foreground">
            Unlock creator tools
          </Button>
        </Panel>
      ) : tab === 'find' ? (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setKind('artist')}
              className={`rounded-full px-4 py-2 text-xs font-bold ${kind === 'artist' ? 'bg-primary text-primary-foreground' : 'border border-border bg-card'}`}
            >
              Find an artist
            </button>
            <button
              onClick={() => setKind('writer')}
              className={`rounded-full px-4 py-2 text-xs font-bold ${kind === 'writer' ? 'bg-primary text-primary-foreground' : 'border border-border bg-card'}`}
            >
              Find a writer
            </button>
          </div>
          <label className="flex items-center gap-3 rounded-xl border border-input bg-card px-4 py-3">
            <Search className="size-5 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${kind}s by name or style...`}
              className="w-full bg-transparent text-sm outline-none"
            />
          </label>
          <EmptyState
            icon={<Users />}
            title={`No ${kind}s found`}
            message={query ? `There are no matching ${kind}s yet.` : `The ${kind} directory is waiting for its first profiles.`}
          />
        </div>
      ) : (
        <EmptyState
          icon={tab === 'active' ? <Sparkles /> : tab === 'pending' ? <Inbox /> : <BookMarked />}
          title={`No ${tab} collaborations`}
          message="Your private collaboration history will appear here when you begin working with someone."
          action={tab === 'active' ? 'Find a collaborator' : undefined}
          onAction={() => setTab('find')}
        />
      )}
    </div>
  )
}