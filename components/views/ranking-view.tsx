'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, BookOpen, Eye, Feather, LoaderCircle, Palette, Sparkles, UsersRound } from 'lucide-react'
import { useAppState } from '@/lib/app-state'
import { loadWorkRankings, type RankingCategory, type RankingPeriod, type WorkRankingEntry } from '@/lib/work-engagement'

type Category = 'Stories' | 'Comics' | 'Creators'

const CATEGORIES: { label: Category; value: RankingCategory; icon: typeof BookOpen }[] = [
  { label: 'Stories', value: 'stories', icon: BookOpen },
  { label: 'Comics', value: 'comics', icon: Palette },
  { label: 'Creators', value: 'creators', icon: Feather },
]

const PERIODS: RankingPeriod[] = [
  'Today',
  'This week',
  'This month',
  'All time',
]

function rankingHref(category: Category, entry: WorkRankingEntry) {
  return category === 'Creators'
    ? `/profile/${encodeURIComponent(entry.creator_id)}`
    : `/works/${encodeURIComponent(entry.entity_id)}`
}

function rankingMetric(category: Category, entry: WorkRankingEntry) {
  return category === 'Creators'
    ? { count: entry.follower_count, label: 'followers', Icon: UsersRound }
    : { count: entry.view_count, label: 'views', Icon: Eye }
}

function RankingArtwork({
  entry,
  category,
  featured = false,
}: {
  entry: WorkRankingEntry
  category: Category
  featured?: boolean
}) {
  const Icon = category === 'Stories' ? BookOpen : category === 'Comics' ? Palette : Feather
  const isCreator = category === 'Creators'
  const artworkSize = featured
    ? isCreator ? 'size-16 sm:size-[4.5rem]' : 'h-28 w-20'
    : isCreator ? 'size-10 sm:size-11' : 'h-12 w-8 sm:h-12 sm:w-9'

  return (
    <span
      className={`relative flex shrink-0 items-center justify-center overflow-hidden bg-accent/15 text-accent ${
        isCreator ? 'rounded-full' : 'rounded-lg'
      } ${artworkSize}`}
    >
      {isCreator && entry.creator_avatar_url ? (
        <Image
          src={entry.creator_avatar_url}
          alt=""
          fill
          sizes={featured ? '72px' : '44px'}
          className="object-cover"
          unoptimized
        />
      ) : !isCreator && entry.cover_image_url ? (
        <Image
          src={entry.cover_image_url}
          alt=""
          fill
          sizes={featured ? '80px' : '44px'}
          className="object-cover"
          unoptimized
        />
      ) : (
        <Icon className={featured ? 'size-7' : 'size-5'} aria-hidden="true" />
      )}
    </span>
  )
}

