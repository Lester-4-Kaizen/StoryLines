'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Bookmark, ChevronLeft, ChevronRight, LoaderCircle } from 'lucide-react'
import { Panel } from '@/components/shared/panel'
import { getSupabaseClient } from '@/lib/supabase'
import type { ReaderPageData } from '@/lib/reader-data'

export function ReaderView({ data, initialChapterSelected = false }: { data: ReaderPageData; initialChapterSelected?: boolean }) {
  const router = useRouter()
  const [storyTab, setStoryTab] = useState<'about' | 'contents' | 'read'>(initialChapterSelected && data.currentChapter ? 'read' : 'about')
  const [isSaved, setIsSaved] = useState(data.isSaved)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(data.error)
  const [progressError, setProgressError] = useState<string | null>(null)
  const [comicIndex, setComicIndex] = useState(0)

  useEffect(() => {
    setIsSaved(data.isSaved)
    setMessage(data.error)
  }, [data.isSaved, data.error])

  useEffect(() => {
    if (!data.currentUserId || !data.work || !data.currentChapter || data.work.type !== 'story') return
    let active = true
    const supabase = getSupabaseClient()
    void supabase.from('library_reading_progress').upsert({
      user_id: data.currentUserId,
      work_id: data.work.id,
      chapter_id: data.currentChapter.id,
      last_read_at: new Date().toISOString(),
    }, { onConflict: 'user_id,work_id' }).then(({ error }) => {
      if (active && error) setProgressError('Hindi na-save ang reading progress mo. Subukan ulit mamaya.')
    })
    return () => {
      active = false
    }
  }, [data.currentChapter, data.currentUserId, data.work])

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
  const storyTabs: { id: 'about' | 'contents' | 'read'; label: string }[] = [
    { id: 'about', label: 'About' },
    { id: 'contents', label: 'Table of Contents' },
    ...(data.currentChapter ? [{ id: 'read' as const, label: `Chapter ${data.currentChapter.number}` }] : []),
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
            <button
              type="button"
              onClick={() => void toggleSaved()}
              disabled={saving}
              aria-pressed={isSaved}
              className="mt-auto inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-4 text-sm font-bold hover:border-accent hover:text-accent disabled:opacity-60"
            >
              {saving ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Bookmark className={`size-4 ${isSaved ? 'fill-current' : ''}`} aria-hidden="true" />}
              {isSaved ? 'Saved to library' : 'Add to library'}
            </button>
          </div>
        </div>

        {message && <p role="alert" className="mt-4 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">{message}</p>}
        {progressError && <p role="status" className="mt-4 text-sm text-muted-foreground">{progressError}</p>}

        {data.work.type === 'story' && (
          <>
            <div role="tablist" aria-label="Story information" className="mt-4 flex gap-1 border-b border-border">
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
            </div>
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
                  <button type="button" onClick={() => setStoryTab('read')} className="mt-6 min-h-11 rounded-full bg-accent px-5 text-sm font-bold text-accent-foreground">
                    Start reading
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
                          <span className="font-semibold">{chapter.title}</span>
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
          <article id="reader-panel-read" role="tabpanel" aria-labelledby="reader-tab-read" className="mx-auto max-w-2xl py-8">
            <p className="text-center text-xs font-bold uppercase tracking-widest text-accent">
              Chapter {data.currentChapter.number}
            </p>
            <h2 className="mt-2 text-center font-serif text-2xl font-bold">{data.currentChapter.title}</h2>
            {data.currentChapter.body ? (
              <div className="mt-8 whitespace-pre-wrap font-serif text-lg leading-8">{data.currentChapter.body}</div>
            ) : (
              <p className="mt-8 text-center text-sm text-muted-foreground">Wala pang laman ang kabanatang ito.</p>
            )}
          </article>
        ) : (
          <div className="py-10 text-center">
            <h2 className="font-serif text-2xl font-bold">Wala pang nailathalang kabanata</h2>
            <p className="mt-2 text-sm text-muted-foreground">Subukan ulit mamaya habang inaayos ng author ang kuwento.</p>
          </div>
        )}

        {data.work.type === 'story' && data.currentChapter && storyTab === 'read' && (
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
        )}
      </Panel>
    </div>
  )
}
