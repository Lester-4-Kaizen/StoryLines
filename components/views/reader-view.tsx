'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Bookmark, ChevronLeft, ChevronRight, LoaderCircle } from 'lucide-react'
import { Panel } from '@/components/shared/panel'
import { getSupabaseClient } from '@/lib/supabase'
import type { ReaderPageData } from '@/lib/reader-data'

export function ReaderView({ data }: { data: ReaderPageData }) {
  const router = useRouter()
  const [isSaved, setIsSaved] = useState(data.isSaved)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(data.error)
  const [progressError, setProgressError] = useState<string | null>(null)

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
  const previousChapter = chapterIndex > 0 ? data.chapters[chapterIndex - 1] : null
  const nextChapter = chapterIndex >= 0 ? data.chapters[chapterIndex + 1] : null

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <Link href="/browse" className="inline-flex min-h-11 w-fit items-center gap-1 rounded-lg pr-3 text-sm font-bold text-muted-foreground hover:text-accent">
        <ChevronLeft className="size-4" aria-hidden="true" />
        Browse
      </Link>

      <Panel className="p-5 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
          <div className="min-w-0">
            <span className="eyebrow">{data.work.type === 'story' ? 'Story' : 'Comic'}</span>
            <h1 className="mt-2 break-words font-serif text-3xl font-bold sm:text-4xl">{data.work.title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              by {data.work.authorName}{data.work.authorUsername ? ` · @${data.work.authorUsername}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void toggleSaved()}
            disabled={saving}
            aria-pressed={isSaved}
            className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-border px-4 text-sm font-bold hover:border-accent hover:text-accent disabled:opacity-60"
          >
            {saving ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Bookmark className={`size-4 ${isSaved ? 'fill-current' : ''}`} aria-hidden="true" />}
            {isSaved ? 'Saved' : 'Save to library'}
          </button>
        </div>

        {message && <p role="alert" className="mt-4 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">{message}</p>}
        {progressError && <p role="status" className="mt-4 text-sm text-muted-foreground">{progressError}</p>}

        {data.work.type === 'comic' ? (
          <div className="py-10 text-center">
            <h2 className="font-serif text-2xl font-bold">Hindi pa available ang comic pages</h2>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
              Naka-save na ang comic na ito sa StoryLines, pero hindi pa naka-store ang mga pahina nito para mabasa rito.
            </p>
          </div>
        ) : data.currentChapter ? (
          <article className="mx-auto max-w-2xl py-8">
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

        {data.work.type === 'story' && data.currentChapter && (
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
