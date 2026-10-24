'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { BookOpen, Eye, Grid2X2, Heart, List, PenLine, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CreatorFrame } from '@/components/shared/creator-frame'
import { EmptyState } from '@/components/shared/empty-state'
import { Panel } from '@/components/shared/panel'
import { WorkCover } from '@/components/creator/work-cover'
import { loadMyWorkAnalytics, type WorkAnalyticsEntry } from '@/lib/work-engagement'
import { useWorks } from '@/lib/works-store'
import type { Route, Work } from '@/lib/types'

type WorkFilter = 'All' | 'Draft' | 'Published' | 'Complete'
type WorkLayout = 'list' | 'grid'

const STATUS_STYLE: Record<Work['status'], string> = {
  Draft: 'bg-muted text-muted-foreground',
  Ongoing: 'bg-accent/15 text-accent',
  Complete: 'bg-primary/10 text-primary',
}

function workTypeLabel(type: Work['type']) {
  return type === 'story' ? 'Story' : type === 'comic' ? 'Comic' : 'Artwork'
}

function filteredByStatus(work: Work, filter: WorkFilter) {
  if (filter === 'Draft') return work.status === 'Draft'
  if (filter === 'Published') return work.status !== 'Draft'
  if (filter === 'Complete') return work.status === 'Complete'
  return true
}

