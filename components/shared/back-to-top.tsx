'use client'

import { ArrowUp } from 'lucide-react'
import { usePathname } from 'next/navigation'

export function BackToTop() {
  const pathname = usePathname()
  if (pathname === '/messages') return null

  return (
    <button
      type="button"
      onClick={() => {
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        window.scrollTo({ top: 0, behavior: reduceMotion ? 'instant' : 'smooth' })
      }}
      aria-label="Back to top"
      className="back-to-top back-to-top-visible"
    >
      <ArrowUp className="size-5" aria-hidden="true" />
    </button>
  )
}
