'use client'

import { useEffect, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, Moon, Sun } from 'lucide-react'
import { Panel } from '@/components/shared/panel'
import { getSupabaseClient } from '@/lib/supabase'
import type { Badge } from '@/lib/types'

function clearLocalAccountData(userId: string) {
  const draftPrefix = `storylines-editor-draft:${userId}:`
  const draftKeys: string[] = []
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index)
    if (key?.startsWith(draftPrefix)) draftKeys.push(key)
  }
  for (const key of draftKeys) window.localStorage.removeItem(key)

  const legacyPosts = window.localStorage.getItem('storylines-community-posts')
  if (!legacyPosts) return
  const parsed: unknown = JSON.parse(legacyPosts)
  if (!Array.isArray(parsed)) throw new Error('The saved community post list is not valid JSON data.')
  const remaining = parsed.filter((post: unknown) => (
    typeof post !== 'object'
    || post === null
    || !('authorId' in post)
    || Reflect.get(post, 'authorId') !== userId
  ))
  window.localStorage.setItem('storylines-community-posts', JSON.stringify(remaining))
}

export function SettingsView({
  badges,
  activeRole,
  changeRole,
  saveBadges,
  themeMode,
  setThemeMode,
  isLoggedIn,
}: {
  badges: Badge[]
  activeRole: Badge
  changeRole: (role: Badge) => Promise<void>
  saveBadges: (badges: Badge[]) => Promise<void>
  themeMode: 'light' | 'dark'
  setThemeMode: (mode: 'light' | 'dark') => void
  isLoggedIn: boolean
}) {
  const router = useRouter()
  const [draftBadges, setDraftBadges] = useState(badges)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [roleSaving, setRoleSaving] = useState(false)
  const [roleError, setRoleError] = useState<string | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [deletePending, setDeletePending] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    setDraftBadges(badges)
  }, [badges])

  const toggleDraftBadge = (badge: Badge) => {
    setDraftBadges((current) => {
      const next = current.includes(badge)
        ? current.filter((item) => item !== badge)
        : [...current, badge]
      return next.length ? next : ['reader']
    })
    setSaved(false)
    setSaveError(null)
  }

  const saveChanges = async () => {
    setSaving(true)
    setSaveError(null)
    setSaved(false)
    try {
      await saveBadges(draftBadges)
      setSaved(true)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Hindi na-save ang iyong roles. Subukan ulit.')
    } finally {
      setSaving(false)
    }
  }

  const selectRole = async (role: Badge) => {
    setRoleSaving(true)
    setRoleError(null)
    try {
      await changeRole(role)
    } catch (error) {
      setRoleError(error instanceof Error ? error.message : 'Hindi napalitan ang active role. Subukan ulit.')
    } finally {
      setRoleSaving(false)
    }
  }

  const deleteAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!isLoggedIn || deleteConfirmation !== 'DELETE' || deletePending) return
    setDeletePending(true)
    setDeleteError(null)

    try {
      const supabase = getSupabaseClient()
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError
      if (!user) throw new Error('Mag-log in ulit bago burahin ang account.')

      const { error } = await supabase.functions.invoke('delete-account', {
        body: { confirmation: deleteConfirmation },
      })
      if (error) {
        let message = error.message
        if (error.context instanceof Response) {
          try {
            const payload: unknown = await error.context.clone().json()
            if (
              typeof payload === 'object'
              && payload !== null
              && 'error' in payload
              && typeof payload.error === 'string'
            ) {
              message = payload.error
            }
          } catch (parseError) {
            console.error('Could not read the account deletion error response', parseError)
          }
        }
        throw new Error(message)
      }

      let deviceCleanupFailed = false
      try {
        clearLocalAccountData(user.id)
      } catch (cleanupError) {
        console.error('Account was deleted, but this browser could not clear all local account drafts', cleanupError)
        deviceCleanupFailed = true
      }

      const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' })
      if (signOutError) console.error('Account was deleted, but its local session could not be cleared', signOutError)
      router.replace(`/login?account=deleted${deviceCleanupFailed ? '&deviceCleanup=failed' : ''}`)
      router.refresh()
    } catch (error) {
      setDeleteError(error instanceof Error
        ? error.message
        : 'Hindi natapos ang account deletion. Walang pagbabago kung hindi nakumpirma ang pagtanggal. Subukan ulit.')
    } finally {
      setDeletePending(false)
    }
  }

  return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
        <div className="flex min-w-0 flex-col gap-4">
          <Panel className="p-5 sm:p-7 lg:p-8">
            <span className="eyebrow">Ikaw ang masusunod dito</span>
            <h1 className="mt-3 font-serif text-3xl font-bold sm:text-4xl">Upgrade account</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Puwede kang pumili ng higit sa isang role. Ikaw ang bahala kung paano sasali. Switch any badge on or off at any time.
            </p>
            <div className="mt-5 border-t border-border">
              <div className="flex items-center gap-4 border-b border-border py-4">
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-bold">Reader</h2>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">Read stories and comics, follow creators, and join the conversation.</p>
                  <p className="mt-1 text-xs text-muted-foreground">Always on</p>
                </div>
                <span className="shrink-0 rounded-full border border-border px-3 py-1.5 text-xs font-bold">Included</span>
              </div>
              <div className="flex items-center gap-4 border-b border-border py-4">
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-bold">Writer badge</h2>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">Maglathala ng kuwento at magbahagi sa community.</p>
                  <p className="mt-1 text-xs text-muted-foreground">Unlocks: publishing stories · posting in Community · Story editor</p>
                </div>
                <label className="flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center">
                  <span className="sr-only">Writer badge</span>
                  <input type="checkbox" checked={draftBadges.includes('writer')} onChange={() => toggleDraftBadge('writer')} className="toggle" />
                </label>
              </div>
              <div className="flex items-center gap-4 border-b border-border py-4">
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-bold">Artist / Comics badge</h2>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">Mag-publish ng comics at ibahagi ang mga illustrated na likha mo.</p>
                  <p className="mt-1 text-xs text-muted-foreground">Unlocks: publishing comics · art portfolio · posting in Community</p>
                </div>
                <label className="flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center">
                  <span className="sr-only">Artist badge</span>
                  <input type="checkbox" checked={draftBadges.includes('artist')} onChange={() => toggleDraftBadge('artist')} className="toggle" />
                </label>
              </div>
            </div>
            {badges.length > 1 && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background p-4">
                <div>
                  <label htmlFor="active-role" className="text-sm font-bold">Active role</label>
                  <p className="mt-1 text-xs text-muted-foreground">Piliin kung Reader, Writer, o Artist ang gagamitin sa Community.</p>
                </div>
                <select
                  id="active-role"
                  value={activeRole}
                  disabled={roleSaving}
                  onChange={(event) => {
                    const selected = event.target.value
                    if (selected === 'reader' || selected === 'writer' || selected === 'artist') {
                      void selectRole(selected)
                    }
                  }}
                  className="min-h-11 rounded-lg border border-border bg-card px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60"
                >
                  {badges.map((badge) => (
                    <option key={badge} value={badge}>
                      {badge === 'artist' ? 'Artist / Comics' : badge.charAt(0).toUpperCase() + badge.slice(1)}
                    </option>
                  ))}
                </select>
                {roleError && <p role="alert" className="w-full text-sm text-destructive">{roleError}</p>}
              </div>
            )}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div aria-live="polite" className="text-sm text-muted-foreground">
                {saveError ? <span role="alert" className="text-destructive">{saveError}</span> : saved ? 'Changes saved.' : 'Your badges show on your profile.'}
              </div>
              <button
                type="button"
                onClick={() => void saveChanges()}
                disabled={saving || draftBadges.length === badges.length && draftBadges.every((badge) => badges.includes(badge))}
                className="min-h-11 rounded-full bg-accent px-5 text-sm font-bold text-accent-foreground hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </Panel>

          <Panel className="p-5 sm:p-7 lg:p-8">
            <span className="eyebrow">Personalize your reading space</span>
            <h2 className="mt-2 font-serif text-2xl font-bold">Theme mode</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">Piliin ang komportableng itsura ng StoryLines sa device na ito.</p>
            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2" role="group" aria-label="Theme mode">
              <button
                type="button"
                aria-pressed={themeMode === 'light'}
                onClick={() => setThemeMode('light')}
                className={`flex min-h-14 items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                  themeMode === 'light' ? 'border-accent bg-secondary text-foreground' : 'border-border bg-card hover:bg-muted'
                }`}
              >
                <span className="inline-flex items-center gap-3"><Sun className="size-5 text-accent" /> Light</span>
                {themeMode === 'light' && <Check className="size-4 text-accent" aria-hidden="true" />}
              </button>
              <button
                type="button"
                aria-pressed={themeMode === 'dark'}
                onClick={() => setThemeMode('dark')}
                className={`flex min-h-14 items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                  themeMode === 'dark' ? 'border-accent bg-secondary text-foreground' : 'border-border bg-card hover:bg-muted'
                }`}
              >
                <span className="inline-flex items-center gap-3"><Moon className="size-5 text-accent" /> Dark</span>
                {themeMode === 'dark' && <Check className="size-4 text-accent" aria-hidden="true" />}
              </button>
            </div>
          </Panel>

          <Panel className="border-destructive/40 p-5 sm:p-7 lg:p-8">
            <span className="eyebrow text-destructive">Irreversible action</span>
            <h2 className="mt-2 font-serif text-2xl font-bold">Delete account</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Permanenteng mabubura ang profile, posts, comments, stories, comics, likes, saves, follows, messages, at uploaded images mo. Hindi na ito maibabalik.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Kung password lang ang gusto mong palitan, <Link href="/forgot-password" className="font-semibold text-accent underline underline-offset-2">mag-reset ng password</Link> sa halip.
            </p>
            {!isLoggedIn ? (
              <Link
                href="/login?next=%2Fsettings"
                className="mt-4 inline-flex min-h-11 items-center rounded-full border border-border px-5 text-sm font-bold hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
              >
                Mag-log in para magpatuloy
              </Link>
            ) : !deleteOpen ? (
              <button
                type="button"
                onClick={() => {
                  setDeleteOpen(true)
                  setDeleteError(null)
                }}
                className="mt-4 min-h-11 rounded-full border border-destructive px-5 text-sm font-bold text-destructive hover:bg-destructive/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                Permanently delete account
              </button>
            ) : (
              <form className="mt-4 grid gap-3" onSubmit={(event) => void deleteAccount(event)}>
                <label htmlFor="delete-account-confirmation" className="text-sm font-semibold">
                  Type <span className="font-mono">DELETE</span> to confirm
                </label>
                <input
                  id="delete-account-confirmation"
                  type="text"
                  autoComplete="off"
                  value={deleteConfirmation}
                  onChange={(event) => setDeleteConfirmation(event.target.value)}
                  disabled={deletePending}
                  className="min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                  aria-describedby={deleteError ? 'delete-account-error' : undefined}
                  required
                />
                {deleteError && <p id="delete-account-error" role="alert" className="text-sm text-destructive">{deleteError}</p>}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={deletePending}
                    onClick={() => {
                      setDeleteOpen(false)
                      setDeleteConfirmation('')
                      setDeleteError(null)
                    }}
                    className="min-h-11 rounded-full border border-border px-5 text-sm font-semibold hover:bg-muted disabled:opacity-60"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={deletePending || deleteConfirmation !== 'DELETE'}
                    className="min-h-11 rounded-full bg-destructive px-5 text-sm font-bold text-white hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {deletePending ? 'Deleting account…' : 'Delete everything'}
                  </button>
                </div>
              </form>
            )}
          </Panel>
        </div>
      </div>
  )
}
