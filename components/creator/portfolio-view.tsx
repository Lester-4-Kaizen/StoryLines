import { Brush } from 'lucide-react'
import { CreatorFrame } from '@/components/shared/creator-frame'
import { EmptyState } from '@/components/shared/empty-state'
import { Panel } from '@/components/shared/panel'
import type { Badge } from '@/lib/types'

export function PortfolioView({ badges }: { badges: Badge[] }) {
  return (
    <CreatorFrame eyebrow="Artist studio / portfolio" title="Portfolio mo." go={() => {}}>
      <Panel>
        <div className="flex items-start gap-4">
          <span className="section-icon">
            <Brush />
          </span>
          <div>
            <h2 className="font-serif text-2xl font-bold">Tahanan ng mga visual work mo</h2>
            <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
                Piliin ang artwork na gusto mong ipakita, magdagdag ng maikling bio, at ipakita ang style na tatatak sa kanila.
            </p>
          </div>
        </div>
        <div className="mt-6">
          <EmptyState
            icon={<Brush />}
            title="Wala pang laman ang portfolio mo"
            message={badges.includes('artist') ? 'I-upload ang una mong piece kapag handa ka na.' : 'I-unlock ang Alagad ng sining role para makapag-publish ng portfolio.'}
            action={!badges.includes('artist') ? 'I-unlock ang Alagad ng sining role' : undefined}
          />
        </div>
      </Panel>
    </CreatorFrame>
  )
}
