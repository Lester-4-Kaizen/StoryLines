'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FieldSelect } from '@/components/shared/field-select'
import { useAppState } from '@/lib/app-state'
import type { Badge, Route } from '@/lib/types'

const ROLE_OPTIONS = ['Reader', 'Writer', 'Artist']

function toBadge(label: string): Badge {
  if (label === 'Writer') return 'writer'
  if (label === 'Artist') return 'artist'
  return 'reader'
}

// Why this is showing up depends on what was clicked (authNext) — "Start
// a new work" should feel connected to what you're about to see, not like
// a generic wall.
const NEXT_MESSAGES: { prefix: string; message: string }[] = [
  { prefix: '/create', message: 'Log in to start creating.' },
  { prefix: '/library', message: 'Log in to save to your library.' },
  { prefix: '/collaborate', message: 'Log in to start collaborating.' },
  { prefix: '/settings', message: 'Log in to manage your account.' },
  { prefix: '/profile', message: 'Log in to view your profile.' },
]

function contextualMessage(next: Route) {
  return NEXT_MESSAGES.find((entry) => next === entry.prefix || next.startsWith(`${entry.prefix}/`))?.message
}

export function AuthModal() {
  const { authNext, authTab, signIn, signUp, closeAuth, go } = useAppState()
  const [tab, setTab] = useState(authTab)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [roleLabel, setRoleLabel] = useState('Reader')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const contextMessage = contextualMessage(authNext)

  const selectTab = (nextTab: 'login' | 'register') => {
    setTab(nextTab)
    setError(null)
    setMessage(null)
  }

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setMessage(null)

    if (tab === 'register' && password !== confirmPassword) {
      setError('Your passwords do not match.')
      return
    }

    setSubmitting(true)
    try {
      if (tab === 'register') {
        const confirmationRequired = await signUp(email, password, displayName.trim(), toBadge(roleLabel), authNext)
        if (confirmationRequired) {
          setMessage('Your account is ready. Check your email for a confirmation link before signing in.')
          return
        }
      } else {
        await signIn(email, password)
      }
      closeAuth()
      go(authNext)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Authentication failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/40 p-4" role="dialog" aria-modal="true">
      <div className="paper-panel max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto bg-card p-6 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="eyebrow">Welcome home</span>
            <h2 className="mt-2 font-serif text-2xl font-bold sm:text-3xl">{contextMessage ?? (tab === 'login' ? 'Come on in.' : 'Join us.')}</h2>
          </div>
          <button onClick={closeAuth} aria-label="Close" className="shrink-0 rounded-full p-2 hover:bg-muted">
            <X className="size-5" />
          </button>
        </div>

        <div className="mt-5 flex gap-2 border-b border-border">
          <button
            type="button"
            onClick={() => selectTab('login')}
            className={`border-b-2 px-1 py-2 text-sm font-bold ${tab === 'login' ? 'border-accent text-accent' : 'border-transparent text-muted-foreground'}`}
          >
            Log in
          </button>
          <button
            type="button"
            onClick={() => selectTab('register')}
            className={`border-b-2 px-1 py-2 text-sm font-bold ${tab === 'register' ? 'border-accent text-accent' : 'border-transparent text-muted-foreground'}`}
          >
            Register
          </button>
        </div>

        <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
          {tab === 'register' && (
            <label className="flex flex-col gap-1.5 text-xs font-bold">
              Display name
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="What should people call you?"
                autoComplete="name"
                required
                className="rounded-lg border border-input bg-background px-3 py-2.5 text-sm font-normal outline-none focus:border-accent"
              />
            </label>
          )}
          <label className="flex flex-col gap-1.5 text-xs font-bold">
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
              className="rounded-lg border border-input bg-background px-3 py-2.5 text-sm font-normal outline-none focus:border-accent"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-bold">
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete={tab === 'register' ? 'new-password' : 'current-password'}
              minLength={8}
              required
              className="rounded-lg border border-input bg-background px-3 py-2.5 text-sm font-normal outline-none focus:border-accent"
            />
          </label>
          {tab === 'register' && (
            <label className="flex flex-col gap-1.5 text-xs font-bold">
              Confirm password
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                minLength={8}
                required
                className="rounded-lg border border-input bg-background px-3 py-2.5 text-sm font-normal outline-none focus:border-accent"
              />
            </label>
          )}

          {tab === 'register' && <FieldSelect label="Continue as" value={roleLabel} onChange={setRoleLabel} options={ROLE_OPTIONS} />}

          {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
          {message && <p role="status" className="text-sm font-medium text-foreground">{message}</p>}
          <Button type="submit" disabled={submitting} className="mt-1 rounded-lg bg-accent text-accent-foreground">
            {submitting ? 'Please wait…' : tab === 'login' ? 'Log in' : 'Create account'}
          </Button>
        </form>
      </div>
    </div>
  )
}