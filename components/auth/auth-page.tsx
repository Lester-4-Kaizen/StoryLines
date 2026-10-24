'use client'

import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, BookOpen, Check, Eye, EyeOff, Feather, Palette, LoaderCircle } from 'lucide-react'
import { getSupabaseClient } from '@/lib/supabase'
import { SiteFooter } from '@/components/shared/site-footer'
import { safeNextPath } from '@/lib/auth/redirect'
import { validateAuthInput, validateUsername, type FieldErrors } from '@/lib/auth/validation'
import { useAppState } from '@/lib/app-state'

type AuthPageMode = 'login' | 'signup' | 'forgot-password' | 'reset-password'
type Role = 'reader' | 'writer' | 'artist'

const ROLE_CARDS: { value: Role; title: string; description: string; icon: typeof BookOpen }[] = [
  { value: 'reader', title: 'Reader', description: 'Tumuklas ng kuwentong mamahalin.', icon: BookOpen },
  { value: 'writer', title: 'Writer', description: 'Ibahagi ang mga kuwentong dala mo.', icon: Feather },
  { value: 'artist', title: 'Alagad ng sining', description: 'Bigyang-buhay ang iyong mga ideya.', icon: Palette },
]

const COMMUNITY_LINES = [
  'Mas lumalago ang kuwento kapag pinagsasaluhan.',
  'Baka nandito na ang next creative collaborator mo.',
  'Reader ngayon, storyteller bukas.',
]

const BRAND_TAGLINES = [
  'May puwang ang bawat kuwentong dala mo.',
  'Dito nagsisimula ang susunod mong kuwento.',
  'Sa StoryLines, may makikinig sa kuwento mo.',
  'Tahanan ng likha at imahinasyong Pilipino.',
]

function inputClasses(hasError: boolean) {
  return `min-h-12 w-full rounded-xl border bg-background px-3.5 text-sm text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30 ${
    hasError ? 'border-destructive' : 'border-input'
  }`
}

function BrandPanel() {
  const [line, setLine] = useState(0)
  const [tagline, setTagline] = useState(0)

  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reducedMotion) return
    const timer = window.setInterval(() => {
      setLine((index) => (index + 1) % COMMUNITY_LINES.length)
      setTagline((index) => (index + 1) % BRAND_TAGLINES.length)
    }, 6000)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <>
      <header className="flex items-center gap-3 bg-primary px-5 py-4 text-primary-foreground lg:hidden">
        <span className="brand-mark size-9">
          <Image src="/storylines-logo.png" alt="" aria-hidden="true" width={36} height={36} className="size-full object-contain" />
        </span>
        <span className="font-serif text-xl font-bold">StoryLines</span>
      </header>
      <aside className="hidden min-h-screen flex-col justify-between bg-primary px-10 py-10 text-primary-foreground lg:flex xl:px-16">
        <Link href="/" className="flex w-fit items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">
          <span className="brand-mark size-11">
            <Image src="/storylines-logo.png" alt="" aria-hidden="true" width={44} height={44} className="size-full object-contain" />
          </span>
          <span className="font-serif text-2xl font-bold">StoryLines</span>
        </Link>
        <div className="max-w-xl py-16">
          <span className="eyebrow" style={{ color: 'var(--primary-foreground)' }}>Para sa bawat kuwentong dala mo</span>
          <h2 className="mt-5 min-h-[3.6em] font-serif text-5xl font-bold leading-tight xl:text-6xl" aria-live="polite">
            {BRAND_TAGLINES[tagline]}
          </h2>
          <p className="mt-7 min-h-12 max-w-md text-lg leading-7 text-primary-foreground/75" aria-live="polite">
            {COMMUNITY_LINES[line]}
          </p>
        </div>
        <p className="text-sm text-primary-foreground/65">Tahanan ng mga mambabasa, manunulat, at alagad ng sining na Pilipino.</p>
      </aside>
    </>
  )
}

function FieldError({ id, children }: { id: string; children?: string }) {
  return children ? <p id={id} className="text-sm font-medium text-destructive">{children}</p> : null
}

