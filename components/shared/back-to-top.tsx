'use client'

import { useEffect, useState } from 'react'
import { ArrowUp } from 'lucide-react'

export function BackToTop() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const updateVisibility = () => setVisible(window.scrollY > 360)
    updateVisibility()
    window.addEventListener('scroll', updateVisibility, { passive: true })
    return () => window.removeEventListener('scroll', updateVisibility)
  }, [])

  return (
    <button
      type="button"
      disabled={!visible}
      onClick={() => {
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        window.scrollTo({ top: 0, behavior: reduceMotion ? 'instant' : 'smooth' })
      }}
      aria-label="Back to top"
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      className={`back-to-top${visible ? ' back-to-top-visible' : ''}`}
    >
      <ArrowUp className="size-5" aria-hidden="true" />
    </button>
  )
}
