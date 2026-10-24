'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, BookOpen, Compass, PenLine, Search, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/shared/empty-state'
import { SectionHeading } from '@/components/shared/section-heading'
import type { Route } from '@/lib/types'

export function HomeView({
  creator,
  onCreate,
  go,
}: {
  creator: boolean
  onCreate: () => void
  go: (route: Route) => void
}) {
  const [search, setSearch] = useState('')
  const router = useRouter()

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const query = search.trim()
    if (query) router.push(`/browse?search=${encodeURIComponent(query)}`)
    else go('/browse')
  }

  return (
    <div className="flex flex-col gap-12 pb-8 sm:gap-16">
      <section className="home-hero relative overflow-hidden rounded-2xl border border-border px-5 py-8 sm:px-10 sm:py-11 lg:px-14 lg:py-14">
        <div className="relative z-10 grid min-w-0 items-center gap-9 lg:grid-cols-[1.05fr_.95fr] lg:gap-8">
          <div className="min-w-0 max-w-2xl">
            <span className="eyebrow">Para sa mga Pilipinong manlilikha</span>
            <h1 className="mt-3 max-w-xl font-serif text-4xl font-bold leading-[1.06] text-balance sm:text-6xl">
              Kuwento mo.
              <br />
              Kapitbahay mo.
            </h1>
            <p className="mt-5 max-w-lg text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">
              Dito nagsasama ang mga kuwento, sining, at mga taong handang sumuporta sa gawa mo. Tara, simulan natin.
            </p>
            <div className="mt-6 flex flex-col gap-3 min-[420px]:flex-row">
              <Button onClick={onCreate} className="min-h-11 min-w-0 whitespace-normal rounded-full bg-accent px-5 text-accent-foreground hover:bg-accent/90">
                <PenLine data-icon="inline-start" />
                {creator ? 'Gumawa ng bagong obra' : 'Simulan ang gawa mo'}
              </Button>
              <Button variant="outline" onClick={() => go('/browse')} className="min-h-11 min-w-0 whitespace-normal rounded-full px-5">
                Mag-browse ng mga kuwento
                <ArrowRight data-icon="inline-end" />
              </Button>
            </div>

            <form onSubmit={submitSearch} role="search" className="mt-6 flex min-h-12 min-w-0 w-full max-w-xl items-center gap-2 rounded-full border border-border bg-card p-1.5 pl-4 shadow-sm focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
              <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <label className="sr-only" htmlFor="home-search">Maghanap ng kuwento, komiks, o creator</label>
              <input
                id="home-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Hanap kuwento, komiks, o creator..."
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              <Button type="submit" className="rounded-full bg-primary px-4 text-primary-foreground hover:bg-primary/90">
                Hanapin
              </Button>
            </form>
          </div>

          <div className="home-book-art mx-auto hidden w-full max-w-md items-end justify-center gap-3 pb-2 sm:flex lg:justify-end" aria-hidden="true">
            <div className="home-book home-book-one"><span>Isang munting simula</span></div>
            <div className="home-book home-book-two"><Sparkles className="mb-5 size-5 opacity-80" /><span>Mga kuwentong<br />ikaw ang bida</span></div>
            <div className="home-book home-book-three"><span>Likha mo.<br />Mundo mo.</span></div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2" aria-label="Mga puwedeng gawin sa StoryLines">
        <button type="button" onClick={() => go('/browse')} className="home-path-card group text-left">
          <span className="section-icon"><BookOpen className="size-4" /></span>
          <h2 className="mt-3 font-serif text-xl font-bold">Magbasa</h2>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">Tumuklas ng mga kuwento at komiks mula sa kapwa Pinoy.</p>
        </button>
        <button type="button" onClick={() => go('/collaborate')} className="home-path-card group text-left">
          <span className="section-icon"><Sparkles className="size-4" /></span>
          <h2 className="mt-3 font-serif text-xl font-bold">Makipagtulungan</h2>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">Humanap ng ka-writing o ka-collab na kapareho ng pangarap.</p>
        </button>
      </section>

      <section className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <SectionHeading
            icon={<Sparkles />}
            title="Trending ngayong linggo"
            description="Mga kuwentong hinihintay nating mapuno ng community."
          />
          <button type="button" onClick={() => go('/ranking')} className="min-h-11 text-sm font-bold text-accent hover:underline">
            Tingnan ang ranking <ArrowRight className="ml-1 inline size-4" aria-hidden="true" />
          </button>
        </div>
        <EmptyState
          icon={<Compass />}
          title="May puwang pa sa estante"
          message="Wala pang nailalathalang public works. Ikaw kaya ang maglagay ng unang kuwentong babalikan dito?"
          action="Tuklasin ang browse"
          onAction={() => go('/browse')}
        />
      </section>

      <section className="home-community-panel -mx-4 px-5 py-9 sm:-mx-6 sm:px-10 sm:py-12 lg:-mx-8 lg:px-14">
        <span className="eyebrow home-dark-eyebrow">Sama-samang lumikha</span>
        <div className="mt-2 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <h2 className="font-serif text-3xl font-bold text-primary-foreground sm:text-4xl">Mas masaya kapag may kaagapay.</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-primary-foreground/75">
              Writer ka man o alagad ng sining, may lugar ka rito. Baka dito mo mahanap ang susunod mong ka-collab.
            </p>
          </div>
          <Button variant="outline" onClick={() => go('/collaborate')} className="min-h-11 w-full rounded-full border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground sm:w-auto">
            Hanap ka-collab
            <ArrowRight data-icon="inline-end" />
          </Button>
        </div>
      </section>

    </div>
  )
}
