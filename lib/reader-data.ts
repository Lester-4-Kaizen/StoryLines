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
  currentChapter: ReaderChapter | null
  comicPages: { id: string; number: number; imageUrl: string; altText: string; transcript: string }[]
  comicAuthorNote: string
  comicReadingDirection: 'vertical' | 'page' | 'rtl'
  comicReaderBackground: 'dark' | 'light' | 'paper'
  comicPageSpacing: 'none' | 'small' | 'large'
  currentUserId: string | null
  isSaved: boolean
  error: string | null
}

function emptyReaderPageData(error: string | null = null): ReaderPageData {
  return {
    work: null,
    chapters: [],
    currentChapter: null,
    comicPages: [],
    comicAuthorNote: '',
    comicReadingDirection: 'vertical',
    comicReaderBackground: 'dark',
    comicPageSpacing: 'small',
    currentUserId: null,
    isSaved: false,
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
    if (currentUserId) {
      const { data: savedRow, error: savedError } = await supabase
        .from('library_saved_works')
        .select('work_id')
        .eq('user_id', currentUserId)
        .eq('work_id', workId)
        .maybeSingle()
      if (savedError) throw savedError
      isSaved = Boolean(savedRow)
    }

    const chapters = chapterRows.map((chapter) => ({
      id: chapter.id,
      number: chapter.chapter_number,
      title: chapter.title,
    }))
    const selected = chapters.find((chapter) => chapter.number === requestedChapter) ?? chapters[0]
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
      error: null,
    }
  } catch (error) {
    console.error('Failed to load reader data', error)
    return emptyReaderPageData(readerLoadError(error))
  }
}
