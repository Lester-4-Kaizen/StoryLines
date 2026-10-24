import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/supabase/config'

export type LibraryWork = {
  id: string
  title: string
  type: 'story' | 'comic'
  authorName: string
  authorUsername: string
  genre: string | null
  coverImageUrl: string | null
  savedAt: string | null
  likedAt: string | null
  lastReadAt: string | null
  chapterCount: number
  latestChapterNumber: number
  latestChapterTitle: string | null
  resumeChapterNumber: number | null
  resumeChapterTitle: string | null
}

export type LibraryPageData = {
  savedWorks: LibraryWork[]
  likedWorks: LibraryWork[]
  readingHistory: LibraryWork[]
  continueReading: LibraryWork[]
  hasMoreSaved: boolean
  savedCursor: { createdAt: string; workId: string } | null
  hasMoreLiked: boolean
  likedCursor: { createdAt: string; workId: string } | null
  hasMoreHistory: boolean
  historyCursor: { lastReadAt: string; workId: string } | null
  likedError: string | null
  error: string | null
}

function emptyLibraryPageData(error: string | null = null, likedError: string | null = null): LibraryPageData {
  return {
    savedWorks: [],
    likedWorks: [],
    readingHistory: [],
    continueReading: [],
    hasMoreSaved: false,
    savedCursor: null,
    hasMoreLiked: false,
    likedCursor: null,
    hasMoreHistory: false,
    historyCursor: null,
    likedError,
    error,
  }
}

function libraryLoadError(error: unknown) {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String(Reflect.get(error, 'code'))
    : ''
  if (['PGRST202', 'PGRST204', 'PGRST205', '42P01', '42883'].includes(code)) {
    return 'Hindi pa naka-set up ang Library database. I-run ang 20261023000700_library_and_reader.sql sa Supabase SQL Editor.'
  }
  return 'Hindi ma-load ang library ngayon. Tingnan ang connection at subukan ulit.'
}

function likedWorksLoadError(error: unknown) {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String(Reflect.get(error, 'code'))
    : ''
  if (['PGRST202', 'PGRST204', 'PGRST205', '42P01', '42883', '42501'].includes(code)) {
    return 'Liked works are not available yet. Apply migration 20261025001300_library_liked_works.sql in Supabase.'
  }
  return 'Could not load liked works. Check your connection and try again.'
}

