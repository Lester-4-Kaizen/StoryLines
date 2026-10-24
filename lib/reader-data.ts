import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { normalizeWorkLanguage } from '@/lib/work-taxonomy'

export type ReaderChapter = {
  id: string
  number: number
  title: string
  body: string
}

export type ReaderPageData = {
  work: {
    id: string
    title: string
    type: 'story' | 'comic'
    synopsis: string
    genre: string | null
    language: string | null
    status: 'Ongoing' | 'Complete'
    coverImageUrl: string | null
    authorId: string
    authorName: string
    authorUsername: string
  } | null
  chapters: Omit<ReaderChapter, 'body'>[]
  chapterProgress: Record<string, 'in_progress' | 'completed'>
  chapterProgressError: string | null
  savedScrollProgress: number
  currentChapter: ReaderChapter | null
  comicPages: { id: string; number: number; imageUrl: string; altText: string; transcript: string }[]
  comicAuthorNote: string
  comicReadingDirection: 'vertical' | 'page' | 'rtl'
  comicReaderBackground: 'dark' | 'light' | 'paper'
  comicPageSpacing: 'none' | 'small' | 'large'
  currentUserId: string | null
  isSaved: boolean
  viewCount: number
  likeCount: number
  likedByMe: boolean
  engagementError: string | null
  error: string | null
}

function emptyReaderPageData(error: string | null = null): ReaderPageData {
  return {
    work: null,
    chapters: [],
    chapterProgress: {},
    chapterProgressError: null,
    savedScrollProgress: 0,
    currentChapter: null,
    comicPages: [],
    comicAuthorNote: '',
    comicReadingDirection: 'vertical',
    comicReaderBackground: 'dark',
    comicPageSpacing: 'small',
    currentUserId: null,
    isSaved: false,
    viewCount: 0,
    likeCount: 0,
    likedByMe: false,
    engagementError: null,
    error,
  }
}

function readerLoadError(error: unknown) {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String(Reflect.get(error, 'code'))
    : ''
  if (['PGRST202', 'PGRST204', 'PGRST205', '42P01', '42883'].includes(code)) {
    return 'Hindi pa kumpleto ang reader database. I-run ang 20261023000700_library_and_reader.sql at 20261023000900_comic_editor.sql sa Supabase SQL Editor.'
  }
  return 'Hindi ma-load ang gawa ngayon. Tingnan ang connection at subukan ulit.'
}