export function WorksView({ go }: { go: (route: Route) => void }) {
  const { works, hydrated, loadError, refreshWorks } = useWorks()
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<WorkFilter>('All')
  const [typeFilter, setTypeFilter] = useState<'All' | Work['type']>('All')
  const [sort, setSort] = useState<'edited' | 'title' | 'created'>('edited')
  const [layout, setLayout] = useState<WorkLayout>('list')
  const [analytics, setAnalytics] = useState<WorkAnalyticsEntry[]>([])
  const [analyticsError, setAnalyticsError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void loadMyWorkAnalytics('All time')
      .then((results) => {
        if (active) setAnalytics(results)
      })
      .catch((error: unknown) => {
        if (!active) return
        const message = error instanceof Error ? error.message : 'Could not load work statistics.'
        setAnalyticsError(message)
        console.error('Could not load work statistics in My works', error)
      })
    return () => {
      active = false
    }
  }, [])

  const analyticsById = useMemo(() => new Map(analytics.map((item) => [item.work_id, item])), [analytics])
  const statusCounts: Record<WorkFilter, number> = {
    All: works.length,
    Draft: works.filter((work) => work.status === 'Draft').length,
    Published: works.filter((work) => work.status !== 'Draft').length,
    Complete: works.filter((work) => work.status === 'Complete').length,
  }
  const visibleWorks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const filtered = works.filter((work) =>
      filteredByStatus(work, statusFilter)
      && (typeFilter === 'All' || work.type === typeFilter)
      && (!normalizedQuery || `${work.title} ${work.synopsis ?? ''} ${work.genre ?? ''}`.toLowerCase().includes(normalizedQuery)),
    )
    if (sort === 'title') return filtered.slice().sort((first, second) => first.title.localeCompare(second.title))
    if (sort === 'created') return filtered.slice().sort((first, second) => second.createdAt - first.createdAt)
    return filtered
  }, [query, sort, statusFilter, typeFilter, works])

  return (
    <CreatorFrame eyebrow="Creator studio / mga gawa" title="Mga gawa mo." go={go}>
      <nav aria-label="Filter works by status" className="flex gap-2 overflow-x-auto pb-1">
        {(['All', 'Draft', 'Published', 'Complete'] as const).map((filter) => (
          <button
            key={filter}
            type="button"
            aria-pressed={statusFilter === filter}
            onClick={() => setStatusFilter(filter)}
            className={`min-h-10 shrink-0 rounded-full border px-4 text-xs font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              statusFilter === filter ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground hover:bg-secondary'
            }`}
          >
            {filter === 'All' ? 'All works' : filter === 'Draft' ? 'Drafts' : filter === 'Complete' ? 'Complete' : 'Published'}
            {' · '}{hydrated ? statusCounts[filter].toLocaleString() : '—'}
          </button>
        ))}
      </nav>

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
        <label className="flex min-h-11 items-center gap-2 rounded-full border border-input bg-card px-4 focus-within:border-accent">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">Search your works</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, genre, or blurb…" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
        </label>
        <label className="flex min-h-11 items-center gap-2 rounded-full border border-input bg-card px-4 text-xs font-bold">
          Format
          <select aria-label="Filter by format" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as typeof typeFilter)} className="max-w-28 bg-transparent text-xs">
            <option value="All">All</option><option value="story">Story</option><option value="comic">Comic</option><option value="art">Artwork</option>
          </select>
        </label>
        <label className="flex min-h-11 items-center gap-2 rounded-full border border-input bg-card px-4 text-xs font-bold">
          Sort
          <select aria-label="Sort works" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} className="max-w-40 bg-transparent text-xs">
            <option value="edited">Recently edited</option><option value="created">Recently created</option><option value="title">Title A–Z</option>
          </select>
        </label>
        <div className="flex items-center justify-end gap-1 rounded-full border border-border bg-card p-1" aria-label="Work layout">
          <button type="button" aria-label="List view" aria-pressed={layout === 'list'} onClick={() => setLayout('list')} className={`flex size-9 items-center justify-center rounded-full ${layout === 'list' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary'}`}>
            <List className="size-4" aria-hidden="true" />
          </button>
          <button type="button" aria-label="Grid view" aria-pressed={layout === 'grid'} onClick={() => setLayout('grid')} className={`flex size-9 items-center justify-center rounded-full ${layout === 'grid' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary'}`}>
            <Grid2X2 className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {loadError && works.length > 0 && (
        <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{loadError}</p>
      )}
      {analyticsError && (
        <p role="status" className="rounded-xl border border-border bg-secondary/50 p-3 text-xs text-muted-foreground">
          Views and likes are temporarily unavailable. {analyticsError}
        </p>
      )}

      {!hydrated ? (
        <div className="flex flex-col gap-3" aria-label="Loading your works">{[0, 1, 2].map((item) => <div key={item} className="h-24 animate-pulse rounded-2xl bg-card motion-reduce:animate-none" />)}</div>
      ) : loadError && works.length === 0 ? (
        <Panel className="flex flex-col items-start gap-3">
          <h2 className="font-serif text-xl font-bold">Hindi ma-load ang works mo</h2>
          <p role="alert" className="text-sm text-muted-foreground">{loadError}</p>
          <Button type="button" variant="outline" onClick={() => void refreshWorks()} className="min-h-11 rounded-full">Try again</Button>
        </Panel>
      ) : works.length === 0 ? (
        <EmptyState icon={<BookOpen />} title="Your studio is ready" message="Create your first Story project and manage drafts or published works here." action="Create a work" onAction={() => go('/create/works/new')} />
      ) : visibleWorks.length === 0 ? (
        <EmptyState icon={<Search />} title="No matching works" message="Change the search or filters to find your other projects." />
      ) : layout === 'list' ? (
        <div className="flex flex-col gap-2.5">
          {visibleWorks.map((work) => {
            const stats = analyticsById.get(work.id)
            return (
              <article key={work.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-3 transition-colors hover:border-accent/50 sm:gap-4 sm:p-4">
                <WorkCover src={work.coverImageUrl} title={work.title} className="h-[4.5rem] w-12 sm:h-[4.75rem] sm:w-[3.5rem]" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-bold">{workTypeLabel(work.type)}</span>
                    {work.genre && <span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-bold">{work.genre}</span>}
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${STATUS_STYLE[work.status]}`}>{work.status}</span>
                  </div>
                  <Link href={`/create/works/${work.id}`} className="mt-1.5 block truncate text-sm font-bold hover:text-accent">{work.title}</Link>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{work.chapters?.length ?? 0} {work.type === 'comic' ? 'pages / episodes' : 'chapters'} · created {new Date(work.createdAt).toLocaleDateString()}</p>
                </div>
                <div className="flex shrink-0 gap-3 sm:gap-5">
                  <div className="min-w-10 text-center">
                    <span className="block text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Views</span>
                    <span className="text-xs font-bold">{stats?.view_count.toLocaleString() ?? '—'}</span>
                  </div>
                  <div className="min-w-10 text-center">
                    <span className="block text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Likes</span>
                    <span className="text-xs font-bold">{stats?.like_count.toLocaleString() ?? '—'}</span>
                  </div>
                </div>
                <div className="ml-auto flex shrink-0 items-center gap-1.5">
                  <Link href={`/create/works/${work.id}`} className="inline-flex min-h-9 items-center rounded-full bg-accent px-3.5 text-xs font-bold text-accent-foreground hover:brightness-95">Edit</Link>
                  {work.status !== 'Draft' && (
                    <Link href={`/works/${work.id}`} className="inline-flex min-h-9 items-center rounded-full border border-border px-3.5 text-xs font-bold hover:border-accent">View</Link>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visibleWorks.map((work) => {
            const stats = analyticsById.get(work.id)
            return (
              <Panel key={work.id} className="flex flex-col p-3">
                <WorkCover src={work.coverImageUrl} title={work.title} className="h-44 w-full" />
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-bold">{workTypeLabel(work.type)}</span>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${STATUS_STYLE[work.status]}`}>{work.status}</span>
                </div>
                <h2 className="mt-2 truncate font-serif text-lg font-bold">{work.title}</h2>
                <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><Eye className="size-3.5" />{stats?.view_count.toLocaleString() ?? '—'}</span>
                  <span className="inline-flex items-center gap-1"><Heart className="size-3.5" />{stats?.like_count.toLocaleString() ?? '—'}</span>
                </div>
                <Link href={`/create/works/${work.id}`} className="mt-3 inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full bg-accent text-xs font-bold text-accent-foreground">
                  <PenLine className="size-3.5" /> Edit work
                </Link>
                {work.status !== 'Draft' && <Link href={`/works/${work.id}`} className="mt-1 inline-flex min-h-9 items-center justify-center text-xs font-bold text-accent hover:underline">View published work</Link>}
              </Panel>
            )
          })}
        </div>
      )}
    </CreatorFrame>
  )
}
