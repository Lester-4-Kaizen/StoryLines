'use client'

import Link from 'next/link'
import { BookOpen, Brush, Crown, PenLine, Sparkles } from 'lucide-react'
import { ActionButton } from '@/components/shared/action-button'
import { CreatorFrame } from '@/components/shared/creator-frame'
import { EmptyState } from '@/components/shared/empty-state'
import { Panel } from '@/components/shared/panel'
import { useWorks } from '@/lib/works-store'
import type { Route } from '@/lib/types'

export function DashboardView({ go }: { go: (route: Route) => void }) {
  const { works } = useWorks()
  const published = works.filter((work) => work.status !== 'Draft').length
  const recent = works.slice(0, 4)

  return (
    <CreatorFrame eyebrow="Creator studio" title="Your creative home." go={go}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Published works', String(published)],
          ['Total reads', '0'],
          ['Likes received', '0'],
          ['Followers', '0'],
        ].map(([label, value]) => (
          <Panel key={label}>
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</span>
            <p className="mt-4 font-serif text-4xl font-bold">{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{label === 'Published works' && published > 0 ? `${works.length} total including drafts` : 'No activity yet'}</p>
          </Panel>
        ))}
      </div>
      <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
        <Panel>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-serif text-2xl font-bold">Quick actions</h2>
              <p className="mt-1 text-sm text-muted-foreground">Start with a blank page or check on your work.</p>
            </div>
            <Sparkles className="text-accent" />
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <ActionButton icon={<PenLine />} label="New work" onClick={() => go('/create/works/new')} />
            <ActionButton icon={<BookOpen />} label="Manage works" onClick={() => go('/create/works')} />
            <ActionButton icon={<Brush />} label="Portfolio" onClick={() => go('/create/portfolio')} />
            <ActionButton icon={<Crown />} label="View analytics" onClick={() => go('/create/works/analytics')} />
          </div>
        </Panel>
        <Panel>
          <h2 className="font-serif text-2xl font-bold">Recent activity</h2>
          <div className="mt-6">
            {recent.length === 0 ? (
              <EmptyState icon={<Sparkles />} title="A quiet beginning" message="Your activity will appear here once you publish." />
            ) : (
              <div className="flex flex-col gap-3">
                {recent.map((work) => (
                  <Link
                    key={work.id}
                    href={`/create/works/${work.id}`}
                    className="flex items-center gap-3 rounded-lg border border-border p-3 text-left text-sm hover:border-accent/60"
                  >
                    <span className="section-icon">{work.type === 'story' ? <BookOpen className="size-4" /> : <Brush className="size-4" />}</span>
                    <span className="min-w-0 flex-1 truncate font-bold">{work.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{work.status}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </Panel>
      </div>
    </CreatorFrame>
  )
}