'use client'

import { useState } from 'react'
import { Brush, Heart, ImagePlus, MessageCircle, PenLine, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/shared/empty-state'
import { Panel } from '@/components/shared/panel'
import { useCommunity } from '@/lib/community-store'
import type { Badge } from '@/lib/types'

const MAX_IMAGE_SIZE = 1024 * 1024

function timeAgo(ts: number) {
  const seconds = Math.floor((Date.now() - ts) / 1000)
  if (seconds < 60) return 'Just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function CommunityView({
  creator,
  isLoggedIn,
  role,
  onUnlock,
}: {
  creator: boolean
  isLoggedIn: boolean
  role: Badge
  onUnlock: () => void
}) {
  const { posts, hydrated, addPost, toggleLike } = useCommunity()
  const [draft, setDraft] = useState('')
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null)
  const [imageError, setImageError] = useState<string | null>(null)

  const handleImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setImageError(null)

    if (!file.type.startsWith('image/')) {
      setImageError('Choose an image file to attach.')
      return
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setImageError('Images must be 1 MB or smaller in this demo.')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') setImageDataUrl(reader.result)
      else setImageError('This image could not be loaded. Try another file.')
    }
    reader.onerror = () => setImageError('This image could not be loaded. Try another file.')
    reader.readAsDataURL(file)
  }

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!draft.trim()) return
    const authorRole: 'writer' | 'artist' = role === 'artist' ? 'artist' : 'writer'
    addPost(draft.trim(), authorRole, imageDataUrl ?? undefined)
    setDraft('')
    setImageDataUrl(null)
    setImageError(null)
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="hero-panel rounded-2xl border border-border px-6 py-8 sm:px-9 sm:py-10">
        <span className="eyebrow">The town square</span>
        <h1 className="mt-3 max-w-3xl font-serif text-4xl font-bold text-balance sm:text-5xl">Community, at its gentlest.</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
          A place for reading recommendations, creator notes, and the small conversations around the work.
        </p>
      </div>
      <div className="grid gap-8 lg:grid-cols-[1fr_280px]">
        <section aria-label="Community feed" className="flex flex-col gap-5">
          {creator && isLoggedIn ? (
            <Panel>
              <form onSubmit={submit}>
                <label htmlFor="community-post" className="sr-only">Share an update</label>
                <textarea
                  id="community-post"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="What are you reading, writing, or dreaming up?"
                  className="min-h-28 w-full resize-none bg-transparent text-sm leading-6 outline-none placeholder:text-muted-foreground/75"
                />
                {imageDataUrl && (
                  <div className="relative mt-2 inline-block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imageDataUrl} alt="Selected attachment preview" className="max-h-48 rounded-lg border border-border object-cover" />
                    <button
                      type="button"
                      onClick={() => {
                        setImageDataUrl(null)
                        setImageError(null)
                      }}
                      aria-label="Remove image"
                      className="absolute -right-2 -top-2 rounded-full border border-border bg-card p-1 shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                )}
                {imageError && <p role="alert" className="mt-2 text-xs font-medium text-destructive">{imageError}</p>}
                <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4">
                  <label className="flex cursor-pointer items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground">
                    <ImagePlus className="size-4" />
                    Add image
                    <input type="file" accept="image/*" className="sr-only" onChange={handleImage} />
                  </label>
                  <Button type="submit" disabled={!draft.trim()} className="rounded-lg bg-accent text-accent-foreground">
                    Post update
                  </Button>
                </div>
                <p className="mt-2 text-right text-[11px] text-muted-foreground">Images are limited to 1 MB.</p>
              </form>
            </Panel>
          ) : (
            <Panel className="hero-panel">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="font-serif text-xl font-bold">{isLoggedIn ? 'Want to share a note?' : 'Join the conversation'}</h2>
                  <p className="mt-1 text-sm leading-5 text-muted-foreground">
                    {isLoggedIn
                      ? 'Choose a Writer or Artist badge to share updates with the community.'
                      : 'Sign in and choose a Writer or Artist badge to share your own updates.'}
                  </p>
                </div>
                <Button variant="outline" onClick={onUnlock} className="shrink-0 rounded-lg">
                  {isLoggedIn ? 'Unlock posting' : 'Sign in to post'}
                </Button>
              </div>
            </Panel>
          )}

          {!hydrated ? null : posts.length === 0 ? (
            <EmptyState icon={<MessageCircle />} title="No conversation yet" message="Be the first to share a reading recommendation or a little note from your creative process." />
          ) : (
            <div className="flex flex-col gap-4">
              {posts.map((post) => (
                <Panel key={post.id} className="transition-shadow hover:shadow-[0_5px_18px_rgba(68,45,31,0.08)]">
                  <div className="flex items-start gap-3">
                    <span className="section-icon" aria-hidden="true">{post.authorRole === 'artist' ? <Brush className="size-4" /> : <PenLine className="size-4" />}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold">{post.authorRole === 'artist' ? 'Artist' : 'Writer'}</span>
                        <span className="text-xs text-muted-foreground">· {timeAgo(post.createdAt)}</span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{post.content}</p>
                      {post.imageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={post.imageUrl} alt="Image shared with this update" className="mt-3 max-h-72 w-full rounded-lg border border-border object-cover" />
                      )}
                      <button
                        type="button"
                        onClick={() => toggleLike(post.id)}
                        aria-pressed={post.likedByMe}
                        aria-label={`${post.likedByMe ? 'Unlike' : 'Like'} update${post.likes > 0 ? `, ${post.likes} ${post.likes === 1 ? 'like' : 'likes'}` : ''}`}
                        className={`mt-3 flex items-center gap-1.5 rounded px-1 py-1 text-xs font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${post.likedByMe ? 'text-accent' : 'text-muted-foreground hover:text-foreground'}`}
                      >
                        <Heart className={`size-3.5 ${post.likedByMe ? 'fill-accent' : ''}`} />
                        {post.likes > 0 ? post.likes : 'Like'}
                      </button>
                    </div>
                  </div>
                </Panel>
              ))}
            </div>
          )}
        </section>
        <Panel className="h-fit lg:sticky lg:top-24">
          <span className="section-icon"><Sparkles className="size-4" /></span>
          <h2 className="mt-4 font-serif text-xl font-bold">Community notes</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">A slower, kinder corner for discussing the work and finding your next favorite story.</p>
          <div className="mt-5 border-t border-border pt-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">A good place for</h3>
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              <li className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-accent" /> Reading recommendations</li>
              <li className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-accent" /> Work-in-progress notes</li>
              <li className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-accent" /> Kind, thoughtful feedback</li>
            </ul>
          </div>
        </Panel>
      </div>
    </div>
  )
}