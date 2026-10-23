'use client'

import Image from 'next/image'
import { useEffect, useMemo, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Bookmark, BookOpen, Brush, LoaderCircle, Search, UsersRound } from 'lucide-react'
import { EmptyState } from '@/components/shared/empty-state'
import { Button } from '@/components/ui/button'
import { getSupabaseClient } from '@/lib/supabase'
import { useAppState } from '@/lib/app-state'
import type { BrowseCreator, BrowsePageData } from '@/lib/browse-data'
import type { Work } from '@/lib/types'
import { WorkMoodSelector } from '@/components/shared/work-mood-selector'
import { normalizeWorkLanguage, WORK_GENRES, WORK_LANGUAGES, WORK_MOODS } from '@/lib/work-taxonomy'

type BrowseTab = 'Stories' | 'Comics' | 'Authors'
type WorkSort = 'newest' | 'oldest' | 'title'
type CreatorFilter = 'All' | 'Writers' | 'Artists' | 'Open for collaboration'
type CreatorSort = 'followers' | 'works' | 'name'

const WORK_TABS: BrowseTab[] = ['Stories', 'Comics', 'Authors']
const WORK_COLORS = ['bg-[#7c3b24]', 'bg-[#3f2117]', 'bg-[#c9782d]', 'bg-[#8b6a4b]', 'bg-[#59321f]', 'bg-[#a3482c]', 'bg-[#b88a51]']
const CREATOR_FILTERS: CreatorFilter[] = ['All', 'Writers', 'Artists', 'Open for collaboration']

function roleLabels(roles: string[]) {
  return roles
    .filter((role) => role === 'writer' || role === 'artist')
    .map((role) => role === 'writer' ? 'Writer' : 'Artist')
}

function chipClass(active: boolean) {
  return `inline-flex min-h-10 shrink-0 items-center rounded-full border px-3 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
    active
      ? 'border-primary bg-primary text-primary-foreground'
      : 'border-border bg-card text-foreground hover:border-accent hover:text-accent'
  }`
}

function FilterRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
      <span className="w-20 shrink-0 pt-3 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{label}</span>
      <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">{children}</div>
    </div>
  )
}

