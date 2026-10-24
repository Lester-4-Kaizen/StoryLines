'use client'

import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { BookMarked, Clock3, Heart, LoaderCircle, Trash2 } from 'lucide-react'
import { EmptyState } from '@/components/shared/empty-state'
import { Panel } from '@/components/shared/panel'
import { getSupabaseClient } from '@/lib/supabase'
import type { LibraryPageData, LibraryWork } from '@/lib/library-data'

type LibraryTab = 'Saved' | 'Liked' | 'History'
type WorkFilter = 'All' | 'Stories' | 'Comics' | 'With new chapters'
type WorkSort = 'recent' | 'title' | 'updated'

function readerHref(work: LibraryWork, chapterNumber?: number | null) {
  return chapterNumber ? `/works/${work.id}?chapter=${chapterNumber}` : `/works/${work.id}`
}

function workHasNewChapter(work: LibraryWork) {
  return work.latestChapterNumber > (work.resumeChapterNumber ?? 0)
}

function Cover({ work, className = '' }: { work: LibraryWork; className?: string }) {
  const coverStyle = work.coverImageUrl
    ? { backgroundImage: `linear-gradient(180deg, transparent 35%, rgb(0 0 0 / 55%)), url("${work.coverImageUrl}")` }
    : undefined

  return (
    <div
      aria-hidden="true"
      className={`relative overflow-hidden rounded-xl bg-primary ${work.type === 'comic' ? 'bg-accent' : ''} ${className}`}
      style={coverStyle}
    >
      {!work.coverImageUrl && (
        <span className="absolute inset-0 bg-gradient-to-br from-white/10 to-black/10" />
      )}
      {workHasNewChapter(work) && (
        <span className="absolute bottom-2 left-2 rounded-full bg-black/75 px-2 py-1 text-[10px] font-bold text-white">
          May bagong kabanata
        </span>
      )}
      <span className="absolute right-0 top-0 h-7 w-5 bg-accent [clip-path:polygon(0_0,100%_0,100%_100%,50%_74%,0_100%)]" />
    </div>
  )
}

function SavedWorkCard({
  work,
  onUnsave,
  disabled,
}: {
  work: LibraryWork
  onUnsave: (workId: string) => void
  disabled: boolean
}) {
  return (
    <article className="min-w-0">
      <Link href={readerHref(work)} className="group block rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
        <Cover work={work} className="aspect-[0.68] transition-transform group-hover:-translate-y-1 motion-reduce:transform-none motion-reduce:transition-none" />
        <h3 className="mt-2 line-clamp-2 font-serif text-sm font-bold leading-5 group-hover:text-accent">{work.title}</h3>
      </Link>
      <p className="truncate text-xs text-muted-foreground">
        {work.authorName}{work.authorUsername ? ` · @${work.authorUsername}` : ''}
      </p>
      <p className="truncate text-xs text-muted-foreground">
        {work.type === 'story' ? 'Story' : 'Comic'}{work.genre ? ` · ${work.genre}` : ''}
      </p>
      <button
        type="button"
        onClick={() => onUnsave(work.id)}
        disabled={disabled}
        className="mt-1 inline-flex min-h-11 items-center gap-1 rounded-md text-xs font-semibold text-muted-foreground hover:text-destructive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        aria-label={`Remove ${work.title} from saved works`}
      >
        <BookMarked className="size-3.5" aria-hidden="true" />
        Remove
      </button>
    </article>
  )
}

function LikedWorkCard({
  work,
  onUnlike,
  disabled,
}: {
  work: LibraryWork
  onUnlike: (workId: string) => void
  disabled: boolean
}) {
  return (
    <article className="min-w-0">
      <Link href={readerHref(work)} className="group block rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
        <Cover work={work} className="aspect-[0.68] transition-transform group-hover:-translate-y-1 motion-reduce:transform-none motion-reduce:transition-none" />
        <h3 className="mt-2 line-clamp-2 font-serif text-sm font-bold leading-5 group-hover:text-accent">{work.title}</h3>
      </Link>
      <p className="truncate text-xs text-muted-foreground">
        {work.authorName}{work.authorUsername ? ` · @${work.authorUsername}` : ''}
      </p>
      <p className="truncate text-xs text-muted-foreground">
        {work.type === 'story' ? 'Story' : 'Comic'}{work.genre ? ` · ${work.genre}` : ''}
      </p>
      <button
        type="button"
        onClick={() => onUnlike(work.id)}
        disabled={disabled}
        className="mt-1 inline-flex min-h-11 items-center gap-1 rounded-md text-xs font-semibold text-accent hover:text-destructive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
        aria-label={`Unlike ${work.title}`}
      >
        <Heart className="size-3.5 fill-current" aria-hidden="true" />
        Unlike
      </button>
    </article>
  )
}

