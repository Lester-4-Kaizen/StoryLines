'use client'

import { useEffect, useRef, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import Image from 'next/image'
import { X } from 'lucide-react'
import { ProfileAvatar } from '@/components/shared/profile-avatar'

export function PostDetailDialog({
  author,
  username,
  avatarUrl,
  createdAt,
  content,
  images,
  tags,
  onClose,
}: {
  author: string
  username?: string
  avatarUrl?: string | null
  createdAt: string | number
  content: string
  images: string[]
  tags: string[]
  onClose: () => void
}) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLElement>(null)

  useEffect(() => {
    closeRef.current?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key !== 'Tab') return
    const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled)'))
    const first = focusable[0]
    const last = focusable.at(-1)
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first?.focus()
    }
  }

  const isoDate = typeof createdAt === 'number' ? new Date(createdAt).toISOString() : createdAt

  return createPortal(
    <div
      className="fixed inset-0 z-[55] flex items-center justify-center bg-black/65 p-3 sm:p-6"
      onPointerDown={(event) => {
        event.stopPropagation()
        if (!dialogRef.current?.contains(event.target as Node)) onClose()
      }}
      onClick={(event) => {
        event.stopPropagation()
      }}
    >
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="post-detail-title" onKeyDown={handleKeyDown} className="flex max-h-[min(92dvh,54rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl md:flex-row">
        {images.length > 0 && (
          <div className="relative min-h-56 bg-black md:min-h-[34rem] md:flex-1">
            {images.length === 1 ? (
              <Image src={images[0]} alt={`Image shared by ${author}`} fill sizes="(max-width: 768px) 100vw, 60vw" className="object-contain" unoptimized />
            ) : (
              <div className="grid h-full min-h-56 auto-rows-fr grid-cols-2 gap-1 p-1 md:min-h-[34rem]">
                {images.map((image, index) => (
                  <div key={`${image}-${index}`} className="relative min-h-28 overflow-hidden bg-black">
                    <Image src={image} alt={`Image ${index + 1} shared by ${author}`} fill sizes="(max-width: 768px) 50vw, 30vw" className="object-contain" unoptimized />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <div className={`flex min-h-0 flex-col ${images.length ? 'md:w-[24rem] md:shrink-0' : 'w-full'}`}>
          <header className="flex items-center gap-3 border-b border-border px-4 py-3">
            <ProfileAvatar src={avatarUrl} name={author} />
            <div className="min-w-0 flex-1">
              <h2 id="post-detail-title" className="truncate text-sm font-bold">{author}</h2>
              <p className="truncate text-xs text-muted-foreground">
                {username ? `@${username} · ` : ''}<time dateTime={isoDate}>{new Date(isoDate).toLocaleString()}</time>
              </p>
            </div>
            <button ref={closeRef} type="button" onClick={onClose} aria-label="Close post" className="flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">
              <X className="size-5" />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <p className="whitespace-pre-wrap break-words text-sm leading-6">{content}</p>
            {tags.length > 0 && (
              <ul className="mt-4 flex flex-wrap gap-2" aria-label="Post tags">
                {tags.map((tag) => <li key={tag} className="rounded-full bg-secondary px-3 py-1.5 text-xs text-secondary-foreground">#{tag}</li>)}
              </ul>
            )}
          </div>
        </div>
      </section>
    </div>,
    document.body,
  )
}
