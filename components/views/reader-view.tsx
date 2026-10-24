'use client'

import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Bookmark, ChevronLeft, ChevronRight, Eye, Heart, LoaderCircle, MessageCircle } from 'lucide-react'
import { Panel } from '@/components/shared/panel'
import { ChapterDiscussionPanel } from '@/components/shared/chapter-discussion-panel'
import { getSupabaseClient } from '@/lib/supabase'
import type { ReaderPageData } from '@/lib/reader-data'

export function ReaderView({ data, initialChapterSelected = false }: { data: ReaderPageData; initialChapterSelected?: boolean }) {
  const router = useRouter()
  const [storyTab, setStoryTab] = useState<'about' | 'contents' | 'read'>(initialChapterSelected && data.currentChapter ? 'read' : 'about')
  const [isSaved, setIsSaved] = useState(data.isSaved)
  const [saving, setSaving] = useState(false)
  const [liked, setLiked] = useState(data.likedByMe)
  const [likeCount, setLikeCount] = useState(data.likeCount)
  const [viewCount, setViewCount] = useState(data.viewCount)
  const [liking, setLiking] = useState(false)
  const [likeError, setLikeError] = useState<string | null>(null)
  const [engagementError, setEngagementError] = useState(data.engagementError)
  const [message, setMessage] = useState<string | null>(data.error)
  const [progressError, setProgressError] = useState<string | null>(data.chapterProgressError)
  const [chapterProgress, setChapterProgress] = useState(data.chapterProgress)
  const [savedScrollProgress, setSavedScrollProgress] = useState(data.savedScrollProgress)
  const [selectedDiscussion, setSelectedDiscussion] = useState<{ index: number; text: string } | null>(null)
  const [comicIndex, setComicIndex] = useState(0)
  const completionInFlight = useRef(new Set<string>())
  const scrollSaveTimer = useRef<number | null>(null)
  const discussionPressTimer = useRef<number | null>(null)
  const discussionPointerType = useRef<string | null>(null)

  useEffect(() => {
    setIsSaved(data.isSaved)
    setLiked(data.likedByMe)
    setLikeCount(data.likeCount)
    setViewCount(data.viewCount)
    setEngagementError(data.engagementError)
    setMessage(data.error)
    setChapterProgress(data.chapterProgress)
    setProgressError(data.chapterProgressError)
    setSavedScrollProgress(data.savedScrollProgress)
    setSelectedDiscussion(null)
  }, [data.isSaved, data.likedByMe, data.likeCount, data.viewCount, data.engagementError, data.error, data.chapterProgress, data.chapterProgressError, data.savedScrollProgress])

  useEffect(() => {
    setStoryTab(initialChapterSelected && data.currentChapter ? 'read' : 'about')
  }, [data.work?.id, data.currentChapter?.id, initialChapterSelected])

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [data.currentChapter?.id])

  useEffect(() => () => {
    if (discussionPressTimer.current !== null) {
      window.clearTimeout(discussionPressTimer.current)
    }
  }, [])

  useEffect(() => {
    if (!data.currentUserId || !data.work) return
    const workId = data.work.id
    let active = true
    void (async () => {
      try {
        const { data: recorded, error } = await getSupabaseClient()
          .rpc('record_creator_work_view', { p_work_id: workId })
        if (!active) return
        if (error) {
          setEngagementError('View tracking is unavailable. Apply migration 20261025001000_work_engagement_and_rankings.sql in Supabase.')
          return
        }
        if (recorded) setViewCount((count) => count + 1)
      } catch {
        if (active) setEngagementError('Could not record this view. Check your connection and try again.')
      }
    })()
    return () => {
      active = false
    }
  }, [data.currentUserId, data.work])

  useEffect(() => {
    const userId = data.currentUserId
    const work = data.work
    const chapter = data.currentChapter
    if (!userId || !work || !chapter || work.type !== 'story' || storyTab !== 'read') return
    let active = true
    const supabase = getSupabaseClient()
    void (async () => {
      const { error: libraryError } = await supabase.from('library_reading_progress').upsert({
        user_id: userId,
        work_id: work.id,
        chapter_id: chapter.id,
        last_read_at: new Date().toISOString(),
      }, { onConflict: 'user_id,work_id' })
      if (libraryError) {
        if (active) setProgressError('Hindi na-save ang reading history mo. Tiyaking nailapat ang 20261023000700_library_and_reader.sql at naka-log in ka sa Supabase.')
        return
      }

      const { data: recorded, error } = await supabase.rpc('record_my_chapter_reading_progress', {
        p_chapter_id: chapter.id,
        p_completed: false,
      })
      if (!active) return
      if (error) {
        setProgressError('Chapter status is unavailable. Apply migration 20261025001100_chapter_reading_completion.sql in Supabase.')
        return
      }
      const status = recorded?.[0]?.status
      if (status === 'in_progress' || status === 'completed') {
        setChapterProgress((current) => current[chapter.id] === 'completed'
          ? current
          : { ...current, [chapter.id]: status })
        setProgressError(null)
      }
    })()
    return () => {
      active = false
    }
  }, [data.currentChapter, data.currentUserId, data.work, storyTab])

  useEffect(() => {
    const userId = data.currentUserId
    const work = data.work
    const chapter = data.currentChapter
    if (!userId || !work || !chapter || work.type !== 'story' || storyTab !== 'read') return

    const savePosition = () => {
      if (scrollSaveTimer.current !== null) window.clearTimeout(scrollSaveTimer.current)
      scrollSaveTimer.current = window.setTimeout(() => {
        const scrollableHeight = document.documentElement.scrollHeight - window.innerHeight
        const position = scrollableHeight > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollableHeight)) : 0
        void (async () => {
          try {
            const { data: saved, error } = await getSupabaseClient()
              .from('library_reading_progress')
              .update({ scroll_progress: position, last_read_at: new Date().toISOString() })
              .eq('user_id', userId)
              .eq('work_id', work.id)
              .eq('chapter_id', chapter.id)
              .select('chapter_id')
              .maybeSingle()
            if (error) throw error
            if (!saved) return
            setSavedScrollProgress(position)
            setProgressError(null)
          } catch {
            setProgressError('Could not save your reading position. Check your connection and try again.')
          }
        })()
      }, 900)
    }
    window.addEventListener('scroll', savePosition, { passive: true })
    return () => {
      window.removeEventListener('scroll', savePosition)
      if (scrollSaveTimer.current !== null) window.clearTimeout(scrollSaveTimer.current)
    }
  }, [data.currentChapter, data.currentUserId, data.work, storyTab])

  const toggleSaved = async () => {
    if (!data.work) return
    if (!data.currentUserId) {
      const next = `/works/${data.work.id}?chapter=${data.currentChapter?.number ?? 1}`
      router.push(`/login?next=${encodeURIComponent(next)}`)
      return
    }
    const wasSaved = isSaved
    setIsSaved(!wasSaved)
    setSaving(true)
    setMessage(null)
    try {
      const supabase = getSupabaseClient()
      const result = wasSaved
        ? await supabase.from('library_saved_works').delete().eq('user_id', data.currentUserId).eq('work_id', data.work.id)
        : await supabase.from('library_saved_works').insert({ user_id: data.currentUserId, work_id: data.work.id })
      if (result.error) throw result.error
    } catch (error) {
      setIsSaved(wasSaved)
      setMessage(error instanceof Error ? error.message : 'Hindi ma-update ang library mo.')
    } finally {
      setSaving(false)
    }
  }

  const toggleLike = async () => {
    if (!data.work) return
    if (!data.currentUserId) {
      const next = `/works/${data.work.id}?chapter=${data.currentChapter?.number ?? 1}`
      router.push(`/login?next=${encodeURIComponent(next)}`)
      return
    }

    setLiking(true)
    setLikeError(null)
    try {
      const { data: result, error } = await getSupabaseClient().rpc('toggle_creator_work_like', {
        p_work_id: data.work.id,
        p_liked: !liked,
      })
      if (error) throw error
      const updated = result?.[0]
      if (!updated) throw new Error('Supabase did not return the updated like count.')
      setLiked(Boolean(updated.liked))
      setLikeCount(Number(updated.like_count))
    } catch (error) {
      setLikeError(error instanceof Error ? error.message : 'Could not update your like. Please try again.')
    } finally {
      setLiking(false)
    }
  }

  if (!data.work) {
    return (
      <div role="alert">
        <Panel className="mx-auto max-w-3xl p-6">
          <h1 className="font-serif text-2xl font-bold">Hindi maipakita ang gawa</h1>
          <p className="mt-2 text-sm text-muted-foreground">{message ?? 'Hindi makita ang nailathalang gawa na ito.'}</p>
          <button type="button" onClick={() => router.refresh()} className="mt-4 min-h-11 rounded-full bg-accent px-4 text-sm font-bold text-accent-foreground">
            Subukan ulit
          </button>
        </Panel>
      </div>
    )
  }

  const chapterIndex = data.currentChapter
    ? data.chapters.findIndex((chapter) => chapter.number === data.currentChapter?.number)
    : -1
  const workId = data.work.id
  const previousChapter = chapterIndex > 0 ? data.chapters[chapterIndex - 1] : null
  const nextChapter = chapterIndex >= 0 ? data.chapters[chapterIndex + 1] : null
  const storyTabs: { id: 'about' | 'contents'; label: string }[] = [
    { id: 'about', label: 'About' },
    { id: 'contents', label: 'Table of Contents' },
  ]
  const comicPages = data.comicReadingDirection === 'rtl' ? [...data.comicPages].reverse() : data.comicPages
  const readerBackground = {
    dark: 'bg-stone-950 text-stone-100',
    light: 'bg-white text-stone-900',
    paper: 'bg-[#f1e3cb] text-[#4b3325]',
  }[data.comicReaderBackground]
  const pageSpacing = {
    none: 'gap-0',
    small: 'gap-2',
    large: 'gap-6',
  }[data.comicPageSpacing]
  const chapterParagraphs = data.currentChapter?.body
    .split(/\r?\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean) ?? []
  const openDiscussion = (index: number, text: string) => {
    setSelectedDiscussion((current) => current?.index === index ? null : { index, text })
  }
  const clearDiscussionPress = () => {
    if (discussionPressTimer.current !== null) {
      window.clearTimeout(discussionPressTimer.current)
      discussionPressTimer.current = null
    }
  }
  const beginParagraphPress = (event: React.PointerEvent<HTMLElement>, index: number, text: string) => {
    discussionPointerType.current = event.pointerType
    if (event.pointerType !== 'touch' || (event.target instanceof Element && event.target.closest('button'))) return
    clearDiscussionPress()
    discussionPressTimer.current = window.setTimeout(() => {
      setSelectedDiscussion({ index, text })
      discussionPressTimer.current = null
    }, 550)
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <Link href="/browse" className="inline-flex min-h-11 w-fit items-center gap-1 rounded-lg pr-3 text-sm font-bold text-muted-foreground hover:text-accent">
        <ChevronLeft className="size-4" aria-hidden="true" />
        Browse
      </Link>

      <Panel className="p-5 sm:p-8">
        <div className="flex flex-col gap-5 border-b border-border pb-5 sm:flex-row">
          <div className="relative aspect-[3/4] w-full shrink-0 overflow-hidden rounded-xl bg-secondary sm:w-48">
            {data.work.coverImageUrl
              ? <Image src={data.work.coverImageUrl} alt={`Cover for ${data.work.title}`} fill sizes="(max-width: 640px) 100vw, 192px" className="object-cover" unoptimized />
              : <div className="flex size-full items-center justify-center p-5 text-center text-sm text-muted-foreground">{data.work.type === 'story' ? 'Story cover' : 'Comic cover'}</div>}
          </div>
          <div className="flex min-w-0 flex-1 flex-col items-start">
            <span className="eyebrow">{data.work.type === 'story' ? 'Story' : 'Comic'} · {data.work.status}</span>
            <h1 className="mt-2 break-words font-serif text-3xl font-bold sm:text-4xl">{data.work.title}</h1>
            <Link href={`/profile/${encodeURIComponent(data.work.authorId)}`} className="mt-2 min-h-11 text-sm font-semibold text-accent hover:underline">
              by {data.work.authorName}{data.work.authorUsername ? ` · @${data.work.authorUsername}` : ''}
            </Link>
            <p className="mt-1 text-sm text-muted-foreground">{[data.work.genre, data.work.language].filter(Boolean).join(' · ')}</p>
            <div className="mt-auto flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void toggleLike()}
                disabled={liking || data.currentUserId === data.work.authorId}
                aria-pressed={liked}
                title={data.currentUserId === data.work.authorId ? 'Creators cannot like their own work' : undefined}
                className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-bold disabled:opacity-60 ${liked ? 'border-destructive/50 text-destructive' : 'border-border hover:border-destructive/50 hover:text-destructive'}`}
              >
                {liking ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Heart className={`size-4 ${liked ? 'fill-current' : ''}`} aria-hidden="true" />}
                {liked ? 'Liked' : 'Like'} · {likeCount.toLocaleString()}
              </button>
              {data.currentUserId === data.work.authorId && (
                <span className="text-xs text-muted-foreground">Creators cannot like their own work.</span>
              )}
              <button
                type="button"
                onClick={() => void toggleSaved()}
                disabled={saving}
                aria-pressed={isSaved}
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-4 text-sm font-bold hover:border-accent hover:text-accent disabled:opacity-60"
              >
                {saving ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Bookmark className={`size-4 ${isSaved ? 'fill-current' : ''}`} aria-hidden="true" />}
                {isSaved ? 'Saved to library' : 'Add to library'}
              </button>
              <span className="inline-flex min-h-11 items-center gap-2 px-2 text-xs text-muted-foreground" aria-label={`${viewCount.toLocaleString()} views`}>
                <Eye className="size-4" aria-hidden="true" />
                {viewCount.toLocaleString()} views
              </span>
            </div>
          </div>
        </div>

        {message && <p role="alert" className="mt-4 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">{message}</p>}
        {likeError && <p role="alert" className="mt-4 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">{likeError}</p>}
        {engagementError && <p role="status" className="mt-4 rounded-lg border border-border bg-secondary/50 px-4 py-3 text-sm text-muted-foreground">{engagementError}</p>}
        {progressError && <p role="status" className="mt-4 text-sm text-muted-foreground">{progressError}</p>}

        {data.work.type === 'story' && (
          <>
            {storyTab !== 'read' && <div role="tablist" aria-label="Story information" className="mt-4 flex gap-1 border-b border-border">
              {storyTabs.map((tab, index) => (
                <button
                  key={tab.id}
                  id={`reader-tab-${tab.id}`}
                  type="button"
                  role="tab"
                  aria-selected={storyTab === tab.id}
                  aria-controls={`reader-panel-${tab.id}`}
                  tabIndex={storyTab === tab.id ? 0 : -1}
                  onClick={() => setStoryTab(tab.id)}
                  onKeyDown={(event) => {
                    let nextIndex = index
                    if (event.key === 'ArrowRight') nextIndex = (index + 1) % storyTabs.length
                    else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + storyTabs.length) % storyTabs.length
                    else if (event.key === 'Home') nextIndex = 0
                    else if (event.key === 'End') nextIndex = storyTabs.length - 1
                    else return
                    event.preventDefault()
                    setStoryTab(storyTabs[nextIndex].id)
                    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex]?.focus()
                  }}
                  className={`min-h-12 border-b-2 px-4 text-sm font-semibold ${storyTab === tab.id ? 'border-accent text-accent' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>}
            {storyTab === 'about' && (
              <section id="reader-panel-about" role="tabpanel" aria-labelledby="reader-tab-about" className="py-6">
                <h2 className="font-serif text-2xl font-bold">Synopsis</h2>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-muted-foreground">{data.work.synopsis || 'Wala pang synopsis para sa story na ito.'}</p>
                <div className="mt-6 flex flex-wrap gap-2">
                  {data.work.genre && <span className="rounded-full bg-secondary px-3 py-1.5 text-xs font-semibold">{data.work.genre}</span>}
                  {data.work.language && <span className="rounded-full bg-secondary px-3 py-1.5 text-xs font-semibold">{data.work.language}</span>}
                  <span className="rounded-full bg-secondary px-3 py-1.5 text-xs font-semibold">{data.work.status}</span>
                </div>
                {data.currentChapter && (
                  <button type="button" onClick={() => setStoryTab('contents')} className="mt-6 min-h-11 rounded-full bg-accent px-5 text-sm font-bold text-accent-foreground">
                    Choose a chapter
                  </button>
                )}
              </section>
            )}
            {storyTab === 'contents' && (
              <section id="reader-panel-contents" role="tabpanel" aria-labelledby="reader-tab-contents" className="py-6">
                <h2 className="font-serif text-2xl font-bold">Table of Contents</h2>
                {data.chapters.length ? (
                  <ol className="mt-4 divide-y divide-border rounded-xl border border-border">
                    {data.chapters.map((chapter) => (
                      <li key={chapter.id}>
                        <Link href={`/works/${workId}?chapter=${chapter.number}`} onClick={() => setStoryTab('read')} className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-muted/50">
                          <span className="text-xs font-bold text-accent">{chapter.number}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-semibold">{chapter.title}</span>
                            <span className={`mt-0.5 block text-xs ${chapterProgress[chapter.id] === 'completed' ? 'font-semibold text-green-700 dark:text-green-400' : 'text-muted-foreground'}`}>
                              {chapterProgress[chapter.id] === 'completed'
                                ? 'Read'
                                : chapterProgress[chapter.id] === 'in_progress'
                                  ? 'Continue reading'
                                  : 'Start reading'}
                            </span>
                          </span>
                          <ChevronRight className="ml-auto size-4 text-muted-foreground" aria-hidden="true" />
                        </Link>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="mt-4 rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">Wala pang nailathalang kabanata.</p>
                )}
              </section>
            )}
          </>
        )}

        {data.work.type === 'comic' ? (
          comicPages.length ? (
            <section aria-label="Comic pages" className={`mt-6 overflow-hidden rounded-xl ${readerBackground}`}>
              <div className={`mx-auto flex max-w-3xl flex-col ${pageSpacing} ${data.comicReadingDirection === 'vertical' ? '' : 'p-3 sm:p-6'}`}>
                {(data.comicReadingDirection === 'vertical' ? comicPages : [comicPages[comicIndex] ?? comicPages[0]]).map((page) => (
                  <figure key={page.id} className="m-0">
                    <img src={page.imageUrl} alt={page.altText || `Comic page ${page.number}`} className="mx-auto block h-auto max-w-full" loading={page.number > 2 ? 'lazy' : 'eager'} />
                    {page.transcript && (
                      <figcaption className="mx-auto max-w-2xl p-4">
                        <details>
                          <summary className="min-h-11 cursor-pointer py-3 text-sm font-bold">Read page {page.number} transcript</summary>
                          <p className="whitespace-pre-wrap text-sm leading-6">{page.transcript}</p>
                        </details>
                      </figcaption>
                    )}
                  </figure>
                ))}
              </div>
              {data.comicReadingDirection !== 'vertical' && (
                <nav aria-label="Comic page navigation" className="flex items-center justify-between border-t border-current/15 p-3">
                  <button type="button" disabled={comicIndex <= 0} onClick={() => setComicIndex((index) => Math.max(0, index - 1))} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-current/20 px-4 text-sm font-bold disabled:opacity-40">
                    <ChevronLeft className="size-4" aria-hidden="true" /> Previous
                  </button>
                  <span className="text-xs">Page {comicIndex + 1} of {comicPages.length}</span>
                  <button type="button" disabled={comicIndex >= comicPages.length - 1} onClick={() => setComicIndex((index) => Math.min(comicPages.length - 1, index + 1))} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-accent px-4 text-sm font-bold text-accent-foreground disabled:opacity-40">
                    Next <ChevronRight className="size-4" aria-hidden="true" />
                  </button>
                </nav>
              )}
              {data.comicAuthorNote && <aside className="border-t border-current/15 p-5"><h2 className="font-bold">Author&apos;s note</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{data.comicAuthorNote}</p></aside>}
            </section>
          ) : (
            <div className="py-10 text-center">
              <h2 className="font-serif text-2xl font-bold">Wala pang nailathalang comic pages</h2>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">Subukan ulit mamaya habang inaayos ng artist ang episode.</p>
            </div>
          )
        ) : data.currentChapter && storyTab === 'read' ? (
          <article id="reader-panel-read" className="mx-auto max-w-2xl py-8">
            <button type="button" onClick={() => setStoryTab('contents')} className="mb-6 inline-flex min-h-11 items-center gap-1 rounded-lg pr-3 text-sm font-bold text-muted-foreground hover:text-accent">
              <ChevronLeft className="size-4" aria-hidden="true" />
              Back to chapters
            </button>
            <p className="text-center text-xs font-bold uppercase tracking-widest text-accent">
              Chapter {data.currentChapter.number}
            </p>
            <h2 className="mt-2 text-center font-serif text-2xl font-bold">{data.currentChapter.title}</h2>
            {chapterParagraphs.length ? (
              <div className="mt-8 space-y-6 font-serif text-lg leading-8">
                {chapterParagraphs.map((paragraph, index) => (
                  <section
                    key={`${data.currentChapter!.id}-${index}`}
                    className="group relative"
                    onPointerDown={(event) => beginParagraphPress(event, index, paragraph)}
                    onPointerUp={clearDiscussionPress}
                    onPointerCancel={clearDiscussionPress}
                    onPointerLeave={clearDiscussionPress}
                    onContextMenu={(event) => {
                      if (discussionPointerType.current !== 'touch') return
                      event.preventDefault()
                      clearDiscussionPress()
                      setSelectedDiscussion({ index, text: paragraph })
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => openDiscussion(index, paragraph)}
                      aria-expanded={selectedDiscussion?.index === index}
                      aria-label={`${selectedDiscussion?.index === index ? 'Close' : 'Open'} discussion for paragraph ${index + 1}`}
                      title="Discuss this paragraph"
                      className="absolute right-0 top-0 z-10 inline-flex size-8 -translate-y-2 items-center justify-center rounded-full border border-border bg-card/95 font-sans text-muted-foreground opacity-0 shadow-sm transition-opacity hover:border-accent hover:text-accent focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent group-hover:opacity-100 group-focus-within:opacity-100 max-lg:opacity-60"
                    >
                      <MessageCircle className="size-3.5" aria-hidden="true" />
                    </button>
                    <p className="whitespace-pre-wrap">{paragraph}</p>
                    {selectedDiscussion?.index === index && (
                      <div className="mt-4 font-sans text-base lg:fixed lg:right-6 lg:top-1/2 lg:z-30 lg:mt-0 lg:w-[min(26rem,calc(100vw-3rem))] lg:-translate-y-1/2">
                        <ChapterDiscussionPanel
                          chapterId={data.currentChapter!.id}
                          paragraphIndex={index}
                          anchorText={paragraph}
                          currentUserId={data.currentUserId}
                          onClose={() => setSelectedDiscussion(null)}
                          onLoginRequired={() => router.push(`/login?next=${encodeURIComponent(`/works/${data.work!.id}?chapter=${data.currentChapter!.number}`)}`)}
                        />
                      </div>
                    )}
                  </section>
                ))}
              </div>
            ) : (
              <p className="mt-8 text-center text-sm text-muted-foreground">Wala pang laman ang kabanatang ito.</p>
            )}
            <div
              aria-hidden="true"
              ref={(element) => {
                const chapter = data.currentChapter
                if (!element || !data.currentUserId || !chapter?.body.trim() || chapterProgress[chapter.id] !== 'in_progress') return
                const chapterId = chapter.id
                const observer = new IntersectionObserver((entries) => {
                  if (!entries.some((entry) => entry.isIntersecting) || completionInFlight.current.has(chapterId)) return
                  completionInFlight.current.add(chapterId)
                  void (async () => {
                    try {
                      const { data: recorded, error } = await getSupabaseClient().rpc('record_my_chapter_reading_progress', {
                        p_chapter_id: chapterId,
                        p_completed: true,
                      })
                      if (error) {
                        setProgressError('Could not save chapter completion. Check your connection and try again.')
                        return
                      }
                      const status = recorded?.[0]?.status
                      if (status === 'completed') setChapterProgress((current) => ({ ...current, [chapterId]: 'completed' }))
                    } catch {
                      setProgressError('Could not save chapter completion. Check your connection and try again.')
                    } finally {
                      completionInFlight.current.delete(chapterId)
                    }
                  })()
                }, { threshold: 1 })
                observer.observe(element)
                return () => observer.disconnect()
              }}
              className="h-px"
            />
          </article>
        ) : (
          <div className="py-10 text-center">
            <h2 className="font-serif text-2xl font-bold">Wala pang nailathalang kabanata</h2>
            <p className="mt-2 text-sm text-muted-foreground">Subukan ulit mamaya habang inaayos ng author ang kuwento.</p>
          </div>
        )}

        {data.work.type === 'story' && data.currentChapter && storyTab === 'read' && (
          <>
          <nav aria-label="Chapter navigation" className="flex items-center justify-between gap-4 border-t border-border pt-4">
            {previousChapter ? (
              <Link href={`/works/${data.work.id}?chapter=${previousChapter.number}`} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-4 text-sm font-bold hover:border-accent">
                <ChevronLeft className="size-4" aria-hidden="true" />
                Previous
              </Link>
            ) : <span />}
            <span className="text-xs text-muted-foreground">Chapter {chapterIndex + 1} of {data.chapters.length}</span>
            {nextChapter ? (
              <Link href={`/works/${data.work.id}?chapter=${nextChapter.number}`} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-accent px-4 text-sm font-bold text-accent-foreground">
                Next
                <ChevronRight className="size-4" aria-hidden="true" />
              </Link>
            ) : <span />}
          </nav>
          <button
            type="button"
            onClick={() => {
              const scrollableHeight = document.documentElement.scrollHeight - window.innerHeight
              window.scrollTo({ top: scrollableHeight * savedScrollProgress, behavior: 'smooth' })
            }}
            className="fixed bottom-4 right-4 z-20 inline-flex min-h-12 items-center gap-2 rounded-full bg-accent px-5 text-sm font-bold text-accent-foreground shadow-lg hover:brightness-95 sm:bottom-6 sm:right-6"
          >
            Continue Reading
          </button>
          </>
        )}
      </Panel>
    </div>
  )
}
