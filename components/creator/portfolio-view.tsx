import { Brush } from 'lucide-react'
import { CreatorFrame } from '@/components/shared/creator-frame'
import { EmptyState } from '@/components/shared/empty-state'
import { Panel } from '@/components/shared/panel'
import type { Badge } from '@/lib/types'

export function PortfolioView({ badges }: { badges: Badge[] }) {
  return (
    <CreatorFrame eyebrow="Artist studio / portfolio" title="Your portfolio." go={() => {}}>
      <Panel>
        <div className="flex items-start gap-4">
          <span className="section-icon">
            <Brush />
          </span>
          <div>
            <h2 className="font-serif text-2xl font-bold">A portfolio for the visual work</h2>
            <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
              Add selected artwork, a short bio, and the visual references you want people to remember.
            </p>
          </div>
        </div>
        <div className="mt-6">
          <EmptyState
            icon={<Brush />}
            title="No portfolio items yet"
            message={badges.includes('artist') ? 'Upload your first piece when you are ready.' : 'An Artist badge unlocks portfolio publishing.'}
            action={!badges.includes('artist') ? 'Unlock Artist badge' : undefined}
          />
        </div>
      </Panel>
    </CreatorFrame>
  )
}