function HistoryRow({
  work,
  onRemove,
  disabled,
}: {
  work: LibraryWork
  onRemove: (workId: string) => void
  disabled: boolean
}) {
  const chapter = work.resumeChapterNumber ?? 1
  return (
    <li className="flex items-center gap-3 border-t border-border py-3 first:border-t-0">
      <Cover work={work} className="size-12 shrink-0 rounded-md" />
      <div className="min-w-0 flex-1">
        <Link href={readerHref(work, chapter)} className="line-clamp-1 text-sm font-bold hover:text-accent">
          {work.title}
        </Link>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {work.lastReadAt ? new Date(work.lastReadAt).toLocaleDateString() : 'Kamakailan'}
          {' · '}Kabanata {chapter}
          {work.resumeChapterTitle ? `: ${work.resumeChapterTitle}` : ''}
        </p>
      </div>
      <Link
        href={readerHref(work, chapter)}
        className="inline-flex min-h-11 shrink-0 items-center rounded-full border border-border px-3 text-xs font-bold hover:border-accent hover:text-accent"
      >
        Resume
      </Link>
      <button
        type="button"
        onClick={() => onRemove(work.id)}
        disabled={disabled}
        aria-label={`Remove ${work.title} from reading history`}
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-destructive focus-visible:outline-2 focus-visible:outline-ring"
      >
        <span aria-hidden="true">×</span>
      </button>
    </li>
  )
}

