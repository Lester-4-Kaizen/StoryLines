import { Panel } from '@/components/shared/panel'
import { SettingRow } from '@/components/shared/setting-row'
import { BackButton } from '@/components/shared/back-button'
import { Check, Moon, Sun } from 'lucide-react'
import type { Badge } from '@/lib/types'

export function SettingsView({
  badges,
  toggleBadge,
  themeMode,
  setThemeMode,
}: {
  badges: Badge[]
  toggleBadge: (b: Badge) => void
  themeMode: 'light' | 'dark'
  setThemeMode: (mode: 'light' | 'dark') => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <BackButton fallbackHref="/profile" />
      <div className="mx-auto grid w-full max-w-3xl gap-4">
        <Panel className="p-5 sm:p-8">
          <span className="eyebrow">Ikaw ang masusunod dito</span>
          <h1 className="mt-3 font-serif text-3xl font-bold sm:text-4xl">Upgrade Account</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Puwede kang pumili ng higit sa isang role. Ikaw ang bahala kung paano sasali.</p>
          <div className="mt-7 flex flex-col gap-5">
            <SettingRow
              title="Writer badge"
              description="Maglathala ng kuwento at magbahagi sa community."
              control={<input type="checkbox" checked={badges.includes('writer')} onChange={() => toggleBadge('writer')} className="toggle" />}
            />
            <SettingRow
              title="Alagad ng sining badge"
              description="Ibahagi ang artwork at mga illustrated na likha mo."
              control={<input type="checkbox" checked={badges.includes('artist')} onChange={() => toggleBadge('artist')} className="toggle" />}
            />
          </div>
        </Panel>
        <Panel className="p-5 sm:p-8">
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
  )
}
