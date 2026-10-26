'use client'

import { useEffect, useState } from 'react'
import { Download, Check, Smartphone, X } from 'lucide-react'
import Link from 'next/link'
import { usePwaInstall } from '@/components/shared/use-pwa-install'

function platformInstructions(platform: 'ios' | 'android' | 'desktop' | 'other') {
  if (platform === 'ios') {
    return 'Sa Safari, pindutin ang Share, pagkatapos ay “Add to Home Screen.”'
  }
  if (platform === 'android') {
    return 'Sa Chrome menu, pindutin ang “Add to Home screen” o “Install app.”'
  }
  if (platform === 'desktop') {
    return 'Sa address bar ng browser, hanapin ang install icon at piliing Install.'
  }
  return 'Sa browser menu, hanapin ang “Install app” o “Add to Home Screen.”'
}

export function PwaInstallPanel({ compact = false }: { compact?: boolean }) {
  const { installed, installing, canPrompt, platform, install } = usePwaInstall()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!confirmOpen) return
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setConfirmOpen(false)
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [confirmOpen])

  const confirmInstall = async () => {
    setError(null)
    try {
      const accepted = await install()
      setConfirmOpen(false)
      if (!accepted) setError('Hindi natuloy ang installation. Puwede mong subukan ulit.')
    } catch (installError) {
      setError(installError instanceof Error ? installError.message : 'Hindi natuloy ang installation.')
    }
  }

  return (
    <div className={compact ? 'flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center' : 'mt-5 flex flex-col gap-4'}>
      <div className="min-w-0 flex-1">
        {installed ? (
          <>
            <h2 className={compact ? 'text-base font-bold' : 'font-serif text-xl font-bold'}>Naka-install na ang StoryLines</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">May app icon na ito sa iyong device at puwede mong buksan nang fullscreen.</p>
          </>
        ) : (
          <>
            <h2 className={compact ? 'text-base font-bold' : 'font-serif text-xl font-bold'}>Dalhin ang StoryLines sa phone mo</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {compact ? 'Magbasa at gumawa kahit saan, mula sa home screen.' : platformInstructions(platform)}
            </p>
          </>
        )}
      </div>

      {installed ? (
        <span className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full border border-border px-5 text-sm font-bold">
          <Check className="size-4 text-accent" aria-hidden="true" /> Installed
        </span>
      ) : canPrompt ? (
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={installing}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-accent px-5 text-sm font-bold text-accent-foreground hover:brightness-95 disabled:opacity-60"
        >
          <Download className="size-4" aria-hidden="true" />
          {installing ? 'Installing…' : 'Install app'}
        </button>
      ) : compact ? (
        <Link
          href="/settings"
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full border border-border px-5 text-sm font-bold hover:bg-muted"
        >
          <Smartphone className="size-4" aria-hidden="true" /> Tingnan ang steps
        </Link>
      ) : (
        <div className="rounded-xl border border-border bg-background p-4">
          <p className="text-sm leading-6 text-muted-foreground">Kapag wala sa browser menu ang opsyon sa installation, i-update ang browser o buksan ang StoryLines sa HTTPS.</p>
        </div>
      )}

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      {confirmOpen && (
        <div className="fixed inset-0 z-70 flex items-end justify-center bg-primary/45 p-3 backdrop-blur-[2px] sm:items-center sm:p-6" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setConfirmOpen(false)
        }}>
          <section role="dialog" aria-modal="true" aria-labelledby="install-storylines-title" className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl sm:p-6">
            <div className="flex items-start gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent" aria-hidden="true">
                <Smartphone className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 id="install-storylines-title" className="font-serif text-2xl font-bold">Install StoryLines?</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">Idagdag ang app sa home screen mo para mabilis at isang-tap ang bukas, nang walang address bar.</p>
              </div>
              <button type="button" onClick={() => setConfirmOpen(false)} className="rounded-full p-2 text-muted-foreground hover:bg-muted" aria-label="Close install confirmation">
                <X className="size-4" />
              </button>
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setConfirmOpen(false)} disabled={installing} className="min-h-11 rounded-full border border-border px-5 text-sm font-bold hover:bg-muted disabled:opacity-60">
                Not now
              </button>
              <button type="button" onClick={() => void confirmInstall()} disabled={installing} className="min-h-11 rounded-full bg-accent px-5 text-sm font-bold text-accent-foreground hover:brightness-95 disabled:opacity-60">
                {installing ? 'Opening installer…' : 'Add to device'}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
