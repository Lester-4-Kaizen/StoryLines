'use client'

import { useState } from 'react'
import { Check, ChevronDown, Compass, Filter, PenLine, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/shared/empty-state'
import { SectionHeading } from '@/components/shared/section-heading'
import type { Route } from '@/lib/types'

const GENRES = ['All genres', 'Fantasy', 'Romance', 'Slice of life', 'Mystery']

export function HomeView({
  creator,
  onCreate,
  go,
}: {
  creator: boolean
  onCreate: () => void
  go: (route: Route) => void
}) {
  const [genreOpen, setGenreOpen] = useState(false)
  const [genre, setGenre] = useState('All genres')

  return (
    <div className="flex flex-col gap-10">
      <section className="paper-panel hero-panel flex flex-col items-start justify-between gap-8 p-7 sm:p-10 lg:flex-row lg:items-end">
        <div className="max-w-2xl">
          <span className="eyebrow">Your creative corner</span>
          <h1 className="mt-3 max-w-xl font-serif text-4xl font-bold leading-tight text-balance sm:text-6xl">
            A little space for the stories you carry.
          </h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-muted-foreground">
            Read something new, find your people, or make a home for the work waiting in your notebook.
          </p>
        </div>
        <Button onClick={onCreate} className="rounded-lg bg-accent text-accent-foreground hover:bg-accent/90">
          <PenLine data-icon="inline-start" />
          {creator ? 'Start a new work' : 'Become a creator'}
        </Button>
      </section>

      <section className="flex flex-col gap-5">
        <SectionHeading
          icon={<Sparkles />}
          title="Find your next favorite"
          description="Browse stories and comics by what you feel like reading today."
        />
        <div className="flex flex-wrap items-center gap-2">
          <button className="rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground">Stories</button>
          <button className="rounded-full border border-border bg-card px-4 py-2 text-xs font-bold">Comics</button>
          <div className="relative ml-auto">
            <button
              onClick={() => setGenreOpen((open) => !open)}
              className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-xs font-bold"
            >
              <Filter className="size-3.5" /> {genre === 'All genres' ? 'Filter by genre' : genre} <ChevronDown className="size-3.5" />
            </button>
            {genreOpen && (
              <div className="absolute right-0 z-10 mt-2 w-44 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-card p-1 shadow-lg">
                {GENRES.map((option) => (
                  <button
                    key={option}
                    onClick={() => {
                      setGenre(option)
                      setGenreOpen(false)
                    }}
                    className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-xs font-bold hover:bg-muted"
                  >
                    {option}
                    {genre === option && <Check className="size-3.5 text-accent" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <EmptyState
          icon={<Compass />}
          title="The shelves are still being filled"
          message={
            genre === 'All genres'
              ? 'No works have been published yet. Check back after our first writers and artists arrive.'
              : `No ${genre.toLowerCase()} works have been published yet. Check back after our first writers and artists arrive.`
          }
          action="Visit Browse"
          onAction={() => go('/browse')}
        />
      </section>
    </div>
  )
}