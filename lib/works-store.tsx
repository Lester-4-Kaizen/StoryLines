'use client'

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { getSupabaseClient } from '@/lib/supabase'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { deleteCreatorCoverByUrl } from '@/lib/creator-image-upload'
import { normalizeWorkLanguage } from '@/lib/work-taxonomy'
import type { ComicPage, Work } from '@/lib/types'

type WorksState = {
  works: Work[]
  hydrated: boolean
  loadError: string | null
  refreshWorks: () => Promise<void>
  // `draft` is temporary metadata for editor flows that do not yet have a saved work.
  draft: Partial<Work> | null
  setDraft: (draft: Partial<Work>) => void
  clearDraft: () => void
  addWork: (work: Omit<Work, 'id' | 'createdAt'>) => Promise<Work>
  updateWork: (id: string, patch: Partial<Work>) => Promise<void>
  deleteWork: (id: string) => Promise<void>
}

const WorksContext = createContext<WorksState | null>(null)

async function saveChapters(
  supabase: ReturnType<typeof getSupabaseClient>,
  workId: string,
  chapters: NonNullable<Work['chapters']>,
  published: boolean,
) {
  const { data: existing, error: lookupError } = await supabase
    .from('creator_work_chapters')
    .select('id, chapter_number')
    .eq('work_id', workId)
  if (lookupError) throw lookupError
  const chapterNumbers = chapters.map((chapter) => chapter.number)
  const deletedIds = existing.filter((chapter) => !chapterNumbers.includes(chapter.chapter_number)).map((chapter) => chapter.id)
  if (deletedIds.length) {
    const { error } = await supabase.from('creator_work_chapters').delete().in('id', deletedIds)
    if (error) throw error
  }
  if (!chapters.length) return
  const { error } = await supabase.from('creator_work_chapters').upsert(
    chapters.map((chapter) => ({
      work_id: workId,
      chapter_number: chapter.number,
      title: chapter.title,
      body: chapter.body,
      author_note: chapter.authorNote ?? '',
      is_published: published,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: 'work_id,chapter_number' },
  )
  if (error) throw error
}

async function saveComicPages(
  supabase: ReturnType<typeof getSupabaseClient>,
  workId: string,
  pages: ComicPage[],
  published: boolean,
) {
  const { data: existing, error: lookupError } = await supabase
    .from('creator_comic_pages')
    .select('id, page_number')
    .eq('work_id', workId)
  if (lookupError) throw lookupError

  const retainedPageNumbers = pages.map((_, index) => index + 1)
  const deletedIds = existing.filter((page) => !retainedPageNumbers.includes(page.page_number)).map((page) => page.id)
  if (deletedIds.length) {
    const { error } = await supabase.from('creator_comic_pages').delete().in('id', deletedIds)
    if (error) throw error
  }
  if (!pages.length) return

  const { error } = await supabase.from('creator_comic_pages').upsert(
    pages.map((page, index) => ({
      work_id: workId,
      page_number: index + 1,
      image_id: page.imageId,
      image_url: page.imageUrl,
      alt_text: page.altText,
      transcript: page.transcript,
      is_published: published,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: 'work_id,page_number' },
  )
  if (error) throw error
}

export function WorksProvider({ children }: { children: ReactNode }) {
  const [works, setWorks] = useState<Work[]>([])
  const [hydrated, setHydrated] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [draft, setDraftState] = useState<Partial<Work> | null>(null)

  const setDraft = (patch: Partial<Work>) => setDraftState((current) => ({ ...current, ...patch }))
  const clearDraft = () => setDraftState(null)

  const refreshWorks = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setWorks([])
      setLoadError('Hindi pa naka-configure ang creator database.')
      setHydrated(true)
      return
    }
    setHydrated(false)
    setLoadError(null)
    try {
      const supabase = getSupabaseClient()
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) throw sessionError
      const user = session?.user
      if (!user) {
        setWorks([])
        setHydrated(true)
        return
      }
      const { data: workRows, error: workError } = await supabase
        .from('creator_works')
        .select('id, author_id, title, type, synopsis, genre, moods, language, rating, content_warnings, status, cover_image_url, comic_reading_direction, comic_reader_background, comic_page_spacing, author_note, created_at')
        .eq('author_id', user.id)
        .order('updated_at', { ascending: false })
        .order('id', { ascending: false })
      if (workError) throw workError

      const storyIds = workRows.filter((work) => work.type === 'story').map((work) => work.id)
      const { data: chapterRows, error: chapterError } = storyIds.length
        ? await supabase
          .from('creator_work_chapters')
          .select('work_id, chapter_number, title, body, author_note')
          .in('work_id', storyIds)
          .order('chapter_number', { ascending: true })
        : { data: [], error: null }
      if (chapterError) throw chapterError

      const comicIds = workRows.filter((work) => work.type === 'comic').map((work) => work.id)
      const { data: comicPageRows, error: comicPageError } = comicIds.length
        ? await supabase
          .from('creator_comic_pages')
          .select('id, work_id, page_number, image_id, image_url, alt_text, transcript')
          .in('work_id', comicIds)
          .order('page_number', { ascending: true })
        : { data: [], error: null }
      if (comicPageError) throw comicPageError
      const comicPagesByWork = new Map<string, ComicPage[]>()
      for (const page of comicPageRows) {
        const pages = comicPagesByWork.get(page.work_id) ?? []
        pages.push({
          id: page.id,
          imageId: page.image_id,
          imageUrl: page.image_url,
          altText: page.alt_text,
          transcript: page.transcript,
        })
        comicPagesByWork.set(page.work_id, pages)
      }

      const chaptersByWork = new Map<string, NonNullable<Work['chapters']>>()
      for (const chapter of chapterRows) {
        const chapters = chaptersByWork.get(chapter.work_id) ?? []
        chapters.push({
          number: chapter.chapter_number,
          title: chapter.title,
          body: chapter.body,
          authorNote: chapter.author_note ?? '',
        })
        chaptersByWork.set(chapter.work_id, chapters)
      }

      setWorks(workRows.map((work) => {
        const chapters = chaptersByWork.get(work.id) ?? []
        return {
          id: work.id,
          authorId: work.author_id,
          title: work.title,
          type: work.type as Work['type'],
          synopsis: work.synopsis,
          genre: work.genre ?? undefined,
          moods: work.moods ?? [],
          language: work.language ? normalizeWorkLanguage(work.language) : undefined,
          rating: work.rating ?? undefined,
          contentWarnings: work.content_warnings ?? [],
          comicReadingDirection: work.comic_reading_direction ?? 'vertical',
          comicReaderBackground: work.comic_reader_background ?? 'dark',
          comicPageSpacing: work.comic_page_spacing ?? 'small',
          authorNote: work.type === 'comic' ? work.author_note ?? '' : undefined,
          comicPages: comicPagesByWork.get(work.id) ?? [],
          status: work.status as Work['status'],
          coverImageUrl: work.cover_image_url ?? undefined,
          chapterTitle: chapters[0]?.title,
          chapterBody: chapters[0]?.body,
          chapters,
          createdAt: new Date(work.created_at).getTime(),
        }
      }))
    } catch (error) {
      console.error('Failed to load creator works', error)
      setLoadError(error instanceof Error ? error.message : 'Hindi ma-load ang mga gawa mo.')
    } finally {
      setHydrated(true)
    }
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured) {
      void refreshWorks()
      return
    }
    const supabase = getSupabaseClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      window.setTimeout(() => void refreshWorks(), 0)
    })
    void refreshWorks()
    return () => subscription.unsubscribe()
  }, [refreshWorks])

  const addWork = async (work: Omit<Work, 'id' | 'createdAt'>) => {
    const supabase = getSupabaseClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError) throw userError
    if (!user) throw new Error('Mag-log in ulit bago mag-save ng work.')

    const { data, error } = await supabase
      .from('creator_works')
      .insert({
        author_id: user.id,
        title: work.title,
        type: work.type,
        synopsis: work.synopsis ?? '',
        genre: work.genre ?? null,
        moods: work.moods ?? [],
        language: work.language ?? null,
        rating: work.rating ?? 'All ages',
        content_warnings: work.contentWarnings ?? [],
        cover_image_url: work.coverImageUrl ?? null,
        comic_reading_direction: work.comicReadingDirection ?? 'vertical',
        comic_reader_background: work.comicReaderBackground ?? 'dark',
        comic_page_spacing: work.comicPageSpacing ?? 'small',
        author_note: work.authorNote ?? '',
        status: work.status,
      })
      .select('id, created_at')
      .single()
    if (error) throw error

    const chapters = work.chapters ?? (work.type === 'story' && work.chapterTitle
      ? [{ number: 1, title: work.chapterTitle, body: work.chapterBody ?? '', authorNote: '' }]
      : [])
    if (work.type === 'story' && chapters.length) {
      const { error: chapterError } = await supabase.from('creator_work_chapters').insert(
        chapters.map((chapter) => ({
          work_id: data.id,
          chapter_number: chapter.number,
          title: chapter.title,
          body: chapter.body,
          author_note: chapter.authorNote ?? '',
          is_published: work.status !== 'Draft',
        })),
      )
      if (chapterError) {
        const { error: cleanupError } = await supabase.from('creator_works').delete().eq('id', data.id)
        if (cleanupError) console.error('Failed to clean up a story after chapter creation failed', cleanupError)
        throw chapterError
      }
    }
    if (work.type === 'comic' && work.comicPages?.length) {
      try {
        await saveComicPages(supabase, data.id, work.comicPages, work.status !== 'Draft')
      } catch (pageError) {
        const { error: cleanupError } = await supabase.from('creator_works').delete().eq('id', data.id)
        if (cleanupError) console.error('Failed to clean up a comic after page creation failed', cleanupError)
        throw pageError
      }
    }

    const newWork: Work = { ...work, authorId: user.id, id: data.id, createdAt: new Date(data.created_at).getTime() }
    setWorks((current) => [newWork, ...current])
    return newWork
  }

  const updateWork = async (id: string, patch: Partial<Work>) => {
    const supabase = getSupabaseClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError) throw userError
    if (!user) throw new Error('Mag-log in ulit bago mag-update ng work.')

    const current = works.find((work) => work.id === id)
    if (!current) throw new Error('Hindi na makita ang work na ito.')
    if (current.authorId !== 'me' && current.authorId !== user.id) {
      throw new Error('Hindi mo puwedeng i-edit ang work ng ibang account.')
    }
    const updated = { ...current, ...patch }
    const { data: existing, error: lookupError } = await supabase
      .from('creator_works')
      .select('id')
      .eq('id', id)
      .maybeSingle()
    if (lookupError) throw lookupError
    const fields = {
      title: updated.title,
      synopsis: updated.synopsis ?? '',
      genre: updated.genre ?? null,
      moods: updated.moods ?? [],
      language: updated.language ?? null,
      rating: updated.rating ?? 'All ages',
      content_warnings: updated.contentWarnings ?? [],
      cover_image_url: updated.coverImageUrl ?? null,
      comic_reading_direction: updated.comicReadingDirection ?? 'vertical',
      comic_reader_background: updated.comicReaderBackground ?? 'dark',
      comic_page_spacing: updated.comicPageSpacing ?? 'small',
      author_note: updated.authorNote ?? '',
      status: updated.status,
      updated_at: new Date().toISOString(),
    }
    if (existing) {
      const { data, error } = await supabase
        .from('creator_works')
        .update(fields)
        .eq('id', id)
        .eq('author_id', user.id)
        .select('id')
        .maybeSingle()
      if (error) throw error
      if (!data) throw new Error('Hindi ma-update ang work na ito. I-refresh ang pahina at subukan ulit.')
      if (current.type === 'story' && current.status !== updated.status) {
        const { error: chapterError } = await supabase
          .from('creator_work_chapters')
          .update({ is_published: updated.status !== 'Draft', updated_at: new Date().toISOString() })
          .eq('work_id', id)
        if (chapterError) throw chapterError
      }
      if (current.type === 'story' && updated.chapters) {
        await saveChapters(supabase, id, updated.chapters, updated.status !== 'Draft')
      }
      if (current.type === 'comic' && updated.comicPages) {
        await saveComicPages(supabase, id, updated.comicPages, updated.status !== 'Draft')
      }
    } else {
      const { error } = await supabase.from('creator_works').insert({
        id,
        author_id: user.id,
        type: updated.type,
        ...fields,
      })
      if (error) throw error
    }

    setWorks((current) => current.map((work) => (work.id === id ? { ...work, ...patch, authorId: user.id } : work)))
  }

  const deleteWork = async (id: string) => {
    const supabase = getSupabaseClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError) throw userError
    if (!user) throw new Error('Mag-log in ulit bago mag-delete ng work.')
    const current = works.find((work) => work.id === id)
    if (!current) throw new Error('Hindi na makita ang work na ito.')
    if (current.authorId !== 'me' && current.authorId !== user.id) {
      throw new Error('Hindi mo puwedeng i-delete ang work ng ibang account.')
    }
    const { data, error } = await supabase
      .from('creator_works')
      .delete()
      .eq('id', id)
      .eq('author_id', user.id)
      .select('id')
      .maybeSingle()
    if (error) throw error
    if (!data && current.authorId !== 'me') {
      throw new Error('Hindi ma-delete ang work na ito. I-refresh ang pahina at subukan ulit.')
    }
    setWorks((current) => current.filter((work) => work.id !== id))
    if (current.coverImageUrl) {
      try {
        await deleteCreatorCoverByUrl(current.coverImageUrl)
      } catch (cleanupError) {
        console.error('Work deleted, but its cover image could not be removed', cleanupError)
      }
    }
  }

  return (
    <WorksContext.Provider value={{ works, hydrated, loadError, refreshWorks, draft, setDraft, clearDraft, addWork, updateWork, deleteWork }}>
      {children}
    </WorksContext.Provider>
  )
}

export function useWorks() {
  const ctx = useContext(WorksContext)
  if (!ctx) throw new Error('useWorks must be used within a WorksProvider')
  return ctx
}