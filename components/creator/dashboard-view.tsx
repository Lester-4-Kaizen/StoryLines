'use client'

import Link from 'next/link'
import { BookOpen, PenLine, RefreshCw, Sparkles } from 'lucide-react'
import { CreatorFrame } from '@/components/shared/creator-frame'
import { EmptyState } from '@/components/shared/empty-state'
import { Panel } from '@/components/shared/panel'
import { useWorks } from '@/lib/works-store'
import type { Route } from '@/lib/types'

export function DashboardView({ go }: { go: (route: Route) => void }) {
  const { works, hydrated, loadError, refreshWorks } = useWorks()
  const published = works.filter((work) => work.status !== 'Draft').length
  const drafts = works.filter((work) => work.status === 'Draft').length
  const recent = works.slice(0, 5)

  return (
    <CreatorFrame eyebrow="Creator studio" title="Tahanan ng mga likha mo." go={go}>
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ['Mga nailathalang gawa', String(published)],
          ['Mga draft', String(drafts)],
          ['Lahat ng gawa', String(works.length)],
        ].map(([label, value]) => (
          <Panel key={label}>
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</span>
            <p className="mt-3 font-serif text-4xl font-bold">{hydrated ? value : '—'}</p>
            <p className="mt-1 text-xs text-muted-foreground">{label === 'Mga draft' ? 'Mga hindi pa nailalathala' : label === 'Lahat ng gawa' ? 'Stories, comics, at artwork' : 'Naka-save sa iyong account'}</p>
          </Panel>
        ))}
      </div>
      {loadError && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive"><p>{loadError}</p><button type="button" onClick={() => void refreshWorks()} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 font-bold hover:bg-destructive/10"><RefreshCw className="size-4" /> Try again</button></div>}
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-serif text-2xl font-bold">Pick up where you left off</h2>
            <p className="mt-1 text-sm text-muted-foreground">Recent work and drafts from your creator studio.</p>
          </div>
          <Sparkles className="size-5 text-accent" aria-hidden="true" />
        </div>
        {!hydrated ? (
          <div className="mt-5 flex flex-col gap-3" aria-label="Loading your works">
            {[0, 1, 2].map((item) => <div key={item} className="h-16 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />)}
          </div>
        ) : loadError ? (
          <p className="mt-5 text-sm text-muted-foreground">Hindi muna maipakita ang recent works. Subukan ulit mamaya.</p>
        ) : recent.length === 0 ? (
          <EmptyState icon={<BookOpen />} title="Wala ka pang gawa rito" message="Pumili ng Story, Comic, o artwork para simulan ang una mong gawa." action="Create your first work" onAction={() => go('/create/works/new')} />
        ) : (
          <div className="mt-5 flex flex-col gap-2">
            {recent.map((work) => (
              <Link
                key={work.id}
                href={`/create/works/${work.id}`}
                className="flex min-h-14 items-center gap-3 rounded-lg border border-border p-3 text-sm hover:border-accent/60"
              >
                <span className="section-icon"><BookOpen className="size-4" /></span>
                <span className="min-w-0 flex-1 truncate font-bold">{work.title}</span>
                <span className="text-xs capitalize text-muted-foreground">{work.type}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{work.status}</span>
              </Link>
            ))}
            <Link href="/create/works" className="inline-flex min-h-11 items-center justify-center rounded-lg text-sm font-bold text-accent hover:underline">View all works</Link>
          </div>
        )}
      </Panel>
      <Panel className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-serif text-xl font-bold">Ready to start something new?</h2>
          <p className="mt-1 text-sm text-muted-foreground">Choose a format first. You can save it as a draft and finish it later.</p>
        </div>
        <Link href="/create/works/new" className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-accent px-5 text-sm font-bold text-accent-foreground">
          <PenLine className="size-4" /> New work
        </Link>
      </Panel>
    </CreatorFrame>
  )
}