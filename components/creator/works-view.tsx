'use client'

import Link from 'next/link'
import { BookOpen, Brush, ChevronRight, PenLine } from 'lucide-react'
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
  const { works, hydrated } = useWorks()

  return (
    <CreatorFrame eyebrow="Creator studio / works" title="Your works." go={go}>
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">Drafts and published work live here. Tap one to edit it.</p>
        <Button onClick={() => go('/create/works/new')} className="rounded-lg bg-accent text-accent-foreground">
          <PenLine data-icon="inline-start" /> New work
        </Button>
      </div>

      {!hydrated ? null : works.length === 0 ? (
        <EmptyState
          icon={<BookOpen />}
          title="No works yet"
          message="Create your first Story or Comic and it will appear in this private workspace."
          action="Create your first work"
          onAction={() => go('/create/works/new')}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {works.map((work) => (
            <Link key={work.id} href={`/create/works/${work.id}`} className="block">
              <Panel className="flex items-center gap-4 transition hover:border-accent/60">
                <span className="section-icon">{work.type === 'story' ? <BookOpen /> : <Brush />}</span>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-serif text-lg font-bold">{work.title}</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {work.type === 'story' ? 'Story' : 'Comic'}
                    {work.genre ? ` · ${work.genre}` : ''}
                    {work.type === 'comic' && typeof work.pageCount === 'number' ? ` · ${work.pageCount} page${work.pageCount === 1 ? '' : 's'}` : ''}
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