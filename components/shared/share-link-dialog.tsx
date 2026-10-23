'use client'

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Check, Copy, X } from 'lucide-react'

export function ShareLinkDialog({
  title,
  url,
  onClose,
}: {
  title: string
  url: string
  onClose: () => void
}) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    closeRef.current?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  const copyLink = async () => {
    setError(null)
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch (copyError) {
      setError(copyError instanceof Error ? `Hindi makopya ang link: ${copyError.message}` : 'Hindi makopya ang link sa device na ito.')
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key !== 'Tab') return
    const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled)',
    ))
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

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4" onClick={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section role="dialog" aria-modal="true" aria-labelledby="share-link-title" onKeyDown={handleKeyDown} className="w-full max-w-lg rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-2xl sm:p-6">
        <header className="flex items-start justify-between gap-3">
          <div>
            <p className="eyebrow">Share</p>
            <h2 id="share-link-title" className="mt-1 font-serif text-2xl font-bold">{title}</h2>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close share dialog" className="flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">
            <X className="size-5" />
          </button>
        </header>
        <p className="mt-3 text-sm text-muted-foreground">Copy and share this link with your community.</p>
        <label htmlFor="share-link-url" className="sr-only">Share link</label>
        <input id="share-link-url" readOnly value={url} onFocus={(event) => event.currentTarget.select()} className="mt-4 min-h-12 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        <button type="button" onClick={() => void copyLink()} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full bg-accent px-5 text-sm font-bold text-accent-foreground hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? 'Link copied' : 'Copy link'}
        </button>
        {copied && <p role="status" className="mt-3 text-sm text-accent">Link copied to clipboard.</p>}
        {error && <p role="alert" className="mt-3 break-words text-sm text-destructive">{error}</p>}
      </section>
    </div>
  )
}