export async function getLibraryPageData(): Promise<LibraryPageData> {
  if (!isSupabaseConfigured) {
    return emptyLibraryPageData('Hindi pa naka-configure ang library database.')
  }

  const supabase = await createSupabaseServerClient()
  try {
    const { data: userResult, error: userError } = await supabase.auth.getUser()
    if (userError) throw userError
    if (!userResult.user) return emptyLibraryPageData('Mag-log in para makita ang iyong library.')
    const userId = userResult.user.id

    const [savedResult, likedResult, historyResult] = await Promise.all([
      supabase
        .from('library_saved_works')
        .select('work_id, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .order('work_id', { ascending: false })
        .limit(25),
      supabase
        .from('creator_work_likes')
        .select('work_id, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .order('work_id', { ascending: false })
        .limit(25),
      supabase
        .from('library_reading_progress')
        .select('work_id, chapter_id, last_read_at')
        .eq('user_id', userId)
        .order('last_read_at', { ascending: false })
        .limit(25),
    ])
    if (savedResult.error) throw savedResult.error
    if (historyResult.error) throw historyResult.error

    const savedRows = savedResult.data
    const likedRows = likedResult.error ? [] : likedResult.data
    const likedError = likedResult.error ? likedWorksLoadError(likedResult.error) : null
    if (likedResult.error) console.error('Failed to load liked works for library', likedResult.error)
    const historyRows = historyResult.data
    const workIds = Array.from(new Set([
      ...savedRows.map((row) => row.work_id),
      ...likedRows.map((row) => row.work_id),
      ...historyRows.map((row) => row.work_id),
    ]))
    const chapterIds = Array.from(new Set(historyRows.map((row) => row.chapter_id)))

    if (workIds.length === 0) return emptyLibraryPageData(null, likedError)

    const [worksResult, chaptersResult, summariesResult] = await Promise.all([
      supabase
        .from('creator_works')
        .select('id, author_id, title, type, genre, cover_image_url')
        .in('id', workIds)
        .in('type', ['story', 'comic'])
        .neq('status', 'Draft'),
      chapterIds.length
        ? supabase
          .from('creator_work_chapters')
          .select('id, chapter_number, title')
          .in('id', chapterIds)
          .eq('is_published', true)
        : Promise.resolve({ data: [], error: null }),
      supabase.rpc('get_published_work_chapter_summaries', { work_ids: workIds }),
    ])
    if (worksResult.error) throw worksResult.error
    if (chaptersResult.error) throw chaptersResult.error
    if (summariesResult.error) throw summariesResult.error

    const authorIds = Array.from(new Set(worksResult.data.map((work) => work.author_id)))
    const authorsResult = authorIds.length
      ? await supabase.from('profiles').select('id, display_name, username').in('id', authorIds)
      : { data: [], error: null }
    if (authorsResult.error) throw authorsResult.error

    const authors = new Map(authorsResult.data.map((author) => [author.id, author]))
    const chapterNumbers = new Map(chaptersResult.data.map((chapter) => [chapter.id, chapter.chapter_number]))
    const chapterTitles = new Map(chaptersResult.data.map((chapter) => [chapter.id, chapter.title]))
    const progressByWork = new Map(historyRows.map((row) => [row.work_id, row]))
    const works = new Map(worksResult.data.map((work) => {
      const author = authors.get(work.author_id)
      const chapterSummary = summariesResult.data.find((summary: {
        work_id: string
        chapter_count: number
        latest_chapter_number: number
        latest_chapter_title: string
      }) => summary.work_id === work.id)
      const progress = progressByWork.get(work.id)
      return [work.id, {
        id: work.id,
        title: work.title,
        type: work.type as LibraryWork['type'],
        authorName: author?.display_name ?? 'StoryLines creator',
        authorUsername: author?.username ?? '',
        genre: work.genre,
        coverImageUrl: work.cover_image_url,
        savedAt: null,
        likedAt: null,
        lastReadAt: progress?.last_read_at ?? null,
        chapterCount: Number(chapterSummary?.chapter_count ?? 0),
        latestChapterNumber: chapterSummary?.latest_chapter_number ?? 0,
        latestChapterTitle: chapterSummary?.latest_chapter_title ?? null,
        resumeChapterNumber: progress ? chapterNumbers.get(progress.chapter_id) ?? null : null,
        resumeChapterTitle: progress ? chapterTitles.get(progress.chapter_id) ?? null : null,
      } satisfies LibraryWork]
    }))

    const savedWorks = savedRows.flatMap((row) => {
      const work = works.get(row.work_id)
      return work ? [{ ...work, savedAt: row.created_at }] : []
    })
    const likedWorks = likedRows.flatMap((row) => {
      const work = works.get(row.work_id)
      return work ? [{ ...work, likedAt: row.created_at }] : []
    })
    const readingHistory = historyRows.flatMap((row) => {
      const work = works.get(row.work_id)
      const resumeChapterNumber = chapterNumbers.get(row.chapter_id)
      return work && resumeChapterNumber
        ? [{
          ...work,
          lastReadAt: row.last_read_at,
          resumeChapterNumber,
          resumeChapterTitle: chapterTitles.get(row.chapter_id) ?? null,
        }]
        : []
    })

    return {
      savedWorks: savedWorks.slice(0, 24),
      likedWorks: likedWorks.slice(0, 24),
      readingHistory: readingHistory.slice(0, 24),
      continueReading: readingHistory.slice(0, 3),
      hasMoreSaved: savedRows.length === 25,
      savedCursor: savedRows.length === 25
        ? { createdAt: savedRows[23].created_at, workId: savedRows[23].work_id }
        : null,
      hasMoreLiked: likedRows.length === 25,
      likedCursor: likedRows.length === 25
        ? { createdAt: likedRows[23].created_at, workId: likedRows[23].work_id }
        : null,
      hasMoreHistory: historyRows.length === 25,
      historyCursor: historyRows.length === 25
        ? { lastReadAt: historyRows[23].last_read_at, workId: historyRows[23].work_id }
        : null,
      likedError,
      error: null,
    }
  } catch (error) {
    console.error('Failed to load library data', error)
    return emptyLibraryPageData(libraryLoadError(error))
  }
}