function RankingCard({
  entry,
  category,
  rank,
}: {
  entry: WorkRankingEntry
  category: Category
  rank: number
}) {
  const title = category === 'Creators' ? entry.creator_name : entry.title ?? 'Untitled work'
  const subtitle = category === 'Creators'
    ? `@${entry.creator_username || 'creator'}`
    : `by ${entry.creator_name} · ${entry.work_type === 'comic' ? 'Comic' : 'Story'}`
  const metric = rankingMetric(category, entry)
  const MetricIcon = metric.Icon

  return (
    <Link
      href={rankingHref(category, entry)}
      className={`group flex min-h-32 min-w-0 items-center gap-3 rounded-2xl border p-3 transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:gap-4 sm:p-4 ${
        rank === 1
          ? 'podium-first border-primary text-primary-foreground'
          : 'border-border bg-card text-card-foreground'
      }`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
        <RankingArtwork entry={entry} category={category} featured />
        <span className="min-w-0 flex-1">
          <span className={`block font-serif text-4xl font-bold leading-none ${rank === 1 ? 'text-primary-foreground' : 'text-accent'}`}>
            {rank}
          </span>
          <span className="mt-2 block truncate text-sm font-bold">{title}</span>
          <span className={`mt-0.5 block truncate text-xs ${rank === 1 ? 'text-primary-foreground/75' : 'text-muted-foreground'}`}>
            {subtitle}
          </span>
        </span>
      </div>
      <span
        className={`inline-flex w-fit shrink-0 flex-col items-center justify-center rounded-xl px-2 py-1.5 ${
          rank === 1 ? 'bg-primary-foreground/10 text-primary-foreground' : 'bg-secondary text-foreground'
        }`}
      >
        <span
          className="inline-flex items-center gap-1 font-serif text-lg font-bold leading-none sm:text-xl"
        >
          <MetricIcon className="size-4" aria-hidden="true" />
          {metric.count.toLocaleString()}
        </span>
        <span className="mt-1 text-[9px] font-bold uppercase tracking-wide opacity-75">{metric.label}</span>
      </span>
    </Link>
  )
}

export function RankingView() {
  const [category, setCategory] = useState<Category>('Stories')
  const [period, setPeriod] = useState<RankingPeriod>('This week')
  const [entries, setEntries] = useState<WorkRankingEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadVersion, setReloadVersion] = useState(0)
  const { create } = useAppState()
  const selectedCategory = CATEGORIES.find((item) => item.label === category) ?? CATEGORIES[0]
  const CategoryIcon = selectedCategory.icon
  const remainingEntries = entries.slice(3)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    void loadWorkRankings(selectedCategory.value, period)
      .then((results) => {
        if (active) setEntries(results)
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Could not load rankings.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [selectedCategory.value, period, reloadVersion])

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 sm:gap-7">
      <section className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <span className="eyebrow">Community favorites</span>
          <h1 className="mt-2 font-serif text-4xl font-bold sm:text-5xl">Ranking.</h1>
          <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
            A gentle pulse of what readers are loving.
          </p>
          <nav className="mt-5 flex w-fit max-w-full gap-1 overflow-x-auto rounded-full" aria-label="Ranking category">
            {CATEGORIES.map((item) => {
              const selected = item.label === category
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => setCategory(item.label)}
                  aria-pressed={selected}
                  className={`min-h-10 shrink-0 rounded-full border px-4 text-xs font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                    selected
                      ? 'border-accent bg-accent text-accent-foreground'
                      : 'border-border bg-card/70 text-foreground hover:bg-secondary'
                  }`}
                >
                  {item.label}
                </button>
              )
            })}
          </nav>
        </div>
        <div className="flex w-fit max-w-full items-center gap-0.5 overflow-x-auto rounded-full border border-border bg-card p-1" aria-label="Ranking period">
          {PERIODS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setPeriod(item)}
              aria-pressed={period === item}
              className={`min-h-9 shrink-0 rounded-full px-2.5 text-[11px] font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:px-3.5 sm:text-xs ${
                period === item ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </section>

      {loading ? (
        <p role="status" className="flex items-center gap-2 rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> Loading rankings…
        </p>
      ) : error ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
          <p role="alert" className="text-sm text-destructive">{error}</p>
          <button type="button" onClick={() => setReloadVersion((version) => version + 1)} className="min-h-11 rounded-full border border-border px-4 text-sm font-bold hover:border-accent">
            Try again
          </button>
        </div>
      ) : entries.length ? (
        <>
          <section aria-label={`Top ${category.toLowerCase()}`}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
              {entries.slice(0, 3).map((entry, index) => (
                <RankingCard key={entry.entity_id} entry={entry} category={category} rank={index + 1} />
              ))}
            </div>
          </section>
          {remainingEntries.length > 0 && (
            <section className="overflow-hidden rounded-2xl border border-border bg-card" aria-label={`More ranked ${category.toLowerCase()}`}>
              <ol start={4} className="divide-y divide-border">
                {remainingEntries.map((entry, index) => {
                  const rank = index + 4
                  const title = category === 'Creators' ? entry.creator_name : entry.title ?? 'Untitled work'
                  const subtitle = category === 'Creators'
                    ? `@${entry.creator_username || 'creator'}`
                    : `by ${entry.creator_name} · ${entry.work_type === 'comic' ? 'Comic' : 'Story'}`
                  const metric = rankingMetric(category, entry)
                  const MetricIcon = metric.Icon

                  return (
                    <li key={entry.entity_id}>
                      <Link
                        href={rankingHref(category, entry)}
                        className="flex min-h-[4.5rem] items-center gap-3 px-4 py-3 transition-colors hover:bg-secondary/45 focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-accent sm:gap-4 sm:px-5"
                      >
                        <span className="w-5 shrink-0 text-center font-serif text-lg font-bold text-accent">{rank}</span>
                        <RankingArtwork entry={entry} category={category} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold">{title}</span>
                          <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="flex items-center justify-end gap-1 text-base font-bold sm:text-lg">
                            <MetricIcon className="size-4" aria-hidden="true" />
                            {metric.count.toLocaleString()}
                          </span>
                          <span className="text-[10px] text-muted-foreground">{metric.label}</span>
                        </span>
                        <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      </Link>
                    </li>
                  )
                })}
              </ol>
            </section>
          )}
          <p className="text-center text-xs text-muted-foreground">
            Rankings reflect reader engagement. Stories and comics show views; creator rankings show followers.
          </p>
        </>
      ) : (
        <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5 sm:px-6">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary text-accent">
            <CategoryIcon className="size-5" aria-hidden="true" />
          </span>
          <p className="flex-1 text-sm leading-6 text-muted-foreground">
            No published {category.toLowerCase()} are ranked for this period yet. Works will appear here as they get views and likes.
          </p>
        </div>
      )}

      <section className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-accent/10 bg-secondary px-5 py-5 sm:flex-row sm:items-center sm:px-7">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-card text-accent">
            <Sparkles className="size-4" aria-hidden="true" />
          </span>
          <div>
            <h2 className="font-serif text-xl font-bold">Be on the first board.</h2>
            <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">Publish a work and reader likes and views will place it here.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={create}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-accent px-5 text-sm font-bold text-accent-foreground transition hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:w-auto"
        >
          {category === 'Creators' ? 'Share your work' : 'Publish your work'}
          <ArrowRight className="size-4" aria-hidden="true" />
        </button>
      </section>
    </div>
  )
}
