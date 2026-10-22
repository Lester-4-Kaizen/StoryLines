'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { BookOpen, Brush, Search } from 'lucide-react'
import { EmptyState } from '@/components/shared/empty-state'
import { Button } from '@/components/ui/button'
import { useWorks } from '@/lib/works-store'

export function BrowseView() {
  const [tab, setTab] = useState<'Stories' | 'Comics'>('Stories')
  const [query, setQuery] = useState('')
  const router = useRouter()
  const searchParams = useSearchParams()
  const urlQuery = searchParams.get('search') ?? ''
  const { works, hydrated } = useWorks()
  const normalizedQuery = urlQuery.trim().toLocaleLowerCase()
  const selectedType = tab === 'Stories' ? 'story' : 'comic'
  const matchingWorks = works.filter((work) => {
    if (work.status === 'Draft' || work.type !== selectedType) return false
    if (!normalizedQuery) return true

    return [work.title, work.synopsis, work.genre, work.language]
      .some((value) => value?.toLocaleLowerCase().includes(normalizedQuery))
  })

  useEffect(() => {
    setQuery(urlQuery)
  }, [urlQuery])

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const search = query.trim()
    router.push(search ? `/browse?search=${encodeURIComponent(search)}` : '/browse')
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <span className="eyebrow">Mga bukas na pahina</span>
        <h1 className="mt-3 font-serif text-5xl font-bold">Tuklasin ang {tab === 'Stories' ? 'mga kuwento' : 'mga komiks'}.</h1>
        <p className="mt-3 text-sm text-muted-foreground">Pumili ayon sa mood, genre, o mundong gusto mong pasukin.</p>
      </div>
      <form onSubmit={submitSearch} role="search" className="flex min-h-12 max-w-2xl items-center gap-2 rounded-xl border border-border bg-card p-1.5 pl-4 shadow-sm focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
        <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <label className="sr-only" htmlFor="browse-search">Maghanap ng kuwento o komiks</label>
        <input
          id="browse-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Hanap pamagat, genre, o keyword..."
          aria-label="Maghanap ng kuwento o komiks"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        <Button type="submit" className="min-h-11 rounded-lg bg-accent px-4 text-accent-foreground hover:bg-accent/90">
          Hanapin
        </Button>
      </form>
      <div className="flex gap-2 border-b border-border">
        <button
          type="button"
          onClick={() => setTab('Stories')}
          aria-pressed={tab === 'Stories'}
          className={`min-h-11 border-b-2 px-4 py-3 text-sm font-bold ${tab === 'Stories' ? 'border-accent text-accent' : 'border-transparent text-muted-foreground'}`}
        >
          Stories
        </button>
        <button
          type="button"
          onClick={() => setTab('Comics')}
          aria-pressed={tab === 'Comics'}
          className={`min-h-11 border-b-2 px-4 py-3 text-sm font-bold ${tab === 'Comics' ? 'border-accent text-accent' : 'border-transparent text-muted-foreground'}`}
        >
          Comics
        </button>
      </div>
      {!hydrated ? (
        <div className="min-h-56 rounded-2xl border border-border bg-card/60" aria-label="Naglo-load ng mga gawa" />
      ) : matchingWorks.length > 0 ? (
        <section aria-label={tab === 'Stories' ? 'Mga kuwento' : 'Mga komiks'} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {matchingWorks.map((work) => (
            <article key={work.id} className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              <div className={`flex h-32 items-end p-4 ${work.type === 'story' ? 'bg-primary text-primary-foreground' : 'bg-accent text-accent-foreground'}`}>
                <span className="rounded-full bg-background/15 px-3 py-1 text-xs font-bold">{work.type === 'story' ? 'Story' : 'Comic'}</span>
              </div>
              <div className="p-4">
                <h2 className="font-serif text-xl font-bold">{work.title}</h2>
                <p className="mt-1 text-xs font-semibold text-accent">
                  {[work.genre, work.language].filter(Boolean).join(' · ') || 'Bagong likha'}
                </p>
                {work.synopsis && <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">{work.synopsis}</p>}
                <p className="mt-4 text-xs text-muted-foreground">{work.status === 'Complete' ? 'Kumpleto' : 'Patuloy ang kuwento'}</p>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <EmptyState
          icon={tab === 'Stories' ? <BookOpen /> : <Brush />}
          title={urlQuery ? 'Walang tugmang nailathalang gawa' : `Wala pang nailathalang ${tab === 'Stories' ? 'kuwento' : 'komiks'}`}
          message={
            urlQuery
              ? `Walang nakitang gawa para sa “${urlQuery}”. Subukan ang ibang pamagat, genre, o keyword.`
              : 'Dito lalabas ang mga gawa kapag may nag-publish na creators sa StoryLines.'
          }
        />
      )}
    </div>
  )
}
