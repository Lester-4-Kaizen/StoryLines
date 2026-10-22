'use client'

import { useState } from 'react'
import { BookMarked, Inbox, Search, Sparkles, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/shared/empty-state'
import { Panel } from '@/components/shared/panel'
import type { Badge, Route } from '@/lib/types'

export function CollaborateView({
  creator,
  role,
  go,
  onUpgrade,
  initialTab = 'find',
}: {
  creator: boolean
  role: Badge
  go: (route: Route) => void
  onUpgrade: () => void
  initialTab?: 'find' | 'active' | 'pending' | 'past'
}) {
  const [tab, setTab] = useState<'find' | 'active' | 'pending' | 'past'>(initialTab)
  const [kind, setKind] = useState<'artist' | 'writer'>('artist')
  const [query, setQuery] = useState('')
  const canFind = creator

  return (
    <div className="flex flex-col gap-8">
      <div>
        <span className="eyebrow">Hanap ka-creative mo</span>
        <h1 className="mt-3 font-serif text-5xl font-bold text-balance">May mabubuo kapag nagsama-sama.</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
          Humanap ng ka-partner para buhayin ang kuwentong sinusulat o larawang iniisip mo.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-border">
        <button
          onClick={() => setTab('find')}
          className={`rounded-t-lg px-4 py-3 text-sm font-bold ${tab === 'find' ? 'border-b-2 border-accent text-accent' : 'text-muted-foreground'}`}
        >
          Find collaborators
        </button>
        {['active', 'pending', 'past'].map((item) => (
          <button
            key={item}
            onClick={() => setTab(item as typeof tab)}
            className={`rounded-t-lg px-4 py-3 text-sm font-bold capitalize ${tab === item ? 'border-b-2 border-accent text-accent' : 'text-muted-foreground'}`}
          >
            {item}
          </button>
        ))}
      </div>

      {!canFind ? (
        <Panel className="flex flex-col items-center p-8 text-center">
          <Users className="size-10 text-accent" />
          <h2 className="mt-4 font-serif text-2xl font-bold">Para makipag-collab, kailangan ng creator role.</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            Idagdag ang Writer o Alagad ng sining role para makahanap ng ka-partner, magpadala ng request, at gumawa sa iisang workspace.
          </p>
          <Button onClick={onUpgrade} className="mt-6 rounded-lg bg-accent text-accent-foreground">
            I-unlock ang creator tools
          </Button>
        </Panel>
      ) : tab === 'find' ? (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setKind('artist')}
              className={`rounded-full px-4 py-2 text-xs font-bold ${kind === 'artist' ? 'bg-primary text-primary-foreground' : 'border border-border bg-card'}`}
            >
              Hanap alagad ng sining
            </button>
            <button
              onClick={() => setKind('writer')}
              className={`rounded-full px-4 py-2 text-xs font-bold ${kind === 'writer' ? 'bg-primary text-primary-foreground' : 'border border-border bg-card'}`}
            >
              Hanap writer
            </button>
          </div>
          <label className="flex items-center gap-3 rounded-xl border border-input bg-card px-4 py-3">
            <Search className="size-5 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Maghanap ng ${kind} ayon sa pangalan o style...`}
              className="w-full bg-transparent text-sm outline-none"
            />
          </label>
          <EmptyState
            icon={<Users />}
            title={`Wala pang ${kind} na makita`}
            message={query ? `Wala pang tugmang ${kind}. Subukan ang ibang pangalan o style.` : `Naghihintay pa ng unang ${kind} profile.`}
          />
        </div>
      ) : (
        <EmptyState
          icon={tab === 'active' ? <Sparkles /> : tab === 'pending' ? <Inbox /> : <BookMarked />}
          title={`Wala pang ${tab === 'active' ? 'active' : tab === 'pending' ? 'pending' : 'dating'} collaboration`}
          message="Dito mo makikita ang collaboration history mo kapag nagsimula ka nang gumawa kasama ang iba."
          action={tab === 'active' ? 'Maghanap ng ka-collab' : undefined}
          onAction={() => setTab('find')}
        />
      )}
    </div>
  )
}