function SocialButtons({ onError }: { onError: (message: string) => void }) {
  const [provider, setProvider] = useState<'google' | 'facebook' | null>(null)

  const signIn = async (name: 'google' | 'facebook') => {
    setProvider(name)
    try {
      const callback = new URL('/auth/callback', window.location.origin)
      callback.searchParams.set('next', safeNextPath(new URLSearchParams(window.location.search).get('next')))
      const { error } = await getSupabaseClient().auth.signInWithOAuth({
        provider: name,
        options: { redirectTo: callback.toString() },
      })
      if (error) throw error
    } catch (error) {
      onError(error instanceof Error ? error.message : `Hindi namin masimulan ang ${name} sign-in. Subukan ulit.`)
      setProvider(null)
    }
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {(['google', 'facebook'] as const).map((name) => (
        <button
          key={name}
          type="button"
          onClick={() => void signIn(name)}
          disabled={provider !== null}
          className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-bold text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-wait disabled:opacity-70"
        >
          {provider === name ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : (
            <span aria-hidden="true" className={`grid size-5 place-items-center font-bold ${name === 'facebook' ? 'text-[#1877F2]' : 'text-foreground'}`}>
              {name === 'google' ? 'G' : 'f'}
            </span>
          )}
          Continue with {name === 'google' ? 'Google' : 'Facebook'}
        </button>
      ))}
    </div>
  )
}

function PasswordInput({
  id,
  label,
  value,
  onChange,
  autoComplete,
  error,
  onBlur,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  autoComplete: string
  error?: string
  onBlur?: () => void
}) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-bold">{label}</label>
      <div className="relative">
        <input
          id={id}
          name={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          autoComplete={autoComplete}
          required
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`${inputClasses(Boolean(error))} pr-12`}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          className="absolute inset-y-0 right-0 flex min-w-11 items-center justify-center rounded-r-xl text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent"
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
        >
          {visible ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
        </button>
      </div>
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </div>
  )
}

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    password.length >= 8,
    /[a-z]/.test(password) && /[A-Z]/.test(password),
    /\d/.test(password),
    /[^a-zA-Z0-9]/.test(password),
  ]
  const score = checks.filter(Boolean).length
  const label = !password ? 'At least 8 characters ang kailangan' : score < 2 ? 'Dagdagan pa natin ang tibay' : score < 4 ? 'Mas tumitibay na!' : 'Strong na ang password mo'
  const labelColor = score === checks.length ? 'text-success' : score >= 2 ? 'text-accent' : 'text-muted-foreground'

  return (
    <div className="mt-2" aria-live="polite">
      <div className="flex gap-1" aria-hidden="true">
        {checks.map((passed, index) => (
          <span key={index} className={`h-1 flex-1 rounded-full ${passed ? 'bg-success' : 'bg-border'}`} />
        ))}
      </div>
      <p className={`mt-1 text-xs ${labelColor}`}>{label}</p>
    </div>
  )
}

