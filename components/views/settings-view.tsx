'use client'

import { useEffect, useState } from 'react'
import { Check, Moon, Sun } from 'lucide-react'
import { Panel } from '@/components/shared/panel'
import type { Badge } from '@/lib/types'

export function SettingsView({
  badges,
  activeRole,
  changeRole,
  saveBadges,
  themeMode,
  setThemeMode,
}: {
  badges: Badge[]
  activeRole: Badge
  changeRole: (role: Badge) => Promise<void>
  saveBadges: (badges: Badge[]) => Promise<void>
  themeMode: 'light' | 'dark'
  setThemeMode: (mode: 'light' | 'dark') => void
}) {
  const [draftBadges, setDraftBadges] = useState(badges)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [roleSaving, setRoleSaving] = useState(false)
  const [roleError, setRoleError] = useState<string | null>(null)

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

  return (
    <div className="flex flex-col gap-4">
      <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-8">
        <aside className="flex gap-1 overflow-x-auto lg:flex-col" aria-label="Settings sections">
          {['Account', 'Privacy', 'Notifications', 'Upgrade account', 'Premium'].map((item) => (
            <button
              key={item}
              type="button"
              disabled={item !== 'Upgrade account'}
              aria-current={item === 'Upgrade account' ? 'page' : undefined}
              className={`min-h-11 whitespace-nowrap rounded-xl px-4 py-3 text-left text-sm font-bold disabled:cursor-default disabled:opacity-70 ${
                item === 'Upgrade account' ? 'bg-secondary text-foreground' : 'text-foreground hover:bg-muted'
              }`}
            >
              {item}
            </button>
          ))}
        </aside>
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
        </div>
      </div>
    </div>
  )
}
