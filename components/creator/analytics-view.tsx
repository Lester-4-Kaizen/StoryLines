'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { BookOpen, Eye, FileText, Heart, LoaderCircle, Sparkles, Trophy } from 'lucide-react'
import { CreatorFrame } from '@/components/shared/creator-frame'
import { EmptyState } from '@/components/shared/empty-state'
import { Panel } from '@/components/shared/panel'
import { WorkCover } from '@/components/creator/work-cover'
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
  const totalViews = analytics.reduce((total, work) => total + work.view_count, 0)
  const totalLikes = analytics.reduce((total, work) => total + work.like_count, 0)
  const totalPoints = analytics.reduce((total, work) => total + work.score, 0)
  const maxViews = useMemo(
    () => analytics.reduce((maximum, work) => Math.max(maximum, work.view_count), 0),
    [analytics],
  )
  const chartWidth = Math.max(600, analytics.length * 100 + 56)

  useEffect(() => {
    let active = true
    setAnalyticsLoading(true)
    setAnalyticsError(null)
    void loadMyWorkAnalytics(period)
      .then((results) => {
        if (active) setAnalytics(results)
      })
      .catch((error: unknown) => {
        if (!active) return
        const message = error instanceof Error ? error.message : 'Could not load work analytics.'
        setAnalyticsError(message)
        console.error('Could not load creator work analytics', error)
      })
      .finally(() => {
        if (active) setAnalyticsLoading(false)
      })
    return () => {
      active = false
    }
  }, [period, reloadVersion])

  const metrics = [
    { label: 'Published works', value: published.length, icon: <BookOpen aria-hidden="true" />, ready: hydrated },
    { label: 'Drafts', value: drafts.length, icon: <FileText aria-hidden="true" />, ready: hydrated },
    { label: `Reads · ${period}`, value: totalViews, icon: <Eye aria-hidden="true" />, ready: !analyticsLoading && !analyticsError },
    { label: `Ranking points · ${period}`, value: totalPoints, icon: <Trophy aria-hidden="true" />, ready: !analyticsLoading && !analyticsError },
  ]

  return (
    <CreatorFrame eyebrow="Creator studio / analytics" title="Your stories, in motion." go={go}>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="max-w-xl text-sm leading-6 text-muted-foreground">
            A clear look at your published work and the readers finding it.
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

      {loadError && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          <p role="alert">{loadError}</p>
          <button type="button" onClick={() => void refreshWorks()} className="min-h-10 rounded-full px-3 font-bold hover:bg-destructive/10">Retry works</button>
        </div>
      )}

      <section aria-label="Creator analytics overview" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <Panel key={metric.label} className="p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{metric.label}</span>
              <span className="text-accent">{metric.icon}</span>
            </div>
            <p className="mt-3 font-serif text-4xl font-bold">
              {metric.ready ? metric.value.toLocaleString() : '—'}
            </p>
          </Panel>
        ))}
      </section>

      <Panel className="p-4 sm:p-5">
        <div className="flex flex-col justify-between gap-2 border-b border-border pb-4 sm:flex-row sm:items-end">
          <div>
            <h2 className="font-serif text-2xl font-bold">Work performance</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Reads per published story or comic · {period.toLowerCase()}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">Ranking points count 1 per read and 5 per like.</p>
        </div>

        {analyticsLoading ? (
          <p role="status" className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> Loading performance…
          </p>
        ) : analyticsError ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-destructive/40 bg-destructive/5 p-4">
            <p role="alert" className="text-sm text-destructive">Could not load reading analytics: {analyticsError}</p>
            <button type="button" onClick={() => setReloadVersion((version) => version + 1)} className="min-h-10 rounded-full px-4 text-sm font-bold text-accent hover:bg-secondary">Try again</button>
          </div>
        ) : analytics.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              icon={<Sparkles />}
              title="No published stories or comics yet"
              message="Publish a story or comic to see its reads, likes, and ranking points here."
              action="Create a work"
              onAction={() => go('/create/works/new')}
            />
          </div>
        ) : (
          <>
            <div className="mt-5 overflow-x-auto rounded-2xl border border-border bg-secondary/30 p-3 sm:p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold">Reads by work</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">Compare published stories and comics · {period.toLowerCase()}</p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="size-2.5 rounded-sm bg-accent" aria-hidden="true" />
                  Reads
                </span>
              </div>
              <svg
                role="img"
                aria-label={`Bar chart of reads by published work for ${period.toLowerCase()}`}
                viewBox={`0 0 ${chartWidth} 260`}
                className="block h-[260px] min-w-[600px]"
                style={{ width: `${chartWidth}px` }}
              >
                {(() => {
                  const plotLeft = 48
                  const plotRight = chartWidth - 16
                  const plotTop = 16
                  const plotBottom = 202
                  const plotHeight = plotBottom - plotTop
                  const chartMax = maxViews || 1
                  const interval = (plotRight - plotLeft) / analytics.length
                  const barWidth = Math.min(48, interval * 0.58)
                  const ticks = [chartMax, Math.round(chartMax / 2), 0]

                  return (
                    <>
                      {ticks.map((tick, index) => {
                        const y = plotTop + (plotHeight * index) / (ticks.length - 1)
                        return (
                          <g key={`${tick}-${index}`}>
                            <line x1={plotLeft} y1={y} x2={plotRight} y2={y} stroke="currentColor" strokeOpacity="0.12" strokeDasharray={index === ticks.length - 1 ? undefined : '4 5'} />
                            <text x={plotLeft - 9} y={y + 4} textAnchor="end" className="fill-muted-foreground" fontSize="11">
                              {tick.toLocaleString()}
                            </text>
                          </g>
                        )
                      })}
                      {analytics.map((work, index) => {
                        const center = plotLeft + interval * (index + 0.5)
                        const barHeight = (work.view_count / chartMax) * plotHeight
                        const label = work.title.length > 12 ? `${work.title.slice(0, 11)}…` : work.title
                        return (
                          <g key={work.work_id}>
                            <rect
                              x={center - barWidth / 2}
                              y={plotBottom - barHeight}
                              width={barWidth}
                              height={barHeight}
                              rx="6"
                              className="fill-accent"
                            >
                              <title>{`${work.title}: ${work.view_count.toLocaleString()} reads`}</title>
                            </rect>
                            <text x={center} y={plotBottom + 20} textAnchor="middle" className="fill-foreground" fontSize="11" fontWeight="600">
                              {label}
                            </text>
                            <text x={center} y={plotBottom + 37} textAnchor="middle" className="fill-muted-foreground" fontSize="10">
                              {work.view_count.toLocaleString()} reads
                            </text>
                          </g>
                        )
                      })}
                    </>
                  )
                })()}
              </svg>
              <ul className="sr-only">
                {analytics.map((work) => (
                  <li key={work.work_id}>{work.title}: {work.view_count.toLocaleString()} reads, {work.like_count.toLocaleString()} likes.</li>
                ))}
              </ul>
            </div>

            <div className="mt-4 space-y-4">
              {analytics.map((work) => {
                const barWidth = maxViews > 0 ? (work.view_count / maxViews) * 100 : 0
                const creatorWork = works.find((item) => item.id === work.work_id)
                return (
                  <article key={work.work_id} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(10rem,.8fr)_auto] sm:items-center sm:gap-5">
                    <div className="flex min-w-0 items-center gap-3">
                      <WorkCover src={creatorWork?.coverImageUrl} title={work.title} className="size-12 rounded-lg" />
                      <div className="min-w-0">
                        <Link href={`/works/${encodeURIComponent(work.work_id)}`} className="block truncate text-sm font-bold hover:text-accent hover:underline">{work.title}</Link>
                        <p className="mt-0.5 text-xs text-muted-foreground">{work.work_type === 'story' ? 'Story' : 'Comic'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div
                        className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-secondary"
                        role="img"
                        aria-label={`${work.view_count.toLocaleString()} reads, ${maxViews > 0 ? Math.round(barWidth) : 0}% of the most-read work`}
                      >
                        <div className="h-full rounded-full bg-accent transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${barWidth}%` }} />
                      </div>
                      <span className="w-12 text-right text-xs font-bold tabular-nums">{work.view_count.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground sm:justify-end">
                      <span className="inline-flex items-center gap-1"><Heart className="size-3.5" aria-hidden="true" />{work.like_count.toLocaleString()}</span>
                      <span className="whitespace-nowrap font-bold text-foreground">{work.score.toLocaleString()} pts</span>
                    </div>
                  </article>
                )
              })}
            </div>
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-t border-border pt-4 text-xs text-muted-foreground">
              <span>Total reads: <strong className="text-foreground">{totalViews.toLocaleString()}</strong></span>
              <span>Total likes: <strong className="text-foreground">{totalLikes.toLocaleString()}</strong></span>
              <span>Ranking points: <strong className="text-foreground">{totalPoints.toLocaleString()}</strong></span>
            </div>
          </>
        )}
      </Panel>
    </CreatorFrame>
  )
}