export function AuthPage({
  mode,
  next = '/',
  authError = false,
  accountDeleted = false,
  deviceCleanupFailed = false,
}: {
  mode: AuthPageMode
  next?: string
  authError?: boolean
  accountDeleted?: boolean
  deviceCleanupFailed?: boolean
}) {
  const router = useRouter()
  const { refreshSession } = useAppState()
  const safeNext = safeNextPath(next)
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [roles, setRoles] = useState<Role[]>(['reader'])
  const [terms, setTerms] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [errorSummary, setErrorSummary] = useState<string | null>(authError ? 'Expired o hindi na valid ang link na ito. Humingi ng bagong reset link sa ibaba.' : null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [confirmationRequired, setConfirmationRequired] = useState(false)
  const [unverifiedEmail, setUnverifiedEmail] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [usernameState, setUsernameState] = useState<'idle' | 'checking' | 'available' | 'taken' | 'error'>('idle')
  const [resendSeconds, setResendSeconds] = useState(0)
  const [hasRecoverySession, setHasRecoverySession] = useState(true)
  const [usernameCheckAttempt, setUsernameCheckAttempt] = useState(0)

  const isSignup = mode === 'signup'
  const passwordStrength = password

  useEffect(() => {
    if (!isSignup || !username.trim() || validateUsername(username)) {
      setUsernameState('idle')
      return
    }
    setUsernameState('checking')
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void fetch('/api/auth/username', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
        signal: controller.signal,
      }).then(async (response) => {
        const result = await response.json() as { available?: boolean; error?: string }
        if (!response.ok) throw new Error(result.error ?? 'Username availability could not be checked.')
        setUsernameState(result.available ? 'available' : 'taken')
      }).catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setUsernameState('error')
      })
    }, 450)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [isSignup, username, usernameCheckAttempt])

  useEffect(() => {
    if (!resendSeconds) return
    const timer = window.setTimeout(() => setResendSeconds((seconds) => seconds - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [resendSeconds])

  useEffect(() => {
    if (mode !== 'reset-password') return
    let active = true
    try {
      void getSupabaseClient().auth.getSession().then(({ data, error }) => {
        if (error) throw error
        if (active) setHasRecoverySession(Boolean(data.session))
      }).catch((error: unknown) => {
        if (active) setErrorSummary(error instanceof Error ? error.message : 'Hindi ma-verify ang reset link na ito.')
      })
    } catch (error) {
      setHasRecoverySession(false)
      setErrorSummary(error instanceof Error ? error.message : 'Supabase is not configured. Please contact the site owner.')
    }
    return () => {
      active = false
    }
  }, [mode])

  const setTopError = (message: string) => {
    setErrorSummary(message)
    setSuccessMessage(null)
  }

  const request = async (payload: Record<string, unknown>) => {
    const response = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    let result: { ok?: boolean; error?: string; code?: string; fields?: FieldErrors; message?: string; confirmationRequired?: boolean }
    try {
      result = await response.json()
    } catch {
      throw new Error('The server could not complete that request. Please try again shortly.')
    }
    if (!response.ok) return result
    return result
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFieldErrors({})
    setErrorSummary(null)
    setSuccessMessage(null)
    setUnverifiedEmail(false)

    let payload: Record<string, unknown>
    if (mode === 'signup') {
      payload = { action: 'signup', displayName, username, email, password, roles, terms, next: safeNext }
    } else if (mode === 'login') {
      payload = { action: 'login', email, password }
    } else if (mode === 'forgot-password') {
      payload = { action: 'forgot-password', email }
    } else {
      payload = { action: 'reset-password', password }
    }

    const validation = validateAuthInput(payload)
    if (Object.keys(validation.errors).length) {
      setFieldErrors(validation.errors)
      setErrorSummary('Pakisuri ang mga field na naka-highlight.')
      return
    }
    if (isSignup && usernameState !== 'available') {
      const message = usernameState === 'taken'
        ? 'May gumagamit na ng username na iyan.'
        : usernameState === 'error'
          ? 'Hindi namin ma-check ang username. Subukan ulit sandali.'
          : 'Hintaying matapos ang username check bago magpatuloy.'
      setFieldErrors({ username: message })
      setErrorSummary('Pakisuri ang mga field na naka-highlight.')
      return
    }
    if (mode === 'reset-password' && !hasRecoverySession) {
      setTopError('Expired o invalid na ang reset link. Humingi ng bagong password reset para magpatuloy.')
      return
    }

    setSubmitting(true)
    try {
      const result = await request(payload)
      if (result.fields) {
        setFieldErrors(result.fields)
        setErrorSummary(result.error ?? 'Pakisuri ang mga field na naka-highlight.')
      } else if (result.error) {
        if (result.code === 'email_not_confirmed') {
          setUnverifiedEmail(true)
          setErrorSummary(result.error)
        } else {
          setTopError(result.error)
        }
      } else if (mode === 'signup') {
        if (result.confirmationRequired) {
          setConfirmationRequired(true)
          setSuccessMessage('Silipin ang inbox mo para sa confirmation link. Maligayang pagdating!')
        } else {
          await refreshSession()
          router.push(safeNext)
        }
      } else if (mode === 'login') {
        await refreshSession()
        router.push(safeNext)
      } else if (mode === 'forgot-password') {
        setSuccessMessage(result.message ?? 'Kung may account gamit ang email na iyan, papunta na ang reset link.')
      } else {
        const { error } = await getSupabaseClient().auth.signOut()
        if (error) throw error
        setSuccessMessage('Na-update na ang password mo. Puwede ka nang mag-log in.')
        setPassword('')
        window.setTimeout(() => router.push('/login'), 1500)
      }
    } catch (error) {
      setTopError(error instanceof Error ? error.message : 'Hindi namin makumpleto ang request. Subukan ulit.')
    } finally {
      setSubmitting(false)
    }
  }

  const resendConfirmation = async () => {
    setSubmitting(true)
    setErrorSummary(null)
    try {
      const result = await request({ action: 'resend-confirmation', email, next: safeNext })
      if (result.error) setTopError(result.error)
      else {
        setSuccessMessage(result.message ?? 'Kung kailangan ng confirmation ang email na iyan, papunta na ang bagong link.')
        setResendSeconds(60)
      }
    } catch (error) {
      setTopError(error instanceof Error ? error.message : 'Hindi makapagpadala ng confirmation email. Subukan ulit.')
    } finally {
      setSubmitting(false)
    }
  }

  const toggleRole = (role: Role) => {
    setRoles((current) => current.includes(role) ? current.filter((item) => item !== role) : [...current, role])
    setFieldErrors((current) => ({ ...current, roles: undefined }))
  }

  const eyebrow: Record<AuthPageMode, string> = {
    login: 'Maligayang pagbabalik',
    signup: 'Para sa mga kuwentong dala mo',
    'forgot-password': 'May paraan para makabalik',
    'reset-password': 'Balik-kuwento na ulit',
  }
  const heading: Record<AuthPageMode, string> = {
    login: 'Welcome back',
    signup: 'Join StoryLines',
    'forgot-password': 'Reset your password',
    'reset-password': 'Pumili ng bagong password',
  }
  const explanation: Record<AuthPageMode, string> = {
    login: 'Balik na—naghihintay ang mga kuwento at kaibigan mo.',
    signup: 'Dito nagsisimula ang next chapter mo. Sulat, gawa, at makipag-collab.',
    'forgot-password': 'Ilagay ang email mo; padadalhan ka namin ng secure link.',
    'reset-password': 'Pumili ng bagong password para makabalik ka na.',
  }

  if (mode === 'signup' && confirmationRequired) {
    return (
      <PageFrame>
        <section className="auth-card w-full max-w-xl p-6 sm:p-9" aria-labelledby="auth-title">
          <p className="eyebrow">Huling hakbang</p>
          <h1 id="auth-title" className="mt-2 font-serif text-3xl font-bold">Check your inbox</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">Nagpadala kami ng confirmation link sa <strong className="text-foreground">{email}</strong>. Buksan ito para tuluyan ka nang makasali sa StoryLines.</p>
          <p role="status" className="mt-4 text-sm font-medium text-foreground">{successMessage}</p>
          {errorSummary && <p role="alert" className="mt-4 text-sm text-destructive">{errorSummary}</p>}
          <button type="button" onClick={() => void resendConfirmation()} disabled={submitting || resendSeconds > 0} className="auth-primary mt-6 w-full">
            {submitting ? <LoaderCircle className="size-4 animate-spin" /> : null}
            {resendSeconds ? `Resend in ${resendSeconds}s` : 'Ipadala ulit ang confirmation email'}
          </button>
          <p className="mt-4 text-center text-sm text-muted-foreground"><Link href="/login" className="auth-link">May account ka na? Log in</Link></p>
        </section>
      </PageFrame>
    )
  }

  return (
    <PageFrame>
      <section className="auth-card w-full max-w-xl p-5 sm:p-8 lg:p-10" aria-labelledby="auth-title">
        <p className="eyebrow">{eyebrow[mode]}</p>
        <h1 id="auth-title" className="mt-2 font-serif text-3xl font-bold sm:text-4xl">{heading[mode]}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{explanation[mode]}</p>
        {accountDeleted && mode === 'login' && (
          <p role="status" className="mt-4 rounded-xl border border-border bg-secondary/60 p-3.5 text-sm leading-5">
            Permanenteng nabura na ang account mo at ang associated data nito.
            {deviceCleanupFailed && ' May ilang local draft na hindi na-clear sa browser na ito; burahin ang StoryLines site data sa browser settings para alisin ang mga iyon.'}
          </p>
        )}

        {mode === 'reset-password' && !hasRecoverySession ? (
          <div className="mt-6 rounded-xl border border-border bg-secondary/50 p-4">
            <p role="alert" className="text-sm leading-6">{errorSummary ?? 'Expired o invalid na ang reset link na ito.'}</p>
            <Link href="/forgot-password" className="auth-link mt-3 inline-flex min-h-11 items-center">Humingi ng bagong reset link</Link>
          </div>
        ) : (
          <>
            {(mode === 'login' || mode === 'signup') && (
              <>
                <div className="mt-6"><SocialButtons onError={setTopError} /></div>
                <div className="my-5 flex items-center gap-3 text-xs font-medium text-muted-foreground">
                  <span className="h-px flex-1 bg-border" />
                  o gamit ang email mo
                  <span className="h-px flex-1 bg-border" />
                </div>
              </>
            )}

            {errorSummary && (
              <div role="alert" aria-live="assertive" className="mb-4 rounded-xl border border-destructive/40 bg-destructive/5 p-3.5 text-sm leading-5 text-destructive">
                <p className="font-bold">{errorSummary}</p>
                {unverifiedEmail && (
                  <button type="button" onClick={() => void resendConfirmation()} disabled={submitting || resendSeconds > 0} className="mt-2 min-h-11 font-bold underline underline-offset-2 disabled:opacity-60">
                    {resendSeconds ? `Resend sa loob ng ${resendSeconds}s` : 'Ipadala ulit ang confirmation email'}
                  </button>
                )}
              </div>
            )}
            {successMessage && <p role="status" className="mb-4 rounded-xl border border-success/30 bg-success/10 p-3.5 text-sm leading-5 text-success">{successMessage}</p>}

            <form onSubmit={(event) => void handleSubmit(event)} noValidate className="flex flex-col gap-4">
              {isSignup && (
                <>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="displayName" className="text-sm font-bold">Display name</label>
                    <input id="displayName" name="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" required maxLength={50} className={inputClasses(Boolean(fieldErrors.displayName))} aria-invalid={Boolean(fieldErrors.displayName)} aria-describedby={fieldErrors.displayName ? 'displayName-error' : undefined} placeholder="What should we call you?" />
                    <FieldError id="displayName-error">{fieldErrors.displayName}</FieldError>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="username" className="text-sm font-bold">Username</label>
                    <input id="username" name="username" value={username} onChange={(event) => { setUsername(event.target.value); setFieldErrors((current) => ({ ...current, username: undefined })) }} autoComplete="username" inputMode="text" required minLength={3} maxLength={20} className={inputClasses(Boolean(fieldErrors.username))} aria-invalid={Boolean(fieldErrors.username)} aria-describedby="username-help username-error" placeholder="e.g. kuwentista_ana" />
                    <p id="username-help" className="text-xs text-muted-foreground">3–20 character: letters, numbers, o underscore (_).</p>
                    <p id="username-error" aria-live="polite" className={`text-sm ${fieldErrors.username || usernameState === 'taken' || usernameState === 'error' ? 'font-medium text-destructive' : usernameState === 'available' ? 'font-medium text-success' : 'text-muted-foreground'}`}>
                      {fieldErrors.username ?? (usernameState === 'taken' ? 'May gumagamit na ng username na iyan.' : usernameState === 'available' ? 'Puwede ang username na ito!' : usernameState === 'checking' ? 'Tinitingnan kung puwede pa…' : usernameState === 'error' ? 'Hindi ma-check ngayon. Subukan ulit sandali.' : '')}
                    </p>
                    {usernameState === 'error' && (
                      <button type="button" onClick={() => setUsernameCheckAttempt((attempt) => attempt + 1)} className="min-h-11 w-fit text-sm font-bold text-accent underline underline-offset-2">
                        Check again
                      </button>
                    )}
                  </div>
                </>
              )}

              {mode !== 'reset-password' && (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="email" className="text-sm font-bold">Email</label>
                  <input id="email" name="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" inputMode="email" required className={inputClasses(Boolean(fieldErrors.email))} aria-invalid={Boolean(fieldErrors.email)} aria-describedby={fieldErrors.email ? 'email-error' : undefined} placeholder="you@example.com" />
                  <FieldError id="email-error">{fieldErrors.email}</FieldError>
                </div>
              )}

              {(mode === 'login' || isSignup || mode === 'reset-password') && (
                <div>
                  <PasswordInput
                    id="password"
                    label={mode === 'reset-password' ? 'New password' : 'Password'}
                    value={password}
                    onChange={setPassword}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    error={fieldErrors.password}
                  />
                  {isSignup && <PasswordStrength password={passwordStrength} />}
                  {mode === 'reset-password' && !hasRecoverySession && <p className="mt-1 text-xs text-muted-foreground">Use at least 8 characters.</p>}
                </div>
              )}

              {mode === 'login' && (
                <div className="flex items-center justify-between gap-3">
                  <Link href="/forgot-password" className="auth-link flex min-h-11 items-center">Forgot password?</Link>
                </div>
              )}

              {isSignup && (
                <>
                  <fieldset className="min-w-0">
                    <legend className="mb-2 text-sm font-bold">I’m here as a… <span className="font-normal text-muted-foreground">(piliin lahat ng bagay sa’yo)</span></legend>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {ROLE_CARDS.map(({ value, title, description, icon: Icon }) => {
                        const selected = roles.includes(value)
                        return (
                          <button
                            key={value}
                            type="button"
                            onClick={() => toggleRole(value)}
                            aria-pressed={selected}
                            className={`flex min-h-20 items-start gap-2 rounded-xl border p-3 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${selected ? 'border-accent bg-secondary/70' : 'border-border bg-background hover:bg-muted'}`}
                          >
                            <Icon className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
                            <span className="min-w-0">
                              <span className="flex items-center gap-1 text-sm font-bold">{title}{selected && <Check className="size-3.5" aria-hidden="true" />}</span>
                              <span className="mt-0.5 block text-xs leading-4 text-muted-foreground">{description}</span>
                            </span>
                          </button>
                        )
                      })}
                    </div>
                    <FieldError id="roles-error">{fieldErrors.roles}</FieldError>
                  </fieldset>
                  <div>
                    <label className="flex min-h-11 items-start gap-2.5 text-sm leading-5">
                      <input type="checkbox" checked={terms} onChange={(event) => setTerms(event.target.checked)} className="toggle mt-0.5 shrink-0" aria-invalid={Boolean(fieldErrors.terms)} aria-describedby={fieldErrors.terms ? 'terms-error' : undefined} />
                      <span>I agree to the <Link href="/terms" className="auth-link">Terms</Link> and <Link href="/privacy" className="auth-link">Privacy Policy</Link>.</span>
                    </label>
                    <FieldError id="terms-error">{fieldErrors.terms}</FieldError>
                  </div>
                </>
              )}

              <button type="submit" disabled={submitting || (isSignup && usernameState === 'checking')} className="auth-primary mt-1 w-full">
                {submitting ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
                {submitting ? 'Please wait…' : mode === 'login' ? 'Log in' : mode === 'signup' ? 'Create account' : mode === 'forgot-password' ? 'Send reset link' : 'Update password'}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              {mode === 'login' ? <>Bago ka sa StoryLines? <Link href={`/signup?next=${encodeURIComponent(safeNext)}`} className="auth-link">Gumawa ng account</Link></> : null}
              {mode === 'signup' ? <>May account ka na? <Link href={`/login?next=${encodeURIComponent(safeNext)}`} className="auth-link">Log in</Link></> : null}
              {mode === 'forgot-password' ? <>Naalala mo na? <Link href="/login" className="auth-link">Balik sa log in</Link></> : null}
              {mode === 'reset-password' && successMessage ? <Link href="/login" className="auth-link">Mag-log in na</Link> : null}
            </p>
          </>
        )}
      </section>
    </PageFrame>
  )
}

function PageFrame({ children }: { children: ReactNode }) {
  return (
    <main className="grid min-h-screen bg-background lg:grid-cols-[0.9fr_1.1fr]">
      <BrandPanel />
      <div className="flex min-h-[calc(100dvh-4rem)] flex-col px-4 py-7 sm:px-8 sm:py-10 lg:min-h-screen lg:px-10 xl:px-16">
        <div className="flex flex-1 items-start justify-center lg:items-center">
          <div className="w-full max-w-xl">
            <Link
              href="/"
              className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-bold text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Bumalik sa StoryLines
            </Link>
            {children}
          </div>
        </div>
        <div className="mx-auto w-full max-w-xl">
          <SiteFooter />
        </div>
      </div>
    </main>
  )
}