function AuthorCard({
  creator,
  following,
  pending,
  ownProfile,
  onFollow,
}: {
  creator: BrowseCreator
  following: boolean
  pending: boolean
  ownProfile: boolean
  onFollow: (creator: BrowseCreator) => void
}) {
  const roles = roleLabels(creator.roles)

  return (
    <article className="flex min-w-0 flex-col rounded-2xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md sm:p-5">
      <div className="flex items-center gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-secondary font-serif text-lg font-bold text-accent" aria-hidden="true">
          {creator.displayName.trim().charAt(0).toLocaleUpperCase() || '?'}
        </span>
        <div className="min-w-0">
          <h2 className="truncate font-serif text-lg font-bold">{creator.displayName}</h2>
          <p className="truncate text-xs text-muted-foreground">@{creator.username}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {roles.map((role) => <span key={role} className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide">{role}</span>)}
        {creator.writingLanguages.slice(0, 2).map((language) => <span key={language} className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-semibold">{language}</span>)}
        {creator.openForCollaboration && <span className="rounded-full bg-accent/10 px-2.5 py-1 text-[10px] font-bold text-accent">Open to collaborate</span>}
      </div>
      <p className="mt-3 line-clamp-2 min-h-10 text-sm leading-5 text-muted-foreground">
        {creator.bio || 'Walang bio sa ngayon—kilalanin pa ang creator sa profile niya.'}
      </p>
      {creator.workCount !== null && creator.followerCount !== null ? (
        <p className="mt-3 text-xs font-semibold text-muted-foreground">
          {creator.workCount} {creator.workCount === 1 ? 'work' : 'works'} <span aria-hidden="true">·</span> {creator.followerCount} {creator.followerCount === 1 ? 'follower' : 'followers'}
        </p>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">Work and follower totals need database setup.</p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onFollow(creator)}
          disabled={pending || ownProfile}
          aria-pressed={following}
          className={`inline-flex min-h-11 flex-1 items-center justify-center rounded-full px-4 text-xs font-bold transition disabled:opacity-60 ${
            following ? 'border border-border bg-card hover:border-destructive hover:text-destructive' : 'bg-accent text-accent-foreground hover:brightness-95'
          }`}
        >
          {ownProfile ? 'Your profile' : pending ? 'Saving…' : following ? 'Following' : 'Follow'}
        </button>
        <Link href={`/profile/${creator.id}`} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full border border-border px-4 text-xs font-bold hover:border-accent hover:text-accent">
          View profile
        </Link>
      </div>
    </article>
  )
}

function WorkCard({
  work,
  index,
  saved,
  pending,
  onSave,
}: {
  work: Work
  index: number
  saved: boolean
  pending: boolean
  onSave: (workId: string) => void
}) {
  return (
    <article className="group min-w-0">
      <Link href={`/works/${work.id}?chapter=1`} className="block rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">
        <div className={`relative aspect-[.72] overflow-hidden rounded-2xl ${WORK_COLORS[index % WORK_COLORS.length]}`}>
          {work.coverImageUrl ? (
            <Image
              src={work.coverImageUrl}
              alt={`${work.title} cover`}
              fill
              sizes="(max-width: 640px) 45vw, (max-width: 1024px) 28vw, 18vw"
              unoptimized
              className="object-cover transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center p-5 text-center text-primary-foreground/80" aria-hidden="true">
              {work.type === 'story' ? <BookOpen className="size-10 opacity-60" /> : <Brush className="size-10 opacity-60" />}
            </div>
          )}
          <span className="absolute left-3 top-3 rounded-full bg-background/85 px-2.5 py-1 text-[10px] font-bold text-foreground">
            {work.genre || (work.type === 'story' ? 'Story' : 'Comic')}
          </span>
        </div>
        <div className="pt-3">
          <h2 className="truncate font-serif text-base font-bold group-hover:text-accent">{work.title}</h2>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">ni {work.authorName ?? 'StoryLines creator'}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {[work.language, work.status === 'Complete' ? 'Kumpleto' : 'Ongoing'].filter(Boolean).join(' · ')}
          </p>
          {work.moods?.length ? (
            <p className="mt-1 truncate text-[11px] font-medium text-accent">{work.moods.join(' · ')}</p>
          ) : null}
        </div>
      </Link>
      <button
        type="button"
        onClick={() => onSave(work.id)}
        disabled={pending}
        aria-pressed={saved}
        className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-border bg-card px-3 text-xs font-bold hover:border-accent hover:text-accent disabled:opacity-60"
      >
        <Bookmark className={`size-4 ${saved ? 'fill-current' : ''}`} aria-hidden="true" />
        {saved ? 'Saved to library' : 'Save to library'}
      </button>
    </article>
  )
}

export function BrowseView({ initialData }: { initialData: BrowsePageData }) {
  const [tab, setTab] = useState<BrowseTab>('Stories')
  const [query, setQuery] = useState('')
  const [genre, setGenre] = useState('All')
  const [language, setLanguage] = useState('All')
  const [selectedMoods, setSelectedMoods] = useState<string[]>([])
  const [status, setStatus] = useState<'All' | 'Ongoing' | 'Complete'>('All')
  const [sort, setSort] = useState<WorkSort>('newest')
  const [creatorFilter, setCreatorFilter] = useState<CreatorFilter>('All')
  const [creatorLanguage, setCreatorLanguage] = useState('All')
  const [creatorSort, setCreatorSort] = useState<CreatorSort>('followers')
  const [works, setWorks] = useState(initialData.works)
  const [workCursor, setWorkCursor] = useState(initialData.workCursor)
  const [hasMoreWorks, setHasMoreWorks] = useState(initialData.hasMoreWorks)
  const [loadingMoreWorks, setLoadingMoreWorks] = useState(false)
  const [moreWorksError, setMoreWorksError] = useState<string | null>(null)
  const [creators, setCreators] = useState(initialData.creators)
  const [creatorCursor, setCreatorCursor] = useState(initialData.creatorCursor)
  const [hasMoreCreators, setHasMoreCreators] = useState(initialData.hasMoreCreators)
  const [loadingMoreCreators, setLoadingMoreCreators] = useState(false)
  const [moreCreatorsError, setMoreCreatorsError] = useState<string | null>(null)
  const [savedWorkIds, setSavedWorkIds] = useState<string[]>([])
  const [followingCreatorIds, setFollowingCreatorIds] = useState<string[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [followerCounts, setFollowerCounts] = useState<Record<string, number | null>>(
    () => Object.fromEntries(initialData.creators.map((creator) => [creator.id, creator.followerCount])),
  )
  const [savingWorkId, setSavingWorkId] = useState<string | null>(null)
  const [followingCreatorId, setFollowingCreatorId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isLoggedIn, hydrated: authHydrated, requireAuth } = useAppState()
  const urlQuery = searchParams.get('search') ?? ''
  const normalizedQuery = urlQuery.trim().toLocaleLowerCase()

  useEffect(() => {
    setQuery(urlQuery)
  }, [urlQuery])

  useEffect(() => {
    setWorks(initialData.works)
    setWorkCursor(initialData.workCursor)
    setHasMoreWorks(initialData.hasMoreWorks)
    setCreators(initialData.creators)
    setCreatorCursor(initialData.creatorCursor)
    setHasMoreCreators(initialData.hasMoreCreators)
  }, [initialData])

  useEffect(() => {
    setFollowerCounts(Object.fromEntries(creators.map((creator) => [creator.id, creator.followerCount])))
  }, [creators])

  useEffect(() => {
    if (!authHydrated || !isLoggedIn) {
      setSavedWorkIds([])
      setFollowingCreatorIds([])
      setCurrentUserId(null)
      return
    }
    let active = true
    void (async () => {
      const supabase = getSupabaseClient()
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError
      if (!user || !active) return
      setCurrentUserId(user.id)
      const [savedResult, followingResult] = await Promise.all([
        supabase.from('library_saved_works').select('work_id').eq('user_id', user.id),
        supabase.from('community_follows').select('creator_id').eq('follower_id', user.id),
      ])
      if (savedResult.error) throw savedResult.error
      if (followingResult.error) throw followingResult.error
      if (active) {
        setSavedWorkIds(savedResult.data.map((item) => item.work_id))
        setFollowingCreatorIds(followingResult.data.map((item) => item.creator_id))
      }
    })().catch((error: unknown) => {
      if (active) setActionError(error instanceof Error ? error.message : 'Hindi ma-load ang iyong library at mga sinusundan.')
    })
    return () => {
      active = false
    }
  }, [authHydrated, isLoggedIn])

  const storyWorks = useMemo(() => works.filter((work) => work.type === 'story'), [works])
  const comicWorks = useMemo(() => works.filter((work) => work.type === 'comic'), [works])
  const selectedWorks = tab === 'Stories' ? storyWorks : comicWorks
  const genres = useMemo(() => {
    const known = new Set<string>(WORK_GENRES)
    const additional = Array.from(new Set(selectedWorks.map((work) => work.genre).filter((value): value is string => Boolean(value))))
      .filter((value) => !known.has(value))
      .sort()
    return [...WORK_GENRES, ...additional]
  }, [selectedWorks])
  const languages = useMemo(() => {
    const known = new Set<string>(WORK_LANGUAGES)
    const additional = Array.from(new Set(selectedWorks.map((work) => work.language ? normalizeWorkLanguage(work.language) : undefined).filter((value): value is string => Boolean(value))))
      .filter((value) => !known.has(value))
      .sort()
    return [...WORK_LANGUAGES, ...additional]
  }, [selectedWorks])
  const creatorLanguages = useMemo(() => Array.from(new Set(creators.flatMap((creator) => creator.writingLanguages))).sort(), [creators])

  const matchingWorks = useMemo(() => selectedWorks
    .filter((work) => {
      if (genre !== 'All' && work.genre !== genre) return false
      if (language !== 'All' && normalizeWorkLanguage(work.language) !== language) return false
      if (status !== 'All' && work.status !== status) return false
      if (selectedMoods.length && !selectedMoods.every((mood) => work.moods?.includes(mood))) return false
      if (!normalizedQuery) return true
      return [work.title, work.synopsis, work.genre, work.language, work.authorName]
        .some((value) => value?.toLocaleLowerCase().includes(normalizedQuery))
    })
    .sort((first, second) => {
      if (sort === 'title') return first.title.localeCompare(second.title)
      return sort === 'newest' ? second.createdAt - first.createdAt : first.createdAt - second.createdAt
    }), [selectedWorks, genre, language, status, selectedMoods, normalizedQuery, sort])

  const matchingCreators = useMemo(() => creators
    .filter((creator) => {
      if (creatorFilter === 'Writers' && !creator.roles.includes('writer')) return false
      if (creatorFilter === 'Artists' && !creator.roles.includes('artist')) return false
      if (creatorFilter === 'Open for collaboration' && !creator.openForCollaboration) return false
      if (creatorLanguage !== 'All' && !creator.writingLanguages.includes(creatorLanguage)) return false
      if (!normalizedQuery) return true
      return [creator.displayName, creator.username, creator.bio, ...creator.favoriteGenres, ...creator.writingLanguages]
        .some((value) => value?.toLocaleLowerCase().includes(normalizedQuery))
    })
    .sort((first, second) => {
      if (creatorSort === 'name') return first.displayName.localeCompare(second.displayName)
      if (creatorSort === 'works') {
        if (first.workCount === null || second.workCount === null) return first.displayName.localeCompare(second.displayName)
        return second.workCount - first.workCount
      }
      if (followerCounts[first.id] === null || followerCounts[second.id] === null) {
        return first.displayName.localeCompare(second.displayName)
      }
      return (followerCounts[second.id] ?? second.followerCount ?? 0) - (followerCounts[first.id] ?? first.followerCount ?? 0)
    }), [creators, creatorFilter, creatorLanguage, normalizedQuery, creatorSort, followerCounts])

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const search = query.trim()
    router.push(search ? `/browse?search=${encodeURIComponent(search)}` : '/browse')
  }

  function selectTab(nextTab: BrowseTab) {
    setTab(nextTab)
    setGenre('All')
    setLanguage('All')
    setStatus('All')
    setSelectedMoods([])
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const currentIndex = WORK_TABS.indexOf(tab)
    let nextIndex = currentIndex
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % WORK_TABS.length
    else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + WORK_TABS.length) % WORK_TABS.length
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = WORK_TABS.length - 1
    else return
    event.preventDefault()
    selectTab(WORK_TABS[nextIndex])
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex].focus()
  }

  async function loadMoreWorks() {
    if (!workCursor || loadingMoreWorks) return
    setLoadingMoreWorks(true)
    setMoreWorksError(null)
    try {
      const supabase = getSupabaseClient()
      const { data, error } = await supabase
        .from('creator_works')
        .select('id, author_id, title, type, synopsis, genre, moods, language, status, cover_image_url, created_at')
        .in('type', ['story', 'comic'])
        .neq('status', 'Draft')
        .or(`created_at.lt.${workCursor.createdAt},and(created_at.eq.${workCursor.createdAt},id.lt.${workCursor.id})`)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(21)
      if (error) throw error

      const pageWorks = data.slice(0, 20)
      const hasMore = data.length > 20
      const lastWork = pageWorks.at(-1)
      const authorIds = Array.from(new Set(pageWorks.map((work) => work.author_id)))
      const authorProfilesResult = authorIds.length
        ? await supabase.from('profiles').select('id, display_name').in('id', authorIds)
        : { data: [], error: null }
      if (authorProfilesResult.error) throw authorProfilesResult.error
      const authorNames = new Map(authorProfilesResult.data.map((profile) => [profile.id, profile.display_name]))
      setWorks((current) => [
        ...current,
        ...pageWorks.map((work) => ({
          id: work.id,
          authorId: work.author_id,
          title: work.title,
          type: work.type as 'story' | 'comic',
          synopsis: work.synopsis,
          genre: work.genre ?? undefined,
          moods: work.moods ?? [],
          language: work.language ? normalizeWorkLanguage(work.language) : undefined,
          coverImageUrl: work.cover_image_url ?? undefined,
          authorName: authorNames.get(work.author_id) ?? 'StoryLines creator',
          status: work.status as 'Ongoing' | 'Complete',
          createdAt: new Date(work.created_at).getTime(),
        })),
      ])
      setHasMoreWorks(hasMore)
      setWorkCursor(hasMore && lastWork ? { createdAt: lastWork.created_at, id: lastWork.id } : null)
    } catch (error) {
      setMoreWorksError(error instanceof Error ? error.message : 'Hindi ma-load ang susunod na mga gawa. Subukan ulit.')
    } finally {
      setLoadingMoreWorks(false)
    }
  }

  async function loadMoreCreators() {
    if (!creatorCursor || loadingMoreCreators) return
    setLoadingMoreCreators(true)
    setMoreCreatorsError(null)
    try {
      const supabase = getSupabaseClient()
      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, username, roles, bio, writing_languages, favorite_genres, open_for_collaboration, created_at')
        .overlaps('roles', ['writer', 'artist'])
        .or(`created_at.lt.${creatorCursor.createdAt},and(created_at.eq.${creatorCursor.createdAt},id.lt.${creatorCursor.id})`)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(21)
      if (error) throw error

      const pageCreators = data.slice(0, 20)
      const hasMore = data.length > 20
      const lastCreator = pageCreators.at(-1)
      const statsResult = pageCreators.length
        ? await supabase.rpc('get_browse_creator_stats', { p_profile_ids: pageCreators.map((creator) => creator.id) })
        : { data: [], error: null }
      const statsById = new Map<string, { follower_count: number | string; work_count: number | string }>()
      if (statsResult.error) {
        const missingFunction = typeof statsResult.error === 'object' && 'code' in statsResult.error
          && String(Reflect.get(statsResult.error, 'code')) === 'PGRST202'
        if (!missingFunction) throw statsResult.error
        setMoreCreatorsError('Naka-display ang mga creator, pero hindi pa naka-setup ang follower at work counts.')
      } else {
        for (const stat of statsResult.data ?? []) {
          statsById.set(stat.profile_id, stat)
        }
      }

      const newCreators: BrowseCreator[] = pageCreators.map((creator) => {
        const stats = statsById.get(creator.id)
        return {
          id: creator.id,
          displayName: creator.display_name,
          username: creator.username,
          roles: creator.roles ?? [],
          bio: creator.bio ?? '',
          writingLanguages: Array.from(new Set((creator.writing_languages ?? []).filter(Boolean).map(normalizeWorkLanguage))),
          favoriteGenres: creator.favorite_genres ?? [],
          openForCollaboration: creator.open_for_collaboration ?? false,
          followerCount: stats ? Number(stats.follower_count) : null,
          workCount: stats ? Number(stats.work_count) : null,
        }
      })
      setCreators((current) => [...current, ...newCreators])
      setHasMoreCreators(hasMore)
      setCreatorCursor(hasMore && lastCreator ? { createdAt: lastCreator.created_at, id: lastCreator.id } : null)
    } catch (error) {
      setMoreCreatorsError(error instanceof Error ? error.message : 'Hindi ma-load ang susunod na mga creator. Subukan ulit.')
    } finally {
      setLoadingMoreCreators(false)
    }
  }

  async function toggleSavedWork(workId: string) {
    if (!isLoggedIn) {
      requireAuth('/browse')
      return
    }
    const wasSaved = savedWorkIds.includes(workId)
    setActionError(null)
    setSavingWorkId(workId)
    setSavedWorkIds((current) => wasSaved ? current.filter((id) => id !== workId) : [...current, workId])
    try {
      const supabase = getSupabaseClient()
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError
      if (!user) throw new Error('Mag-log in para mag-save ng gawa.')
      const result = wasSaved
        ? await supabase.from('library_saved_works').delete().eq('user_id', user.id).eq('work_id', workId)
        : await supabase.from('library_saved_works').insert({ user_id: user.id, work_id: workId })
      if (result.error) throw result.error
    } catch (error) {
      setSavedWorkIds((current) => wasSaved ? [...current, workId] : current.filter((id) => id !== workId))
      setActionError(error instanceof Error ? error.message : 'Hindi na-update ang iyong library.')
    } finally {
      setSavingWorkId(null)
    }
  }

  async function toggleFollow(creator: BrowseCreator) {
    if (!isLoggedIn) {
      requireAuth('/browse')
      return
    }
    if (followingCreatorId === creator.id) return
    const wasFollowing = followingCreatorIds.includes(creator.id)
    setActionError(null)
    setFollowingCreatorId(creator.id)
    setFollowingCreatorIds((current) => wasFollowing ? current.filter((id) => id !== creator.id) : [...current, creator.id])
    setFollowerCounts((current) => {
      const count = current[creator.id] ?? creator.followerCount
      return count === null ? current : { ...current, [creator.id]: Math.max(0, count + (wasFollowing ? -1 : 1)) }
    })
    try {
      const supabase = getSupabaseClient()
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError
      if (!user) throw new Error('Mag-log in para sumubaybay sa creator.')
      if (user.id === creator.id) throw new Error('Hindi mo maaaring i-follow ang sarili mong profile.')
      const result = wasFollowing
        ? await supabase.from('community_follows').delete().eq('follower_id', user.id).eq('creator_id', creator.id)
        : await supabase.from('community_follows').insert({ follower_id: user.id, creator_id: creator.id })
      if (result.error) throw result.error
    } catch (error) {
      setFollowingCreatorIds((current) => wasFollowing ? [...current, creator.id] : current.filter((id) => id !== creator.id))
      setFollowerCounts((current) => {
        const count = current[creator.id] ?? creator.followerCount
        return count === null ? current : { ...current, [creator.id]: Math.max(0, count + (wasFollowing ? 1 : -1)) }
      })
      setActionError(error instanceof Error ? error.message : 'Hindi na-update ang follow status.')
    } finally {
      setFollowingCreatorId(null)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 sm:gap-7">
      <header>
        <span className="eyebrow">Mga bukas na pahina</span>
        <h1 className="mt-2 font-serif text-4xl font-bold text-balance sm:text-5xl">
          {tab === 'Authors' ? 'Kilalanin ang mga creator.' : 'Tuklasin ang mga kuwento.'}
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {tab === 'Authors' ? 'Hanapin ang mga writer at artist na susubaybayan o makakatuwang mo.' : 'Pumili ayon sa genre, wika, o mundong gusto mong pasukin.'}
        </p>
      </header>

      <form onSubmit={submitSearch} role="search" className="flex min-h-12 w-full max-w-2xl items-center gap-2 rounded-full border border-border bg-card p-1.5 pl-4 shadow-sm focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
        <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <label className="sr-only" htmlFor="browse-search">{tab === 'Authors' ? 'Maghanap ng author' : 'Maghanap ng kuwento o komiks'}</label>
        <input
          id="browse-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={tab === 'Authors' ? 'Hanap pangalan, username, o genre...' : 'Hanap pamagat, author, genre, o keyword...'}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        <Button type="submit" className="min-h-10 rounded-full bg-accent px-5 text-accent-foreground hover:bg-accent/90">
          Hanapin
        </Button>
      </form>

      <div role="tablist" aria-label="Browse categories" onKeyDown={handleTabKeyDown} className="flex gap-5 overflow-x-auto border-b border-border">
        {WORK_TABS.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            id={`browse-tab-${item.toLowerCase()}`}
            aria-controls={`browse-panel-${item.toLowerCase()}`}
            aria-selected={tab === item}
            tabIndex={tab === item ? 0 : -1}
            onClick={() => selectTab(item)}
            className={`min-h-11 shrink-0 border-b-2 px-1 text-sm font-bold ${tab === item ? 'border-accent text-accent' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            {item}
          </button>
        ))}
      </div>

      {actionError && <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">{actionError}</p>}
      {initialData.error ? (
        <div role="alert" className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-serif text-xl font-bold">Hindi ma-load ang browse page</h2>
          <p className="mt-2 text-sm text-muted-foreground">{initialData.error}</p>
          <button type="button" onClick={() => router.refresh()} className="mt-4 min-h-11 rounded-full bg-accent px-4 text-sm font-bold text-accent-foreground">Subukan ulit</button>
        </div>
      ) : tab === 'Authors' ? (
        <section role="tabpanel" id="browse-panel-authors" aria-labelledby="browse-tab-authors" tabIndex={0} className="flex flex-col gap-5">
          <div className="flex flex-col gap-4 rounded-2xl border border-border bg-background/60 p-4 sm:p-5">
            <FilterRow label="Creators">
              {CREATOR_FILTERS.map((item) => (
                <button key={item} type="button" aria-pressed={creatorFilter === item} onClick={() => setCreatorFilter(item)} className={chipClass(creatorFilter === item)}>{item}</button>
              ))}
            </FilterRow>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
              <label className="flex min-h-11 items-center gap-2 rounded-full border border-border bg-card px-3 text-xs font-bold">
                Language
                <select value={creatorLanguage} onChange={(event) => setCreatorLanguage(event.target.value)} aria-label="Filter creators by language" className="max-w-32 bg-transparent text-xs outline-none">
                  <option value="All">All</option>
                  {creatorLanguages.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label className="flex min-h-11 items-center gap-2 rounded-full border border-border bg-card px-3 text-xs font-bold">
                Sort
                <select value={creatorSort} onChange={(event) => setCreatorSort(event.target.value as CreatorSort)} aria-label="Sort creators" className="max-w-36 bg-transparent text-xs outline-none">
                  <option value="followers" disabled={Boolean(initialData.creatorsError)}>Most followed</option>
                  <option value="works" disabled={Boolean(initialData.creatorsError)}>Most works</option>
                  <option value="name">Name A–Z</option>
                </select>
              </label>
            </div>
          </div>
          {(initialData.creatorsError || moreCreatorsError) && <p role="status" className="rounded-xl border border-border bg-secondary/60 px-4 py-3 text-sm text-muted-foreground">{moreCreatorsError ?? initialData.creatorsError}</p>}
          {matchingCreators.length ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {matchingCreators.map((creator) => (
                <AuthorCard
                  key={creator.id}
                  creator={{ ...creator, followerCount: followerCounts[creator.id] ?? creator.followerCount }}
                  following={followingCreatorIds.includes(creator.id)}
                  pending={followingCreatorId === creator.id}
                  ownProfile={currentUserId === creator.id}
                  onFollow={(selected) => void toggleFollow(selected)}
                />
              ))}
            </div>
          ) : initialData.creatorsError ? (
            <button type="button" onClick={() => router.refresh()} className="min-h-11 self-center rounded-full border border-border px-5 text-sm font-bold hover:border-accent">Subukan ulit</button>
          ) : (
            <EmptyState
              icon={<UsersRound />}
              title={normalizedQuery ? `Walang author na tugma sa "${urlQuery}"` : 'Wala pang creator sa directory'}
              message={normalizedQuery ? 'Subukan ang ibang pangalan, username, wika, o genre.' : 'Dito lalabas ang mga writer at artist kapag kumpleto na ang kanilang profile.'}
              action={normalizedQuery ? 'I-clear ang paghahanap' : undefined}
              onAction={normalizedQuery ? () => router.push('/browse') : undefined}
            />
          )}
          {moreCreatorsError && initialData.creatorsError === null && <p role="alert" className="text-sm text-destructive">{moreCreatorsError}</p>}
          {hasMoreCreators && (
            <button
              type="button"
              onClick={() => void loadMoreCreators()}
              disabled={loadingMoreCreators}
              className="inline-flex min-h-11 self-center items-center justify-center gap-2 rounded-full border border-foreground/60 bg-card px-5 text-sm font-bold hover:border-accent hover:text-accent disabled:opacity-60"
            >
              {loadingMoreCreators && <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
              {loadingMoreCreators ? 'Naglo-load…' : 'Magpakita pa ng creators'}
            </button>
          )}
        </section>
      ) : (
        <section role="tabpanel" id={`browse-panel-${tab.toLowerCase()}`} aria-labelledby={`browse-tab-${tab.toLowerCase()}`} tabIndex={0} className="flex flex-col gap-5">
          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-background/60 p-4 sm:p-5">
            <FilterRow label="Mood">
              {WORK_MOODS.map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={selectedMoods.includes(item)}
                  onClick={() => setSelectedMoods((current) => current.includes(item) ? current.filter((mood) => mood !== item) : [...current, item])}
                  className={chipClass(selectedMoods.includes(item))}
                >
                  {item}
                </button>
              ))}
            </FilterRow>
            <FilterRow label="Genre">
              {['All', ...genres].map((item) => (
                <button key={item} type="button" aria-pressed={genre === item} onClick={() => setGenre(item)} className={chipClass(genre === item)}>{item}</button>
              ))}
            </FilterRow>
            <FilterRow label="Language">
              {['All', ...languages].map((item) => (
                <button key={item} type="button" aria-pressed={language === item} onClick={() => setLanguage(item)} className={chipClass(language === item)}>{item}</button>
              ))}
            </FilterRow>
            <div className="flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
              <FilterRow label="Status">
                {(['All', 'Ongoing', 'Complete'] as const).map((item) => (
                  <button key={item} type="button" aria-pressed={status === item} onClick={() => setStatus(item)} className={chipClass(status === item)}>{item === 'All' ? 'All' : item === 'Ongoing' ? 'Ongoing' : 'Completed'}</button>
                ))}
              </FilterRow>
              <label className="flex min-h-11 shrink-0 items-center gap-2 self-start rounded-full border border-border bg-card px-3 text-xs font-bold sm:self-auto">
                Sort
                <select value={sort} onChange={(event) => setSort(event.target.value as WorkSort)} aria-label="Sort works" className="max-w-36 bg-transparent text-xs outline-none">
                  <option value="newest">Newest</option>
                  <option value="oldest">Oldest</option>
                  <option value="title">Title A–Z</option>
                </select>
              </label>
            </div>
          </div>
          {matchingWorks.length ? (
            <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {matchingWorks.map((work, index) => (
                <WorkCard
                  key={work.id}
                  work={work}
                  index={index}
                  saved={savedWorkIds.includes(work.id)}
                  pending={savingWorkId === work.id}
                  onSave={(workId) => void toggleSavedWork(workId)}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={tab === 'Stories' ? <BookOpen /> : <Brush />}
              title={normalizedQuery || genre !== 'All' || language !== 'All' || status !== 'All' || selectedMoods.length ? 'Walang tugmang nailathalang gawa' : `Wala pang nailathalang ${tab === 'Stories' ? 'kuwento' : 'komiks'}`}
              message={normalizedQuery ? `Walang nakitang gawa para sa “${urlQuery}”. Subukan ang ibang pamagat, genre, wika, o keyword.` : 'Dito lalabas ang mga gawa kapag may nag-publish na creators sa StoryLines.'}
              action={genre !== 'All' || language !== 'All' || status !== 'All' || selectedMoods.length ? 'I-reset ang filters' : undefined}
              onAction={genre !== 'All' || language !== 'All' || status !== 'All' || selectedMoods.length ? () => { setGenre('All'); setLanguage('All'); setStatus('All'); setSelectedMoods([]) } : undefined}
            />
          )}
          {moreWorksError && <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">{moreWorksError}</p>}
          {hasMoreWorks && (
            <button
              type="button"
              onClick={() => void loadMoreWorks()}
              disabled={loadingMoreWorks}
              className="inline-flex min-h-11 self-center items-center justify-center gap-2 rounded-full border border-foreground/60 bg-card px-5 text-sm font-bold hover:border-accent hover:text-accent disabled:opacity-60"
            >
              {loadingMoreWorks && <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
              {loadingMoreWorks ? 'Naglo-load…' : `Magpakita pa ng mga ${tab === 'Stories' ? 'kuwento' : 'komiks'}`}
            </button>
          )}
        </section>
      )}
    </div>
  )
}