export async function getReaderPageData(workId: string, requestedChapter: number): Promise<ReaderPageData> {
  if (!isSupabaseConfigured) return emptyReaderPageData('Hindi pa naka-configure ang reader database.')

  const supabase = await createSupabaseServerClient()
  try {
    const [{ data: userResult, error: userError }, workResult] = await Promise.all([
      supabase.auth.getUser(),
      supabase
        .from('creator_works')
        .select('id, author_id, title, type, synopsis, genre, language, status, cover_image_url, author_note, comic_reading_direction, comic_reader_background, comic_page_spacing')
        .eq('id', workId)
        .in('type', ['story', 'comic'])
        .neq('status', 'Draft')
        .maybeSingle(),
    ])
    if (userError) throw userError
    if (workResult.error) throw workResult.error
    if (!workResult.data) return emptyReaderPageData('Hindi makita ang nailathalang gawa na ito.')

    const [{ data: chapterRows, error: chapterError }, { data: comicPageRows, error: comicPageError }, { data: author, error: authorError }] = await Promise.all([
      supabase
        .from('creator_work_chapters')
        .select('id, chapter_number, title')
        .eq('work_id', workId)
        .eq('is_published', true)
        .order('chapter_number', { ascending: true }),
      workResult.data.type === 'comic'
        ? supabase
          .from('creator_comic_pages')
          .select('id, page_number, image_url, alt_text, transcript')
          .eq('work_id', workId)
          .eq('is_published', true)
          .order('page_number', { ascending: true })
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from('profiles')
        .select('display_name, username')
        .eq('id', workResult.data.author_id)
        .maybeSingle(),
    ])
    if (chapterError) throw chapterError
    if (comicPageError) throw comicPageError
    if (authorError) throw authorError

    const currentUserId = userResult.user?.id ?? null
    let isSaved = false
    let viewCount = 0
    let likeCount = 0
    let likedByMe = false
    let engagementError: string | null = null
    if (currentUserId) {
      const [{ data: savedRow, error: savedError }, { data: engagementRows, error: engagementLoadError }] = await Promise.all([
        supabase
          .from('library_saved_works')
          .select('work_id')
          .eq('user_id', currentUserId)
          .eq('work_id', workId)
          .maybeSingle(),
        supabase.rpc('get_creator_work_engagement', { p_work_id: workId }),
      ])
      if (savedError) throw savedError
      if (engagementLoadError) {
        engagementError = 'Engagement counts are unavailable. Apply migration 20261025001000_work_engagement_and_rankings.sql in Supabase.'
      } else {
        const engagement = engagementRows?.[0]
        viewCount = Number(engagement?.view_count ?? 0)
        likeCount = Number(engagement?.like_count ?? 0)
        likedByMe = Boolean(engagement?.liked_by_me)
      }
      isSaved = Boolean(savedRow)
    } else {
      const { data: engagementRows, error: engagementLoadError } = await supabase.rpc(
        'get_creator_work_engagement',
        { p_work_id: workId },
      )
      if (engagementLoadError) {
        engagementError = 'Engagement counts are unavailable. Apply migration 20261025001000_work_engagement_and_rankings.sql in Supabase.'
      } else {
        const engagement = engagementRows?.[0]
        viewCount = Number(engagement?.view_count ?? 0)
        likeCount = Number(engagement?.like_count ?? 0)
      }
    }

    const chapters = chapterRows.map((chapter) => ({
      id: chapter.id,
      number: chapter.chapter_number,
      title: chapter.title,
    }))
    const selected = chapters.find((chapter) => chapter.number === requestedChapter) ?? chapters[0]
    let chapterProgress: ReaderPageData['chapterProgress'] = {}
    let chapterProgressError: string | null = null
    let savedScrollProgress = 0
    let savedScrollChapterId: string | null = null
    if (currentUserId && workResult.data.type === 'story') {
      const [chapterProgressResult, readingProgressResult] = await Promise.all([
        supabase.rpc('get_my_chapter_reading_progress', { p_work_id: workId }),
        supabase
          .from('library_reading_progress')
          .select('chapter_id, scroll_progress')
          .eq('user_id', currentUserId)
          .eq('work_id', workId)
          .maybeSingle(),
      ])
      const { data: progressRows, error: progressLoadError } = chapterProgressResult
      if (progressLoadError) {
        console.error('Failed to load chapter reading progress', progressLoadError)
        chapterProgressError = 'Chapter reading status is unavailable. Apply migration 20261025001100_chapter_reading_completion.sql in Supabase.'
      } else {
        chapterProgress = Object.fromEntries(
          (progressRows ?? []).map((progress: {
            chapter_id: string
            status: 'in_progress' | 'completed'
          }) => [progress.chapter_id, progress.status]),
        )
      }
      if (readingProgressResult.error) {
        console.error('Failed to load saved reader position', readingProgressResult.error)
        chapterProgressError ??= 'Saved reading position is unavailable. Apply migration 20261025001200_chapter_discussions_chat_unsend_and_reader_position.sql in Supabase.'
      } else {
        savedScrollChapterId = readingProgressResult.data?.chapter_id ?? null
        if (savedScrollChapterId === selected?.id) {
          savedScrollProgress = Number(readingProgressResult.data?.scroll_progress ?? 0)
        }
      }
    }
    let currentChapter: ReaderChapter | null = null
    if (selected) {
      const { data: bodyRow, error: bodyError } = await supabase
        .from('creator_work_chapters')
        .select('body')
        .eq('id', selected.id)
        .eq('is_published', true)
        .maybeSingle()
      if (bodyError) throw bodyError
      if (!bodyRow) throw new Error('Hindi ma-load ang kabanatang ito.')
      currentChapter = { ...selected, body: bodyRow.body }
    }

    return {
      work: {
        id: workResult.data.id,
        title: workResult.data.title,
        type: workResult.data.type as 'story' | 'comic',
        synopsis: workResult.data.synopsis,
        genre: workResult.data.genre,
        language: workResult.data.language ? normalizeWorkLanguage(workResult.data.language) : null,
        status: workResult.data.status as 'Ongoing' | 'Complete',
        coverImageUrl: workResult.data.cover_image_url,
        authorId: workResult.data.author_id,
        authorName: author?.display_name ?? 'StoryLines creator',
        authorUsername: author?.username ?? '',
      },
      chapters,
      chapterProgress,
      chapterProgressError,
      savedScrollProgress,
      currentChapter,
      comicPages: comicPageRows.map((page) => ({
        id: page.id,
        number: page.page_number,
        imageUrl: page.image_url,
        altText: page.alt_text,
        transcript: page.transcript,
      })),
      comicAuthorNote: workResult.data.type === 'comic' ? workResult.data.author_note ?? '' : '',
      comicReadingDirection: workResult.data.comic_reading_direction ?? 'vertical',
      comicReaderBackground: workResult.data.comic_reader_background ?? 'dark',
      comicPageSpacing: workResult.data.comic_page_spacing ?? 'small',
      currentUserId,
      isSaved,
      viewCount,
      likeCount,
      likedByMe,
      engagementError,
      error: null,
    }
  } catch (error) {
    console.error('Failed to load reader data', error)
    return emptyReaderPageData(readerLoadError(error))
  }
}
