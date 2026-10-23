'use client'

import { useState } from 'react'
import { ArrowRight, BookOpen, Feather, Heart, Palette, Sparkles } from 'lucide-react'
import { useAppState } from '@/lib/app-state'

type Category = 'Stories' | 'Comics' | 'Creators'
type Period = 'Today' | 'This week' | 'This month' | 'All time'

const CATEGORIES: { label: Category; filipino: string; icon: typeof BookOpen; description: string }[] = [
  {
    label: 'Stories',
    filipino: 'Mga kuwento',
    icon: BookOpen,
    description: 'Mga kuwentong binabasa at minamahal ng community.',
  },
  {
    label: 'Comics',
    filipino: 'Komiks',
    icon: Palette,
    description: 'Mga komiks na nagdadala sa atin sa ibang mundo.',
  },
  {
    label: 'Creators',
    filipino: 'Mga creator',
    icon: Feather,
    description: 'Mga creator na nagbibigay-buhay sa StoryLines.',
  },
]

const PERIODS: { label: Period; display: string }[] = [
  { label: 'Today', display: 'Ngayong araw' },
  { label: 'This week', display: 'Ngayong linggo' },
  { label: 'This month', display: 'Ngayong buwan' },
  { label: 'All time', display: 'All time' },
]

export function RankingView() {
  const [category, setCategory] = useState<Category>('Stories')
  const [period, setPeriod] = useState<Period>('This week')
  const { create } = useAppState()
  const selectedCategory = CATEGORIES.find((item) => item.label === category) ?? CATEGORIES[0]
  const CategoryIcon = selectedCategory.icon

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-7 sm:gap-8">
      <section className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <span className="eyebrow">Mga paborito ng community</span>
          <h1 className="mt-2 font-serif text-4xl font-bold sm:text-5xl">Ranking.</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            Silipin ang mga kuwentong binabasa, likhang hinahangaan, at creators na sinusubaybayan ng readers.
          </p>
        </div>
        <div className="flex w-fit max-w-full items-center gap-1 overflow-x-auto rounded-full border border-border bg-card p-1" aria-label="Piliin ang panahon ng ranking">
          {PERIODS.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => setPeriod(item.label)}
              aria-pressed={period === item.label}
              className={`min-h-10 shrink-0 rounded-full px-3 text-xs font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:px-4 ${
                period === item.label ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <span className="sm:hidden">{item.display === 'Ngayong linggo' ? 'Linggo' : item.display === 'Ngayong buwan' ? 'Buwan' : item.display === 'Ngayong araw' ? 'Today' : item.display}</span>
              <span className="hidden sm:inline">{item.display}</span>
            </button>
          ))}
        </div>
      </section>

      <nav className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-full border border-border bg-card p-1" aria-label="Uri ng ranking">
        {CATEGORIES.map((item) => {
          const Icon = item.icon
          const selected = item.label === category
          return (
            <button
              key={item.label}
              type="button"
              onClick={() => setCategory(item.label)}
              aria-pressed={selected}
              className={`flex min-h-10 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                selected ? 'bg-accent text-accent-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <Icon className="size-4" aria-hidden="true" />
              {item.filipino}
            </button>
          )
        })}
      </nav>

      <section className="overflow-hidden rounded-2xl border border-border bg-card" aria-labelledby="ranking-empty-title">
        <div className="flex items-center gap-3 border-b border-border bg-secondary/45 px-4 py-4 sm:px-6">
          <span className="section-icon"><Heart className="size-4" /></span>
          <div>
            <h2 id="ranking-empty-title" className="font-serif text-lg font-bold">Simula pa lang ang kuwento ng ranking</h2>
            <p className="text-xs text-muted-foreground">
              {selectedCategory.description} · {PERIODS.find((item) => item.label === period)?.display}. Sa ngayon, wala pang sapat na activity para bumuo ng listahan.
            </p>
          </div>
        </div>
        <div className="flex flex-col items-start gap-4 p-5 sm:flex-row sm:items-center sm:px-6">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary text-accent">
            <CategoryIcon className="size-5" aria-hidden="true" />
          </span>
          <p className="flex-1 text-sm leading-6 text-muted-foreground">
            {category === 'Stories'
              ? 'I-publish ang unang kuwento mo, o magbasa at mag-save ng mga kuwentong babalik-balikan.'
              : category === 'Comics'
                ? 'Ibahagi ang unang komiks mo at simulan ang susunod na paborito ng readers.'
                : 'Ipakilala ang gawa mo sa community—baka ikaw ang susunod na makilala rito.'}
          </p>
        </div>
      </section>

      <section className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-accent/10 bg-secondary px-5 py-5 sm:flex-row sm:items-center sm:px-7">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-card text-accent">
            <Sparkles className="size-4" aria-hidden="true" />
          </span>
          <div>
            <h2 className="font-serif text-xl font-bold">Baka gawa mo ang susunod na paborito.</h2>
            <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">I-publish ang kuwento o komiks mo at makilala ng mas maraming readers.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={create}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-accent px-5 text-sm font-bold text-accent-foreground transition hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:w-auto"
        >
          I-publish ang gawa mo
          <ArrowRight className="size-4" aria-hidden="true" />
        </button>
      </section>
    </div>
  )
}
