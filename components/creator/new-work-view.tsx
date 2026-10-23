'use client'

import { useState } from 'react'
import { BookOpen, Brush, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CreatorFrame } from '@/components/shared/creator-frame'
import { Panel } from '@/components/shared/panel'
import type { Badge, Route } from '@/lib/types'

const FORMATS: { value: 'story' | 'comic'; label: string; description: string; icon: React.ReactNode; requires: Badge }[] = [
  { value: 'story', label: 'Story', description: 'Mga salita, kabanata, at mundong mabubuo mo.', icon: <BookOpen />, requires: 'writer' },
  { value: 'comic', label: 'Comic', description: 'Mga panel, pahina, at kuwentong iginuhit.', icon: <Brush />, requires: 'artist' },
]

export function NewWorkView({ go, badges }: { go: (route: Route) => void; badges: Badge[] }) {
  // A Story needs the Writer badge, a Comic needs the Artist badge — an
  // account only ever needs to choose between formats it can actually
  // make, so this only offers what its badges allow.
  const [type, setType] = useState<'story' | 'comic' | null>(
    badges.includes('writer') && !badges.includes('artist') ? 'story' : badges.includes('artist') && !badges.includes('writer') ? 'comic' : null,
  )
  return (
    <CreatorFrame eyebrow="Creator studio / bagong gawa" title="Simulan na natin 'yan." go={go} backHref="/create/works">
      <Panel className="mx-auto w-full max-w-3xl">
        <div className="flex flex-col gap-6">
          <div>
            <h2 className="font-serif text-2xl font-bold">Piliin ang format</h2>
            <p className="mt-1 text-sm text-muted-foreground">Sa susunod, ilagay ang detalye at i-save muna bilang draft kung gusto mo.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {FORMATS.map((format) => {
              const allowed = badges.includes(format.requires)
              const requiredLabel = format.requires === 'writer' ? 'Writer' : 'Alagad ng sining'
              return (
                <button
                  key={format.value}
                  type="button"
                  disabled={!allowed}
                  onClick={() => allowed && setType(format.value)}
                  className={`rounded-xl border p-6 text-left transition ${
                    !allowed
                      ? 'cursor-not-allowed border-border/60 opacity-50'
                      : type === format.value
                        ? 'border-accent bg-accent/10'
                        : 'border-border hover:border-accent/60'
                  }`}
                >
                  <span className="section-icon">{format.icon}</span>
                  <h3 className="mt-4 font-serif text-xl font-bold">{format.label}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{format.description}</p>
                  {!allowed && <p className="mt-3 text-xs font-bold text-accent">Kailangan ng {requiredLabel} role</p>}
                </button>
              )
            })}
          </div>
          <Button
            disabled={!type}
            onClick={() => go(type === 'story' ? '/create/works/new/story' : '/create/works/new/comic')}
            className="rounded-lg bg-accent text-accent-foreground sm:self-end"
          >
            Magpatuloy <ChevronRight data-icon="inline-end" />
          </Button>
        </div>
      </Panel>
    </CreatorFrame>
  )
}