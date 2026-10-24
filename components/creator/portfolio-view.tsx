'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Check, Copy, Eye, ImageOff, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CreatorFrame } from '@/components/shared/creator-frame'
import { EmptyState } from '@/components/shared/empty-state'
import { Panel } from '@/components/shared/panel'
import { WorkCover } from '@/components/creator/work-cover'
import { useAppState } from '@/lib/app-state'
import { loadMyWorkAnalytics, type WorkAnalyticsEntry } from '@/lib/work-engagement'
import { useWorks } from '@/lib/works-store'
import type { Badge, Route } from '@/lib/types'

export function PortfolioView({ badges: _badges, go }: { badges: Badge[]; go: (route: Route) => void }) {
  const { works, hydrated, loadError, refreshWorks } = useWorks()
  const { currentUserId } = useAppState()
  const [analytics, setAnalytics] = useState<WorkAnalyticsEntry[]>([])
  const [analyticsError, setAnalyticsError] = useState<string | null>(null)
  const [copyError, setCopyError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const publishedComics = works.filter((work) => work.status !== 'Draft' && work.type === 'comic')
  const analyticsById = useMemo(() => new Map(analytics.map((entry) => [entry.work_id, entry])), [analytics])
  const portfolioPath = currentUserId ? `/profile/${encodeURIComponent(currentUserId)}` : '/profile'

  useEffect(() => {
    let active = true
    void loadMyWorkAnalytics('All time')
      .then((results) => {
        if (active) setAnalytics(results)
      })
      .catch((error: unknown) => {
        if (!active) return
        const message = error instanceof Error ? error.message : 'Could not load portfolio statistics.'
        setAnalyticsError(message)
        console.error('Could not load portfolio statistics', error)
      })
    return () => {
      active = false
    }
  }, [])

  const copyPortfolioLink = async () => {
    setCopyError(null)
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${portfolioPath}`)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch (error) {
      console.error('Could not copy portfolio link', error)
      setCopyError('Could not copy the link. Check browser clipboard permissions and try again.')
    }
  }

  return (
    <CreatorFrame eyebrow="Artist studio / portfolio" title="Portfolio mo." go={go}>
      <Panel className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="min-w-0">
          <h2 className="font-serif text-xl font-bold">Your public portfolio</h2>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            Your public creator profile · This is what visitors and collaborators can see.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button type="button" variant="outline" onClick={() => void copyPortfolioLink()} className="min-h-10 rounded-full">
            {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
            {copied ? 'Copied' : 'Copy link'}
          </Button>
          <Link href={portfolioPath} className="inline-flex min-h-10 items-center rounded-full bg-accent px-4 text-xs font-bold text-accent-foreground hover:brightness-95">
            View as visitor <Eye className="ml-1.5 size-3.5" aria-hidden="true" />
          </Link>
        </div>
      </Panel>

      {loadError && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          <p role="alert">{loadError}</p>
          <button type="button" onClick={() => void refreshWorks()} className="min-h-10 rounded-full px-3 font-bold hover:bg-destructive/10">Try again</button>
        </div>
      )}
      {analyticsError && <p role="status" className="rounded-xl border border-border bg-secondary/50 p-3 text-xs text-muted-foreground">Portfolio statistics are unavailable: {analyticsError}</p>}
      {copyError && <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">{copyError}</p>}

      <section aria-labelledby="published-comics-title">
        <div className="mb-3">
          <h2 id="published-comics-title" className="font-serif text-2xl font-bold">Published comics</h2>
          <p className="mt-1 text-sm text-muted-foreground">Your published comic projects will appear here.</p>
        </div>
        {!hydrated ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-label="Loading portfolio">
            {[0, 1, 2, 3].map((item) => <div key={item} className="aspect-[.72] animate-pulse rounded-2xl bg-card motion-reduce:animate-none" />)}
          </div>
        ) : loadError && works.length === 0 ? (
          <Panel className="flex flex-col items-start gap-3">
            <p role="alert" className="text-sm text-destructive">{loadError}</p>
            <Button type="button" variant="outline" onClick={() => void refreshWorks()} className="min-h-10 rounded-full">Try again</Button>
          </Panel>
        ) : publishedComics.length === 0 ? (
          <EmptyState
            icon={<ImageOff />}
            title="No published comics yet"
            message="Published comic projects will show in your public portfolio. Comic creation is currently unavailable while image hosting is unsupported."
            action="View your works"
            onAction={() => go('/create/works')}
          />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {publishedComics.map((work) => {
              const stats = analyticsById.get(work.id)
              return (
                <article key={work.id} className="min-w-0">
                  <Link href={`/works/${work.id}`} className="block overflow-hidden rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                    <WorkCover src={work.coverImageUrl} title={work.title} className="aspect-[.72] w-full rounded-none transition-transform duration-300 hover:scale-[1.02]" />
                  </Link>
                  <Link href={`/works/${work.id}`} className="mt-2 block truncate text-sm font-bold hover:text-accent">{work.title}</Link>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {work.chapters?.length ?? 0} episodes · {stats?.view_count.toLocaleString() ?? '—'} views
                  </p>
                </article>
              )
            })}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-secondary/60 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-1 size-5 shrink-0 text-accent" aria-hidden="true" />
          <div>
            <span className="eyebrow">Coming soon</span>
            <h2 className="mt-1 font-serif text-xl font-bold">Standalone artwork</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              Illustrations, covers, and character designs will have their own gallery. Until then, published comics are featured here.
            </p>
          </div>
        </div>
        <span className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-full border border-border bg-card px-4 text-xs font-bold text-muted-foreground">
          Artwork publishing is not available yet
        </span>
      </section>
    </CreatorFrame>
  )
}
