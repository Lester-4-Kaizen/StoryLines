'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, BookOpen, Brush, ChevronRight, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CreatorFrame } from '@/components/shared/creator-frame'
import { Panel } from '@/components/shared/panel'
import type { Badge, Route } from '@/lib/types'

const FORMATS: { value: 'story' | 'comic'; label: string; description: string; icon: React.ReactNode; requires: Badge; available: boolean }[] = [
  { value: 'story', label: 'Story project', description: 'Gumawa ng project, idagdag ang story details, at isulat ang mga kabanata kapag handa ka na.', icon: <BookOpen />, requires: 'writer', available: true },
  { value: 'comic', label: 'Comic project', description: 'Gumawa ng project, ayusin ang episode details, at idagdag ang mga pahina kapag handa na.', icon: <Brush />, requires: 'artist', available: false },
]

export function NewWorkView({ go, badges, activeRole }: { go: (route: Route) => void; badges: Badge[]; activeRole: Badge }) {
  const [type, setType] = useState<'story' | 'comic' | null>(
    activeRole === 'writer' && badges.includes('writer') ? 'story' : null,
  )
  return (
    <CreatorFrame eyebrow="Creator studio / bagong gawa" title="Simulan na natin 'yan." go={go}>
      <Panel className="mx-auto w-full max-w-3xl">
        <div className="flex flex-col gap-6">
          <div>
            <span className="eyebrow">Create a project</span>
            <h2 className="mt-2 font-serif text-3xl font-bold">Anong project ang sisimulan mo?</h2>
            <p className="mt-2 text-sm text-muted-foreground">Pumili ng format, ilagay ang mga pangunahing detalye, at ituloy sa editor. Puwedeng gumawa ng draft kahit wala pang cover o laman.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {FORMATS.map((format) => {
              const allowed = format.available && badges.includes(format.requires)
              const requiredLabel = format.requires === 'writer' ? 'Writer' : 'Alagad ng sining'
              return (
                <button
                  key={format.value}
                  type="button"
                  disabled={!allowed}
                  aria-pressed={type === format.value}
                  onClick={() => allowed && setType(format.value)}
                  className={`min-h-52 rounded-2xl border p-5 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                    !allowed
                      ? 'cursor-not-allowed border-border/60 bg-muted/40 opacity-75'
                      : type === format.value
                        ? 'border-accent bg-accent/10 shadow-sm'
                        : 'border-border bg-card hover:border-accent/60 hover:bg-secondary/40'
                  }`}
                >
                  <span className="flex size-12 items-center justify-center rounded-xl bg-secondary text-accent">{format.icon}</span>
                  <h3 className="mt-4 font-serif text-2xl font-bold">{format.label}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{format.description}</p>
                  <p className={`mt-4 inline-flex items-start gap-2 text-xs font-bold ${allowed ? 'text-accent' : 'text-muted-foreground'}`}>
                    {!allowed && <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden="true" />}
                    <span>
                      {allowed
                        ? type === format.value ? 'Selected' : `Use ${requiredLabel} tools`
                        : format.value === 'comic'
                          ? 'Unavailable to everyone right now: comic image hosting is not available.'
                          : 'Writer badge required to create story projects.'}
                    </span>
                  </p>
                </button>
              )
            })}
          </div>
          <div role="status" className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden="true" />
            <p className="text-muted-foreground">
              Comic creation is temporarily unavailable to all users because the project does not currently have image-hosting capacity for comic pages. Story projects remain available to accounts with the Writer badge.
            </p>
          </div>
          {!badges.includes('writer') && !badges.includes('artist') && (
            <div className="flex items-start gap-3 rounded-xl border border-border bg-secondary/50 p-4 text-sm">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-accent" />
              <p className="text-muted-foreground">Para makagawa, i-enable ang Writer o Artist / Comics badge sa <Link href="/settings" className="font-bold text-accent underline underline-offset-2">account settings</Link>. Reader stays included.</p>
            </div>
          )}
          <div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">Hindi pa sigurado? Puwede kang mag-save ng draft at bumalik dito mamaya.</p>
            <Button
              type="button"
              disabled={!type}
              onClick={() => go(type === 'story' ? '/create/works/new/story' : '/create/works/new/comic')}
              className="min-h-11 rounded-full bg-accent text-accent-foreground"
            >
              Continue to project details <ChevronRight data-icon="inline-end" />
            </Button>
          </div>
        </div>
      </Panel>
    </CreatorFrame>
  )
}