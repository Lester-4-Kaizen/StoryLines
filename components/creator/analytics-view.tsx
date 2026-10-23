'use client'

import { BookOpen, Brush, FileText } from 'lucide-react'
import { CreatorFrame } from '@/components/shared/creator-frame'
import { EmptyState } from '@/components/shared/empty-state'
import { Panel } from '@/components/shared/panel'
import { useWorks } from '@/lib/works-store'
import type { Route } from '@/lib/types'

export function AnalyticsView({ go }: { go: (route: Route) => void }) {
  const { works, hydrated, loadError, refreshWorks } = useWorks()
  const published = works.filter((work) => work.status !== 'Draft')
  const drafts = works.filter((work) => work.status === 'Draft')
  const stories = works.filter((work) => work.type === 'story').length
  const visual = works.filter((work) => work.type === 'comic' || work.type === 'art').length

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
        <h2 className="font-serif text-2xl font-bold">Reading activity</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Hindi pa nire-record ng platform ang reads, likes, o follower changes bilang creator analytics. Hindi kami magpapakita ng placeholder zeros bilang tunay na performance data.
        </p>
        {!hydrated ? (
          <div className="mt-5 h-36 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" aria-label="Loading analytics" />
        ) : loadError ? (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border p-4">
            <p className="text-sm text-muted-foreground">Hindi ma-load ang work counts.</p>
            <button type="button" onClick={() => void refreshWorks()} className="min-h-11 rounded-lg px-4 text-sm font-bold text-accent hover:bg-secondary">Try again</button>
          </div>
        ) : works.length === 0 ? (
          <div className="mt-5">
            <EmptyState icon={<BookOpen />} title="Wala pang work na maisasama" message="Gumawa muna ng Story o Comic; ang totoong work counts mo ay lalabas dito." action="Create a work" onAction={() => go('/create/works/new')} />
          </div>
        ) : (
          <div className="mt-5 grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-3">
            <p className="text-sm"><span className="font-bold">{stories}</span> Stories</p>
            <p className="text-sm"><span className="font-bold">{visual}</span> Comics / artwork</p>
            <p className="text-sm"><span className="font-bold">{published.length}</span> published works</p>
          </div>
        )}
      </Panel>
    </CreatorFrame>
  )
}