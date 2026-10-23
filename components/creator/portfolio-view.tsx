'use client'

import Link from 'next/link'
import { Brush, ExternalLink, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CreatorFrame } from '@/components/shared/creator-frame'
import { EmptyState } from '@/components/shared/empty-state'
import { Panel } from '@/components/shared/panel'
import { useWorks } from '@/lib/works-store'
import type { Badge, Route } from '@/lib/types'

export function PortfolioView({ badges, go }: { badges: Badge[]; go: (route: Route) => void }) {
  const { works, hydrated, loadError, refreshWorks } = useWorks()
  const visualWorks = works.filter((work) => work.status !== 'Draft' && (work.type === 'comic' || work.type === 'art'))

  return (
    <CreatorFrame eyebrow="Artist studio / portfolio" title="Portfolio mo." go={go}>
      <Panel>
        <div className="flex items-start gap-4">
          <span className="section-icon"><Brush /></span>
          <div>
            <h2 className="font-serif text-2xl font-bold">Tahanan ng mga visual work mo</h2>
            <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
              Published comics at artwork mula sa iyong creator studio ang ipinapakita rito.
            </p>
          </div>
        </div>
      </Panel>
      {loadError && works.length > 0 && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{loadError}</p>}
      {!hydrated ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Loading portfolio">
          {[0, 1, 2].map((item) => <div key={item} className="h-64 animate-pulse rounded-xl bg-card motion-reduce:animate-none" />)}
        </div>
      ) : loadError && works.length === 0 ? (
        <Panel>
          <p role="alert" className="text-sm text-destructive">{loadError}</p>
          <Button type="button" variant="outline" onClick={() => void refreshWorks()} className="mt-4 min-h-11 rounded-xl">Try again</Button>
        </Panel>
      ) : visualWorks.length === 0 ? (
        <EmptyState
          icon={<Brush />}
          title="Wala pang laman ang portfolio mo"
          message={badges.includes('artist')
            ? 'Kapag may nailathala ka nang Comic o artwork, lalabas ito rito. Hindi pa available ang standalone artwork upload.'
            : 'I-enable ang Artist badge sa account settings para gumawa at mag-publish ng visual works.'}
          action={badges.includes('artist') ? 'Create a Comic' : 'Open account settings'}
          onAction={() => go(badges.includes('artist') ? '/create/works/new' : '/settings')}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visualWorks.map((work) => (
            <Panel key={work.id} className="flex min-h-48 flex-col">
              <span className="section-icon"><Brush /></span>
              <h3 className="mt-4 line-clamp-2 font-serif text-xl font-bold">{work.title}</h3>
              {work.synopsis && <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">{work.synopsis}</p>}
              <div className="mt-auto flex items-center justify-between gap-3 pt-5">
                <span className="text-xs text-muted-foreground">{work.type === 'comic' ? 'Comic' : 'Artwork'} · {work.status}</span>
                <Link href={`/create/works/${work.id}`} aria-label={`Edit ${work.title}`} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-bold text-accent hover:bg-secondary">
                  Edit <ExternalLink className="size-4" />
                </Link>
              </div>
            </Panel>
          ))}
        </div>
      )}
      <Panel className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-1 size-5 shrink-0 text-accent" />
          <div>
            <h2 className="font-serif text-xl font-bold">Add to your portfolio</h2>
            <p className="mt-1 text-sm text-muted-foreground">Published Comics appear here. Standalone artwork publishing is not available yet.</p>
          </div>
        </div>
        <Button onClick={() => go('/create/works/new')} className="min-h-11 rounded-full bg-accent text-accent-foreground">Create work</Button>
      </Panel>
    </CreatorFrame>
  )
}
