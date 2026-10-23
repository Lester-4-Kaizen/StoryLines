'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { BookOpen, Brush, ChevronRight, PenLine, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CreatorFrame } from '@/components/shared/creator-frame'
import { EmptyState } from '@/components/shared/empty-state'
import { Panel } from '@/components/shared/panel'
import { useWorks } from '@/lib/works-store'
import type { Route } from '@/lib/types'

const STATUS_STYLE: Record<string, string> = {
  Draft: 'bg-muted text-muted-foreground',
  Ongoing: 'bg-accent/15 text-accent',
  Complete: 'bg-primary/10 text-primary',
}

export function WorksView({ go }: { go: (route: Route) => void }) {
  const { works, hydrated, loadError, refreshWorks } = useWorks()
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'All' | 'Draft' | 'Published'>('All')
  const [typeFilter, setTypeFilter] = useState<'All' | 'story' | 'comic' | 'art'>('All')
  const visibleWorks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return works.filter((work) =>
      (statusFilter === 'All' || (statusFilter === 'Draft' ? work.status === 'Draft' : work.status !== 'Draft'))
      && (typeFilter === 'All' || work.type === typeFilter)
      && (!normalizedQuery || `${work.title} ${work.synopsis ?? ''} ${work.genre ?? ''}`.toLowerCase().includes(normalizedQuery)),
    )
  }, [query, statusFilter, typeFilter, works])

  return (
    <CreatorFrame eyebrow="Creator studio / mga gawa" title="Mga gawa mo." go={go} backHref="/create">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">Stories, comics, at artwork mo—draft man o nailathala.</p>
        <Button onClick={() => go('/create/works/new')} className="rounded-lg bg-accent text-accent-foreground">
          <PenLine data-icon="inline-start" /> Bagong gawa
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {(['All', 'Draft', 'Published'] as const).map((status) => (
          <button key={status} type="button" aria-pressed={statusFilter === status} onClick={() => setStatusFilter(status)} className={`min-h-11 rounded-xl border px-4 text-left text-sm font-bold ${statusFilter === status ? 'border-accent bg-secondary' : 'border-border bg-card'}`}>
            {status === 'All' ? `All works · ${works.length}` : status === 'Draft' ? `Drafts · ${works.filter((work) => work.status === 'Draft').length}` : `Published · ${works.filter((work) => work.status !== 'Draft').length}`}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
        <label className="flex min-h-11 items-center gap-2 rounded-xl border border-input bg-card px-3 focus-within:border-accent">
          <Search className="size-4 text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">Search your works</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, genre, or blurb…" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
        </label>
        <label className="flex min-h-11 items-center gap-2 rounded-xl border border-input bg-card px-3 text-sm font-semibold">
          Format
          <select aria-label="Filter by format" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as typeof typeFilter)} className="bg-transparent text-sm">
            <option value="All">All formats</option><option value="story">Stories</option><option value="comic">Comics</option><option value="art">Artwork</option>
          </select>
        </label>
        <Button type="button" variant="outline" onClick={() => void refreshWorks()} disabled={!hydrated} className="min-h-11 rounded-xl">Refresh</Button>
      </div>

      {loadError && works.length > 0 && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{loadError}</p>}
      {!hydrated ? (
        <div className="flex flex-col gap-3" aria-label="Loading your works">{[0, 1, 2].map((item) => <div key={item} className="h-20 animate-pulse rounded-xl bg-card motion-reduce:animate-none" />)}</div>
      ) : loadError && works.length === 0 ? (
        <Panel className="flex flex-col items-start gap-3">
          <h2 className="font-serif text-xl font-bold">Hindi ma-load ang works mo</h2>
          <p role="alert" className="text-sm text-muted-foreground">{loadError}</p>
          <Button type="button" variant="outline" onClick={() => void refreshWorks()} className="min-h-11 rounded-xl">Try again</Button>
        </Panel>
      ) : works.length === 0 ? (
        <EmptyState
          icon={<BookOpen />}
          title="Wala ka pang gawa rito"
          message="Gumawa ng unang Story o Comic mo; dito ito lalabas sa private workspace mo."
          action="Gumawa ng unang obra"
          onAction={() => go('/create/works/new')}
        />
      ) : visibleWorks.length === 0 ? (
        <EmptyState icon={<Search />} title="Walang tugmang gawa" message="Baguhin ang search o filters para makita ang iba mong gawa." />
      ) : (
        <div className="flex flex-col gap-3">
          {visibleWorks.map((work) => (
            <Link key={work.id} href={`/create/works/${work.id}`} className="block">
              <Panel className="flex items-center gap-4 transition hover:border-accent/60">
                <span className="section-icon">{work.type === 'story' ? <BookOpen /> : <Brush />}</span>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-serif text-lg font-bold">{work.title}</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {work.type === 'story' ? 'Story' : work.type === 'comic' ? 'Comic' : 'Artwork'}
                    {work.genre ? ` · ${work.genre}` : ''}
                  </p>
                </div>
                <span className={`badge shrink-0 ${STATUS_STYLE[work.status] ?? STATUS_STYLE.Draft}`}>{work.status}</span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Panel>
            </Link>
          ))}
        </div>
      )}
    </CreatorFrame>
  )
}