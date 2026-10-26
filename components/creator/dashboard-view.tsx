'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  BookOpen,
  Check,
  Circle,
  Eye,
  Heart,
  PenLine,
  RefreshCw,
  UsersRound,
} from 'lucide-react'
import { CreatorFrame } from '@/components/shared/creator-frame'
import { EmptyState } from '@/components/shared/empty-state'
import { Panel } from '@/components/shared/panel'
import { WorkCover } from '@/components/creator/work-cover'
import { useAppState } from '@/lib/app-state'
import { getSupabaseClient } from '@/lib/supabase'
import { loadMyWorkAnalytics } from '@/lib/work-engagement'
import { useWorks } from '@/lib/works-store'
import type { Route } from '@/lib/types'

type StudioProfile = {
  bio: string
  avatar_path: string | null
  open_for_collaboration: boolean
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String(Reflect.get(error, 'message'))
  }
  return 'Could not load your creator overview.'
}

export function DashboardView({ go }: { go: (route: Route) => void }) {
  const { works, hydrated, loadError, refreshWorks } = useWorks()
  const { currentUserId, badges } = useAppState()
  const [readsThisWeek, setReadsThisWeek] = useState<number | null>(null)
  const [followerCount, setFollowerCount] = useState<number | null>(null)
  const [profile, setProfile] = useState<StudioProfile | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [statsError, setStatsError] = useState<string | null>(null)
  const published = works.filter((work) => work.status !== 'Draft')
  const drafts = works.filter((work) => work.status === 'Draft')
  const recent = works.slice(0, 3)

  useEffect(() => {
    if (!currentUserId) {
      setStatsLoading(false)
      return
    }
    let active = true
    setStatsLoading(true)
    setStatsError(null)
    void Promise.all([
      loadMyWorkAnalytics('This week'),
      getSupabaseClient()
        .from('profiles')
        .select('bio, avatar_path, open_for_collaboration')
        .eq('id', currentUserId)
        .single(),
      getSupabaseClient().rpc('get_browse_creator_stats', {
        p_profile_ids: [currentUserId],
      }),
    ]).then(([analytics, profileResult, followerResult]) => {
      if (profileResult.error) throw profileResult.error
      if (followerResult.error) throw followerResult.error
      if (!active) return
      setReadsThisWeek(analytics.reduce((sum, work) => sum + work.view_count, 0))
      setProfile(profileResult.data)
      setFollowerCount(Number(followerResult.data?.[0]?.follower_count ?? 0))
    }).catch((error: unknown) => {
      if (!active) return
      setStatsError(getErrorMessage(error))
      console.error('Could not load creator dashboard statistics', error)
    }).finally(() => {
      if (active) setStatsLoading(false)
    })
    return () => {
      active = false
    }
  }, [currentUserId])

  const metrics = [
    { label: 'Published', value: hydrated ? published.length : null, description: 'Stories and comics', Icon: BookOpen },
    { label: 'Drafts', value: hydrated ? drafts.length : null, description: 'Not yet published', Icon: PenLine },
    { label: 'Reads this week', value: readsThisWeek, description: 'Across your works', Icon: Eye },
    { label: 'Followers', value: followerCount, description: 'Your reader community', Icon: UsersRound },
  ]
  const profileSteps = [
    { label: 'Choose your creator badges', done: badges.some((badge) => badge === 'writer' || badge === 'artist') },
    { label: 'Add a bio and avatar', done: Boolean(profile?.bio.trim() && profile.avatar_path) },
    { label: 'Publish your first chapter', done: published.some((work) => (work.chapters?.length ?? 0) > 0) },
    { label: 'Open for collaboration', done: profile?.open_for_collaboration ?? false },
  ]

  return (
    <CreatorFrame eyebrow="Creator studio" title="Tahanan ng mga likha mo." go={go}>
      {loadError && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          <p>{loadError}</p>
          <button type="button" onClick={() => void refreshWorks()} className="inline-flex min-h-10 items-center gap-2 rounded-full px-3 font-bold hover:bg-destructive/10">
            <RefreshCw className="size-4" /> Try again
          </button>
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Creator overview">
        {metrics.map(({ label, value, description, Icon }) => (
          <Panel key={label} className="p-4">
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{label}</span>
            <div className="mt-2 flex items-end justify-between gap-2">
              <p className="font-serif text-4xl font-bold leading-none">
                {value === null || (statsLoading && (label.startsWith('Reads') || label === 'Followers')) ? '—' : value.toLocaleString()}
              </p>
              <Icon className="mb-1 size-4 text-accent" aria-hidden="true" />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{description}</p>
          </Panel>
        ))}
      </section>
      {statsError && (
        <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          Hindi ma-load ang reads at followers: {statsError}
        </p>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.9fr)_minmax(16rem,.85fr)]">
        <Panel className="p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
            <div>
              <h2 className="font-serif text-2xl font-bold">Pick up where you left off</h2>
              <p className="mt-1 text-sm text-muted-foreground">Recent work and drafts from your studio.</p>
            </div>
            <Link href="/create/works" className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-full px-2 text-sm font-bold text-accent hover:bg-secondary">
              View all <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>

          {!hydrated ? (
            <div className="mt-3 flex flex-col gap-2" aria-label="Loading your works">
              {[0, 1, 2].map((item) => <div key={item} className="h-[4.5rem] animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />)}
            </div>
          ) : loadError ? (
            <p className="mt-4 text-sm text-muted-foreground">Recent works can’t be shown until the project list loads.</p>
          ) : recent.length === 0 ? (
            <div className="py-4">
              <EmptyState icon={<BookOpen />} title="Your studio is ready" message="Start with a story and it will appear here as you work." action="Write a story" onAction={() => go('/create/works/new')} />
            </div>
          ) : (
            <div className="divide-y divide-border">
              {recent.map((work) => (
                <article key={work.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-4">
                  <WorkCover src={work.coverImageUrl} title={work.title} className="size-12 rounded-lg" />
                  <div className="min-w-0 flex-1">
                    <Link href={`/create/works/${work.id}`} className="block truncate text-sm font-bold hover:text-accent">{work.title}</Link>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span className="rounded-full bg-secondary px-2 py-0.5 capitalize">{work.type}</span>
                      <span className="rounded-full bg-secondary px-2 py-0.5">{work.status}</span>
                      <span>{work.chapters?.length ?? 0} chapters</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Link href={`/create/works/${work.id}`} className="inline-flex min-h-9 items-center rounded-full bg-accent px-3 text-xs font-bold text-accent-foreground hover:brightness-95">
                      {work.type === 'story' ? 'Continue writing' : 'Manage'}
                    </Link>
                  </div>
                </article>
              ))}
              <div className="pt-3 text-center">
                <Link href="/create/works" className="text-xs font-bold text-accent hover:underline">See all your works</Link>
              </div>
            </div>
          )}
        </Panel>

        <aside className="flex flex-col gap-3">
          <Panel className="p-4">
            <h2 className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Start something new</h2>
            <div className="mt-3 flex flex-col gap-2">
              <button type="button" onClick={() => go('/create/works/new')} className="rounded-xl border border-border bg-secondary/60 p-3 text-left transition hover:border-accent/50">
                <span className="block text-sm font-bold">Write a story</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">Build it chapter by chapter</span>
              </button>
              <div className="rounded-xl border border-border/70 bg-muted/50 p-3" aria-disabled="true">
                <span className="block text-sm font-bold text-muted-foreground">Publish a comic</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">Unavailable while comic image hosting is unsupported</span>
              </div>
              <div className="rounded-xl border border-border/70 bg-muted/50 p-3" aria-disabled="true">
                <span className="block text-sm font-bold text-muted-foreground">Share artwork</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">Standalone artwork publishing is coming later</span>
              </div>
            </div>
          </Panel>

          <Panel className="p-4">
            <h2 className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Make your profile shine</h2>
            <ul className="mt-3 flex flex-col gap-2.5">
              {profileSteps.map((step) => (
                <li key={step.label}>
                  <Link href="/settings/account" className="flex items-center gap-2 text-xs hover:text-accent">
                    {step.done ? <Check className="size-4 shrink-0 text-accent" aria-label="Complete" /> : <Circle className="size-4 shrink-0 text-muted-foreground" aria-label="Incomplete" />}
                    <span>{step.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>

          <div className="rounded-2xl bg-primary p-4 text-primary-foreground">
            <h2 className="font-serif text-xl font-bold">Need a cover artist or co-writer?</h2>
            <p className="mt-1 text-xs leading-5 text-primary-foreground/75">Meet creators and find your next creative partner.</p>
            <Link href="/collaborate" className="mt-3 inline-flex min-h-9 items-center rounded-full bg-background px-3 text-xs font-bold text-foreground hover:bg-secondary">
              Find collaborators <Heart className="ml-1.5 size-3.5" aria-hidden="true" />
            </Link>
          </div>
        </aside>
      </div>
    </CreatorFrame>
  )
}
