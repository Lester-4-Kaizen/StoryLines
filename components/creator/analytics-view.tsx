'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { BookOpen, Brush, Eye, FileText, Heart, LoaderCircle, Sparkles } from 'lucide-react'
import { CreatorFrame } from '@/components/shared/creator-frame'
import { EmptyState } from '@/components/shared/empty-state'
import { Panel } from '@/components/shared/panel'
import { useWorks } from '@/lib/works-store'
import { loadMyWorkAnalytics, type RankingPeriod, type WorkAnalyticsEntry } from '@/lib/work-engagement'
import type { Route } from '@/lib/types'

const PERIODS: RankingPeriod[] = ['Today', 'This week', 'This month', 'All time']

export function AnalyticsView({ go }: { go: (route: Route) => void }) {
  const { works, hydrated, loadError, refreshWorks } = useWorks()
  const [period, setPeriod] = useState<RankingPeriod>('This month')
  const [analytics, setAnalytics] = useState<WorkAnalyticsEntry[]>([])
  const [analyticsLoading, setAnalyticsLoading] = useState(true)
  const [analyticsError, setAnalyticsError] = useState<string | null>(null)
  const [reloadVersion, setReloadVersion] = useState(0)
  const published = works.filter((work) => work.status !== 'Draft')
  const drafts = works.filter((work) => work.status === 'Draft')
  const stories = works.filter((work) => work.type === 'story').length
  const visual = works.filter((work) => work.type === 'comic' || work.type === 'art').length
  const totalViews = analytics.reduce((total, work) => total + work.view_count, 0)
  const totalLikes = analytics.reduce((total, work) => total + work.like_count, 0)

  useEffect(() => {
    let active = true
    setAnalyticsLoading(true)
    setAnalyticsError(null)
    void loadMyWorkAnalytics(period)
      .then((results) => {
        if (active) setAnalytics(results)
      })
      .catch((error: unknown) => {
        if (active) setAnalyticsError(error instanceof Error ? error.message : 'Could not load work analytics.')
      })
      .finally(() => {
        if (active) setAnalyticsLoading(false)
      })
    return () => {
      active = false
    }
  }, [period, reloadVersion])

  return (
    <CreatorFrame eyebrow="Creator studio / analytics" title="See how the work travels." go={go}>
      {loadError && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{loadError}</p>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'All works', value: works.length, icon: <BookOpen /> },
          { label: 'Published', value: published.length, icon: <FileText /> },
          { label: 'Drafts', value: drafts.length, icon: <FileText /> },
          { label: 'Visual works', value: visual, icon: <Brush /> },
        ].map((metric) => (
          <Panel key={metric.label}>
            <span className="section-icon">{metric.icon}</span>
            <span className="mt-4 block text-xs font-bold uppercase tracking-widest text-muted-foreground">{metric.label}</span>
            <p className="mt-2 font-serif text-4xl font-bold">{hydrated ? metric.value : '—'}</p>
          </Panel>
        ))}
      </div>

      <Panel>
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h2 className="font-serif text-2xl font-bold">Reading activity</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Views count once per signed-in reader per work each UTC day. Ranking points are 1 per view and 5 per like. Only published stories and comics are included.
            </p>
          </div>
          <div className="flex w-fit max-w-full items-center gap-1 overflow-x-auto rounded-full border border-border bg-card p-1" aria-label="Analytics period">
            {PERIODS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setPeriod(item)}
                aria-pressed={period === item}
                className={`min-h-10 shrink-0 rounded-full px-3 text-xs font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                  period === item ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border p-4">
            <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground"><Eye className="size-4" /> Views · {period}</span>
            <p className="mt-2 font-serif text-3xl font-bold">{analyticsLoading ? '—' : totalViews.toLocaleString()}</p>
          </div>
          <div className="rounded-xl border border-border p-4">
            <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground"><Heart className="size-4" /> Likes · {period}</span>
            <p className="mt-2 font-serif text-3xl font-bold">{analyticsLoading ? '—' : totalLikes.toLocaleString()}</p>
          </div>
        </div>

        {analyticsLoading ? (
          <p role="status" className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> Loading engagement…
          </p>
        ) : analyticsError ? (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
            <p role="alert" className="text-sm text-destructive">{analyticsError}</p>
            <button type="button" onClick={() => setReloadVersion((version) => version + 1)} className="min-h-11 rounded-lg px-4 text-sm font-bold text-accent hover:bg-secondary">Try again</button>
          </div>
        ) : analytics.length ? (
          <div className="mt-5 overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[34rem] text-left text-sm">
              <thead className="bg-secondary/60 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3">Published work</th>
                  <th scope="col" className="px-4 py-3 text-right">Views</th>
                  <th scope="col" className="px-4 py-3 text-right">Likes</th>
                  <th scope="col" className="px-4 py-3 text-right">Points</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {analytics.map((work) => (
                  <tr key={work.work_id}>
                    <th scope="row" className="px-4 py-3 font-medium">
                      <Link href={`/works/${encodeURIComponent(work.work_id)}`} className="font-bold hover:text-accent hover:underline">
                        {work.title}
                      </Link>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{work.work_type === 'story' ? 'Story' : 'Comic'}</span>
                    </th>
                    <td className="px-4 py-3 text-right">{work.view_count.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">{work.like_count.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-bold">{work.score.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-5">
            <EmptyState
              icon={<Sparkles />}
              title="No published stories or comics yet"
              message="Publish a Story or Comic to start seeing its views, likes, and ranking points here."
              action="Create a work"
              onAction={() => go('/create/works/new')}
            />
          </div>
        )}
        {!analyticsError && loadError && (
          <div className="mt-4 flex justify-end">
            <button type="button" onClick={() => void refreshWorks()} className="min-h-11 rounded-lg px-4 text-sm font-bold text-accent hover:bg-secondary">Retry work counts</button>
          </div>
        )}
      </Panel>
    </CreatorFrame>
  )
}
