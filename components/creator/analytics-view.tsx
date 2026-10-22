'use client'

import { CreatorFrame } from '@/components/shared/creator-frame'
import { Panel } from '@/components/shared/panel'

export function AnalyticsView() {
  return (
    <CreatorFrame eyebrow="Creator studio / analytics" title="See how the work travels." go={() => {}}>
      <div className="grid gap-4 sm:grid-cols-3">
        {['Reads', 'Likes', 'New followers'].map((label) => (
          <Panel key={label}>
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</span>
            <p className="mt-4 font-serif text-4xl font-bold">0</p>
            <p className="mt-1 text-xs text-muted-foreground">Waiting for your first publication</p>
          </Panel>
        ))}
      </div>
      <Panel>
        <h2 className="font-serif text-2xl font-bold">Reading activity</h2>
        <div className="mt-6 flex h-56 items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 text-sm text-muted-foreground">
          Analytics will appear after your work has readers.
        </div>
      </Panel>
    </CreatorFrame>
  )
}