export function LibraryView({ initialData }: { initialData: LibraryPageData }) {
  const router = useRouter()
  const [data, setData] = useState(initialData)
  const [tab, setTab] = useState<LibraryTab>('Saved')
  const [filter, setFilter] = useState<WorkFilter>('All')
  const [sort, setSort] = useState<WorkSort>('recent')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setData(initialData)
    setError(null)
  }, [initialData])

  const visibleSaved = useMemo(() => {
    const filtered = data.savedWorks.filter((work) => {
      if (filter === 'Stories') return work.type === 'story'
      if (filter === 'Comics') return work.type === 'comic'
      if (filter === 'With new chapters') return workHasNewChapter(work)
      return true
    })
    return [...filtered].sort((a, b) => {
      if (sort === 'title') return a.title.localeCompare(b.title)
      if (sort === 'updated') return (b.lastReadAt ?? b.savedAt ?? '').localeCompare(a.lastReadAt ?? a.savedAt ?? '')
      return (b.savedAt ?? '').localeCompare(a.savedAt ?? '')
    })
  }, [data.savedWorks, filter, sort])

  const visibleLiked = useMemo(() => {
    const filtered = data.likedWorks.filter((work) => {
      if (filter === 'Stories') return work.type === 'story'
      if (filter === 'Comics') return work.type === 'comic'
      if (filter === 'With new chapters') return workHasNewChapter(work)
      return true
    })
    return [...filtered].sort((a, b) => {
      if (sort === 'title') return a.title.localeCompare(b.title)
      if (sort === 'updated') return (b.lastReadAt ?? b.likedAt ?? '').localeCompare(a.lastReadAt ?? a.likedAt ?? '')
      return (b.likedAt ?? '').localeCompare(a.likedAt ?? '')
    })
  }, [data.likedWorks, filter, sort])

  const removeSavedWork = async (workId: string) => {
    if (busy) return
    const work = data.savedWorks.find((item) => item.id === workId)
    if (!work) return
    setError(null)
    setBusy(workId)
    setData((current) => ({ ...current, savedWorks: current.savedWorks.filter((item) => item.id !== workId) }))
    try {
      const { data: { user }, error: userError } = await getSupabaseClient().auth.getUser()
      if (userError) throw userError
      if (!user) throw new Error('Mag-log in para mapamahalaan ang iyong library.')
      const { error: deleteError } = await getSupabaseClient()
        .from('library_saved_works')
        .delete()
        .eq('user_id', user.id)
        .eq('work_id', workId)
      if (deleteError) throw deleteError
    } catch (actionError) {
      setData((current) => ({ ...current, savedWorks: [...current.savedWorks, work] }))
      setError(actionError instanceof Error ? actionError.message : 'Hindi maalis ang gawa. Subukan ulit.')
    } finally {
      setBusy(null)
    }
  }

  const unlikeWork = async (workId: string) => {
    if (busy) return
    const work = data.likedWorks.find((item) => item.id === workId)
    if (!work) return
    setError(null)
    setBusy(workId)
    setData((current) => ({ ...current, likedWorks: current.likedWorks.filter((item) => item.id !== workId) }))
    try {
      const { data: { user }, error: userError } = await getSupabaseClient().auth.getUser()
      if (userError) throw userError
      if (!user) throw new Error('Mag-log in para mapamahalaan ang mga nagustuhan mong gawa.')
      const { error: unlikeError } = await getSupabaseClient().rpc('toggle_creator_work_like', {
        p_work_id: workId,
        p_liked: false,
      })
      if (unlikeError) throw unlikeError
    } catch (actionError) {
      setData((current) => ({ ...current, likedWorks: [...current.likedWorks, work] }))
      setError(actionError instanceof Error ? actionError.message : 'Hindi maalis ang like. Subukan ulit.')
    } finally {
      setBusy(null)
    }
  }

  const removeHistoryItem = async (workId: string) => {
    if (busy) return
    const item = data.readingHistory.find((work) => work.id === workId)
    if (!item) return
    setError(null)
    setBusy(workId)
    setData((current) => ({
      ...current,
      readingHistory: current.readingHistory.filter((work) => work.id !== workId),
      continueReading: current.continueReading.filter((work) => work.id !== workId),
    }))
    try {
      const { data: { user }, error: userError } = await getSupabaseClient().auth.getUser()
      if (userError) throw userError
      if (!user) throw new Error('Mag-log in para mapamahalaan ang iyong reading history.')
      const { error: deleteError } = await getSupabaseClient()
        .from('library_reading_progress')
        .delete()
        .eq('user_id', user.id)
        .eq('work_id', workId)
      if (deleteError) throw deleteError
    } catch (actionError) {
      setData((current) => ({
        ...current,
        readingHistory: [...current.readingHistory, item],
        continueReading: current.continueReading.length < 3
          ? [...current.continueReading, item]
          : current.continueReading,
      }))
      setError(actionError instanceof Error ? actionError.message : 'Hindi maalis sa history. Subukan ulit.')
    } finally {
      setBusy(null)
    }
  }

  const clearHistory = async () => {
    if (data.readingHistory.length === 0 || busy) return
    setError(null)
    setBusy('clear-history')
    const previousHistory = data.readingHistory
    const previousContinue = data.continueReading
    const previousHasMoreHistory = data.hasMoreHistory
    const previousHistoryCursor = data.historyCursor
    setData((current) => ({
      ...current,
      readingHistory: [],
      continueReading: [],
      hasMoreHistory: false,
      historyCursor: null,
    }))
    try {
      const { data: { user }, error: userError } = await getSupabaseClient().auth.getUser()
      if (userError) throw userError
      if (!user) throw new Error('Mag-log in para mapamahalaan ang iyong reading history.')
      const { error: deleteError } = await getSupabaseClient()
        .from('library_reading_progress')
        .delete()
        .eq('user_id', user.id)
      if (deleteError) throw deleteError
    } catch (actionError) {
      setData((current) => ({
        ...current,
        readingHistory: previousHistory,
        continueReading: previousContinue,
        hasMoreHistory: previousHasMoreHistory,
        historyCursor: previousHistoryCursor,
      }))
      setError(actionError instanceof Error ? actionError.message : 'Hindi ma-clear ang history. Subukan ulit.')
    } finally {
      setBusy(null)
    }
  }

  const loadMoreSaved = async () => {
    if (!data.savedCursor || busy) return
    setBusy('load-more')
    setError(null)
    try {
      const supabase = getSupabaseClient()
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError
      if (!user) throw new Error('Mag-log in para makita ang iyong library.')
      const { data: savedRows, error: savedError } = await supabase
        .from('library_saved_works')
        .select('work_id, created_at')
        .eq('user_id', user.id)
        .or(`created_at.lt.${data.savedCursor.createdAt},and(created_at.eq.${data.savedCursor.createdAt},work_id.lt.${data.savedCursor.workId})`)
        .order('created_at', { ascending: false })
        .order('work_id', { ascending: false })
        .limit(25)
      if (savedError) throw savedError

      const workIds = savedRows.map((row) => row.work_id)
      if (!workIds.length) {
        setData((current) => ({ ...current, hasMoreSaved: false, savedCursor: null }))
        return
      }
      const [worksResult, summariesResult, progressResult] = await Promise.all([
        supabase
          .from('creator_works')
          .select('id, author_id, title, type, genre, cover_image_url')
          .in('id', workIds)
          .in('type', ['story', 'comic'])
          .neq('status', 'Draft'),
        supabase.rpc('get_published_work_chapter_summaries', { work_ids: workIds }),
        supabase
          .from('library_reading_progress')
          .select('work_id, chapter_id, last_read_at')
          .eq('user_id', user.id)
          .in('work_id', workIds),
      ])
      if (worksResult.error) throw worksResult.error
      if (summariesResult.error) throw summariesResult.error
      if (progressResult.error) throw progressResult.error

      const authorIds = Array.from(new Set(worksResult.data.map((work) => work.author_id)))
      const chapterIds = progressResult.data.map((progress) => progress.chapter_id)
      const [authorsResult, chaptersResult] = await Promise.all([
        authorIds.length
          ? supabase.from('profiles').select('id, display_name, username').in('id', authorIds)
          : Promise.resolve({ data: [], error: null }),
        chapterIds.length
          ? supabase.from('creator_work_chapters').select('id, chapter_number, title').in('id', chapterIds)
          : Promise.resolve({ data: [], error: null }),
      ])
      if (authorsResult.error) throw authorsResult.error
      if (chaptersResult.error) throw chaptersResult.error

      const authors = new Map(authorsResult.data.map((author) => [author.id, author]))
      const progressByWork = new Map(progressResult.data.map((progress) => [progress.work_id, progress]))
      const chapters = new Map(chaptersResult.data.map((chapter) => [chapter.id, chapter]))
      const loadedWorks = worksResult.data.flatMap((work) => {
        const author = authors.get(work.author_id)
        const progress = progressByWork.get(work.id)
        const chapter = progress ? chapters.get(progress.chapter_id) : undefined
        const summary = summariesResult.data.find((item: {
          work_id: string
          chapter_count: number
          latest_chapter_number: number
          latest_chapter_title: string
        }) => item.work_id === work.id)
        const savedAt = savedRows.find((row) => row.work_id === work.id)?.created_at ?? null
        return [{
          id: work.id,
          title: work.title,
          type: work.type as LibraryWork['type'],
          authorName: author?.display_name ?? 'StoryLines creator',
          authorUsername: author?.username ?? '',
          genre: work.genre,
          coverImageUrl: work.cover_image_url,
          savedAt,
          likedAt: null,
          lastReadAt: progress?.last_read_at ?? null,
          chapterCount: Number(summary?.chapter_count ?? 0),
          latestChapterNumber: summary?.latest_chapter_number ?? 0,
          latestChapterTitle: summary?.latest_chapter_title ?? null,
          resumeChapterNumber: chapter?.chapter_number ?? null,
          resumeChapterTitle: chapter?.title ?? null,
        } satisfies LibraryWork]
      })
      const nextPageHasMore = savedRows.length === 25
      setData((current) => ({
        ...current,
        savedWorks: [...current.savedWorks, ...loadedWorks],
        hasMoreSaved: nextPageHasMore,
        savedCursor: nextPageHasMore
          ? { createdAt: savedRows[23].created_at, workId: savedRows[23].work_id }
          : null,
      }))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Hindi ma-load ang susunod na mga gawa. Subukan ulit.')
    } finally {
      setBusy(null)
    }
  }

  const loadMoreLiked = async () => {
    if (!data.likedCursor || busy) return
    setBusy('load-liked')
    setError(null)
    try {
      const supabase = getSupabaseClient()
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError
      if (!user) throw new Error('Mag-log in para makita ang mga nagustuhan mong gawa.')
      const { data: likedRows, error: likedError } = await supabase
        .from('creator_work_likes')
        .select('work_id, created_at')
        .eq('user_id', user.id)
        .or(`created_at.lt.${data.likedCursor.createdAt},and(created_at.eq.${data.likedCursor.createdAt},work_id.lt.${data.likedCursor.workId})`)
        .order('created_at', { ascending: false })
        .order('work_id', { ascending: false })
        .limit(25)
      if (likedError) throw likedError

      const workIds = likedRows.map((row) => row.work_id)
      if (!workIds.length) {
        setData((current) => ({ ...current, hasMoreLiked: false, likedCursor: null }))
        return
      }
      const [worksResult, summariesResult, progressResult] = await Promise.all([
        supabase
          .from('creator_works')
          .select('id, author_id, title, type, genre, cover_image_url')
          .in('id', workIds)
          .in('type', ['story', 'comic'])
          .neq('status', 'Draft'),
        supabase.rpc('get_published_work_chapter_summaries', { work_ids: workIds }),
        supabase
          .from('library_reading_progress')
          .select('work_id, chapter_id, last_read_at')
          .eq('user_id', user.id)
          .in('work_id', workIds),
      ])
      if (worksResult.error) throw worksResult.error
      if (summariesResult.error) throw summariesResult.error
      if (progressResult.error) throw progressResult.error

      const authorIds = Array.from(new Set(worksResult.data.map((work) => work.author_id)))
      const chapterIds = progressResult.data.map((progress) => progress.chapter_id)
      const [authorsResult, chaptersResult] = await Promise.all([
        authorIds.length
          ? supabase.from('profiles').select('id, display_name, username').in('id', authorIds)
          : Promise.resolve({ data: [], error: null }),
        chapterIds.length
          ? supabase.from('creator_work_chapters').select('id, chapter_number, title').in('id', chapterIds)
          : Promise.resolve({ data: [], error: null }),
      ])
      if (authorsResult.error) throw authorsResult.error
      if (chaptersResult.error) throw chaptersResult.error

      const authors = new Map(authorsResult.data.map((author) => [author.id, author]))
      const progressByWork = new Map(progressResult.data.map((progress) => [progress.work_id, progress]))
      const chapters = new Map(chaptersResult.data.map((chapter) => [chapter.id, chapter]))
      const loadedWorks = likedRows.flatMap((row) => {
        const work = worksResult.data.find((item) => item.id === row.work_id)
        if (!work) return []
        const author = authors.get(work.author_id)
        const progress = progressByWork.get(work.id)
        const chapter = progress ? chapters.get(progress.chapter_id) : undefined
        const summary = summariesResult.data.find((item: {
          work_id: string
          chapter_count: number
          latest_chapter_number: number
          latest_chapter_title: string
        }) => item.work_id === work.id)
        return [{
          id: work.id,
          title: work.title,
          type: work.type as LibraryWork['type'],
          authorName: author?.display_name ?? 'StoryLines creator',
          authorUsername: author?.username ?? '',
          genre: work.genre,
          coverImageUrl: work.cover_image_url,
          savedAt: null,
          likedAt: row.created_at,
          lastReadAt: progress?.last_read_at ?? null,
          chapterCount: Number(summary?.chapter_count ?? 0),
          latestChapterNumber: summary?.latest_chapter_number ?? 0,
          latestChapterTitle: summary?.latest_chapter_title ?? null,
          resumeChapterNumber: chapter?.chapter_number ?? null,
          resumeChapterTitle: chapter?.title ?? null,
        } satisfies LibraryWork]
      })
      const nextPageHasMore = likedRows.length === 25
      setData((current) => ({
        ...current,
        likedWorks: [...current.likedWorks, ...loadedWorks],
        hasMoreLiked: nextPageHasMore,
        likedCursor: nextPageHasMore
          ? { createdAt: likedRows[23].created_at, workId: likedRows[23].work_id }
          : null,
      }))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Hindi ma-load ang mga nagustuhan mong gawa. Subukan ulit.')
    } finally {
      setBusy(null)
    }
  }

  const loadMoreHistory = async () => {
    if (!data.historyCursor || busy) return
    setBusy('load-history')
    setError(null)
    try {
      const supabase = getSupabaseClient()
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError
      if (!user) throw new Error('Mag-log in para makita ang iyong reading history.')
      const { data: historyRows, error: historyError } = await supabase
        .from('library_reading_progress')
        .select('work_id, chapter_id, last_read_at')
        .eq('user_id', user.id)
        .or(`last_read_at.lt.${data.historyCursor.lastReadAt},and(last_read_at.eq.${data.historyCursor.lastReadAt},work_id.lt.${data.historyCursor.workId})`)
        .order('last_read_at', { ascending: false })
        .order('work_id', { ascending: false })
        .limit(25)
      if (historyError) throw historyError

      const workIds = historyRows.map((row) => row.work_id)
      if (!workIds.length) {
        setData((current) => ({ ...current, hasMoreHistory: false, historyCursor: null }))
        return
      }
      const chapterIds = historyRows.map((row) => row.chapter_id)
      const [worksResult, summariesResult, chaptersResult] = await Promise.all([
        supabase
          .from('creator_works')
          .select('id, author_id, title, type, genre, cover_image_url')
          .in('id', workIds)
          .in('type', ['story', 'comic'])
          .neq('status', 'Draft'),
        supabase.rpc('get_published_work_chapter_summaries', { work_ids: workIds }),
        supabase.from('creator_work_chapters')
          .select('id, chapter_number, title')
          .in('id', chapterIds)
          .eq('is_published', true),
      ])
      if (worksResult.error) throw worksResult.error
      if (summariesResult.error) throw summariesResult.error
      if (chaptersResult.error) throw chaptersResult.error

      const authorIds = Array.from(new Set(worksResult.data.map((work) => work.author_id)))
      const authorsResult = authorIds.length
        ? await supabase.from('profiles').select('id, display_name, username').in('id', authorIds)
        : { data: [], error: null }
      if (authorsResult.error) throw authorsResult.error
      const authors = new Map(authorsResult.data.map((author) => [author.id, author]))
      const chapters = new Map(chaptersResult.data.map((chapter) => [chapter.id, chapter]))
      const loadedHistory = historyRows.flatMap((row) => {
        const work = worksResult.data.find((item) => item.id === row.work_id)
        const chapter = chapters.get(row.chapter_id)
        if (!work || !chapter) return []
        const author = authors.get(work.author_id)
        const summary = summariesResult.data.find((item: {
          work_id: string
          chapter_count: number
          latest_chapter_number: number
          latest_chapter_title: string
        }) => item.work_id === work.id)
        return [{
          id: work.id,
          title: work.title,
          type: work.type as LibraryWork['type'],
          authorName: author?.display_name ?? 'StoryLines creator',
          authorUsername: author?.username ?? '',
          genre: work.genre,
          coverImageUrl: work.cover_image_url,
          savedAt: null,
          likedAt: null,
          lastReadAt: row.last_read_at,
          chapterCount: Number(summary?.chapter_count ?? 0),
          latestChapterNumber: summary?.latest_chapter_number ?? 0,
          latestChapterTitle: summary?.latest_chapter_title ?? null,
          resumeChapterNumber: chapter.chapter_number,
          resumeChapterTitle: chapter.title,
        } satisfies LibraryWork]
      })
      const nextPageHasMore = historyRows.length === 25
      setData((current) => ({
        ...current,
        readingHistory: [...current.readingHistory, ...loadedHistory],
        hasMoreHistory: nextPageHasMore,
        historyCursor: nextPageHasMore
          ? { lastReadAt: historyRows[23].last_read_at, workId: historyRows[23].work_id }
          : null,
      }))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Hindi ma-load ang susunod na history. Subukan ulit.')
    } finally {
      setBusy(null)
    }
  }

  const filters: WorkFilter[] = ['All', 'Stories', 'Comics', 'With new chapters']

  const handleTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
    const currentIndex = tabs.findIndex((button) => button.getAttribute('aria-selected') === 'true')
    let nextIndex = currentIndex
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length
    else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = tabs.length - 1
    else return
    event.preventDefault()
    tabs[nextIndex].focus()
    setTab((['Saved', 'Liked', 'History'] as LibraryTab[])[nextIndex])
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-7">
      <header>
        <span className="eyebrow">Sarili mong estante</span>
        <h1 className="mt-2 font-serif text-5xl font-bold">Library.</h1>
        <p className="mt-2 text-sm text-muted-foreground">Nandito ang mga sinave mo, mga nagustuhan mong gawa, at mga huli mong binasa.</p>
      </header>

      {data.error ? (
        <div role="alert">
          <Panel className="p-5">
            <h2 className="font-serif text-xl font-bold">Hindi ma-load ang library</h2>
            <p className="mt-2 text-sm text-muted-foreground">{data.error}</p>
            <button
              type="button"
              onClick={() => router.refresh()}
              className="mt-3 inline-flex min-h-11 items-center rounded-full bg-accent px-4 text-sm font-bold text-accent-foreground"
            >
              Subukan ulit
            </button>
          </Panel>
        </div>
      ) : (
        <>
          <section aria-labelledby="continue-reading-title">
            <h2 id="continue-reading-title" className="mb-3 font-serif text-xl font-bold">Continue reading</h2>
            {data.continueReading.length ? (
              <div className="grid gap-3 md:grid-cols-3">
                {data.continueReading.map((work) => {
                  const progress = work.chapterCount
                    ? Math.min(100, Math.round(((work.resumeChapterNumber ?? 1) / work.chapterCount) * 100))
                    : 0
                  return (
                    <Panel key={work.id} className="flex min-w-0 items-center gap-3 p-3">
                      <Cover work={work} className="size-16 shrink-0 rounded-lg" />
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-sm font-bold">{work.title}</h3>
                        <p className="truncate text-xs text-muted-foreground">
                          {work.resumeChapterTitle ?? `Kabanata ${work.resumeChapterNumber ?? 1}`}
                          {work.chapterCount ? ` · Chapter ${work.resumeChapterNumber ?? 1} of ${work.chapterCount}` : ''}
                        </p>
                        <div
                          className="mt-2 h-1 overflow-hidden rounded-full bg-muted"
                          role="progressbar"
                          aria-label="Reading progress by chapter"
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={progress}
                        >
                          <div className="h-full rounded-full bg-accent" style={{ width: `${progress}%` }} />
                        </div>
                      </div>
                      <Link
                        href={readerHref(work, work.resumeChapterNumber)}
                        className="inline-flex min-h-11 shrink-0 items-center rounded-full bg-accent px-3 text-xs font-bold text-accent-foreground hover:brightness-95"
                      >
                        Resume
                      </Link>
                    </Panel>
                  )
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border bg-card/60 px-5 py-4 text-sm text-muted-foreground">
                Wala ka pang binabalikan. <Link href="/browse" className="font-bold text-accent underline underline-offset-2">Maghanap ng babasahin</Link>
              </div>
            )}
          </section>

          <div role="tablist" aria-label="Library categories" onKeyDown={handleTabKeyDown} className="flex gap-5 border-b border-border">
            {(['Saved', 'Liked', 'History'] as LibraryTab[]).map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                id={`library-tab-${item.toLowerCase()}`}
                aria-controls={`library-panel-${item.toLowerCase()}`}
                aria-selected={tab === item}
                tabIndex={tab === item ? 0 : -1}
                onClick={() => setTab(item)}
                className={`min-h-11 border-b-2 px-1 text-sm font-bold ${
                  tab === item ? 'border-accent text-accent' : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {item}
              </button>
            ))}
          </div>

          {error && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</p>}
          {busy && busy !== 'clear-history' && <span className="sr-only" aria-live="polite"><LoaderCircle className="size-4 animate-spin" /> Saving library changes</span>}

          {tab === 'Saved' ? (
            <section
              role="tabpanel"
              id="library-panel-saved"
              aria-labelledby="library-tab-saved"
              tabIndex={0}
              className="flex flex-col gap-5"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Filter saved works">
                  {filters.map((item) => (
                    <button
                      key={item}
                      type="button"
                      aria-pressed={filter === item}
                      onClick={() => setFilter(item)}
                      className={`min-h-11 shrink-0 rounded-full border px-3 text-xs font-bold ${
                        filter === item ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:border-accent'
                      }`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
                <label className="flex min-h-11 shrink-0 items-center gap-2 self-start rounded-full border border-border bg-card px-3 text-xs font-bold sm:self-auto">
                  Sort:
                  <select
                    value={sort}
                    onChange={(event) => setSort(event.target.value as WorkSort)}
                    className="max-w-44 bg-transparent text-xs outline-none"
                    aria-label="Sort saved works"
                  >
                    <option value="recent">Recently saved</option>
                    <option value="updated">Recently read</option>
                    <option value="title">Title A–Z</option>
                  </select>
                </label>
              </div>

              {visibleSaved.length ? (
                <section aria-label="Saved works" className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                  {visibleSaved.map((work) => (
                    <SavedWorkCard
                      key={work.id}
                      work={work}
                      disabled={busy !== null}
                      onUnsave={(id) => void removeSavedWork(id)}
                    />
                  ))}
                </section>
              ) : (
                <EmptyState
                  icon={<BookMarked />}
                  title={data.savedWorks.length ? 'Walang gawa sa filter na ito' : 'Wala pang naka-save sa estante mo'}
                  message={data.savedWorks.length ? 'Pumili ng ibang filter para makita ang ibang gawa.' : 'Mag-save ng Story o Comic habang nagba-browse para makita ito rito.'}
                  action={!data.savedWorks.length ? 'Mag-browse ng mga gawa' : undefined}
                  onAction={!data.savedWorks.length ? () => router.push('/browse') : undefined}
                />
              )}
              {data.hasMoreSaved && (
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => void loadMoreSaved()}
                    disabled={busy !== null}
                    className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-card px-5 text-sm font-bold hover:border-accent disabled:opacity-60"
                  >
                    {busy === 'load-more' && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
                    Load more
                  </button>
                </div>
              )}

            </section>
          ) : tab === 'Liked' ? (
            <section
              role="tabpanel"
              id="library-panel-liked"
              aria-labelledby="library-tab-liked"
              tabIndex={0}
              className="flex flex-col gap-5"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Filter liked works">
                  {filters.map((item) => (
                    <button
                      key={item}
                      type="button"
                      aria-pressed={filter === item}
                      onClick={() => setFilter(item)}
                      className={`min-h-11 shrink-0 rounded-full border px-3 text-xs font-bold ${
                        filter === item ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:border-accent'
                      }`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
                <label className="flex min-h-11 shrink-0 items-center gap-2 self-start rounded-full border border-border bg-card px-3 text-xs font-bold sm:self-auto">
                  Sort:
                  <select
                    value={sort}
                    onChange={(event) => setSort(event.target.value as WorkSort)}
                    className="max-w-44 bg-transparent text-xs outline-none"
                    aria-label="Sort liked works"
                  >
                    <option value="recent">Recently liked</option>
                    <option value="updated">Recently read</option>
                    <option value="title">Title A–Z</option>
                  </select>
                </label>
              </div>
              {data.likedError ? (
                <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  {data.likedError}
                </p>
              ) : visibleLiked.length ? (
                <section aria-label="Liked works" className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                  {visibleLiked.map((work) => (
                    <LikedWorkCard
                      key={work.id}
                      work={work}
                      disabled={busy !== null}
                      onUnlike={(id) => void unlikeWork(id)}
                    />
                  ))}
                </section>
              ) : (
                <EmptyState
                  icon={<Heart />}
                  title={data.likedWorks.length ? 'Walang gawa sa filter na ito' : 'Wala ka pang nagugustuhang gawa'}
                  message={data.likedWorks.length ? 'Pumili ng ibang filter para makita ang ibang gawa.' : 'I-like ang isang Story o Comic para makita ito rito.'}
                  action={!data.likedWorks.length ? 'Mag-browse ng mga gawa' : undefined}
                  onAction={!data.likedWorks.length ? () => router.push('/browse') : undefined}
                />
              )}
              {data.hasMoreLiked && (
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => void loadMoreLiked()}
                    disabled={busy !== null}
                    className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-card px-5 text-sm font-bold hover:border-accent disabled:opacity-60"
                  >
                    {busy === 'load-liked' && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
                    Load more liked works
                  </button>
                </div>
              )}
            </section>
          ) : (
            <section role="tabpanel" id="library-panel-history" aria-labelledby="library-tab-history" tabIndex={0}>
              <Panel className="p-4 sm:p-5">
                <div className="mb-1 flex items-center justify-between gap-3">
                  <h2 className="font-serif text-xl font-bold">Reading history</h2>
                  <button
                    type="button"
                    onClick={() => void clearHistory()}
                    disabled={!data.readingHistory.length || busy !== null}
                    className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs font-bold text-accent hover:underline disabled:opacity-50"
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                    Clear history
                  </button>
                </div>
                {data.readingHistory.length ? (
                  <ul>
                    {data.readingHistory.map((work) => (
                      <HistoryRow key={work.id} work={work} disabled={busy !== null} onRemove={(id) => void removeHistoryItem(id)} />
                    ))}
                  </ul>
                ) : (
                  <EmptyState
                    icon={<Clock3 />}
                    title="Wala pang laman ang reading history mo"
                    message="Dito mo makikita ang mga Story at Comic na sinimulan mo."
                    action="Mag-browse ng mga gawa"
                    onAction={() => router.push('/browse')}
                  />
                )}
              </Panel>
              {data.hasMoreHistory && (
                <div className="mt-4 flex justify-center">
                  <button
                    type="button"
                    onClick={() => void loadMoreHistory()}
                    disabled={busy !== null}
                    className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-card px-5 text-sm font-bold hover:border-accent disabled:opacity-60"
                  >
                    {busy === 'load-history' && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
                    Load more history
                  </button>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  )
}
