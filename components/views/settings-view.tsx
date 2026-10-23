import { Panel } from '@/components/shared/panel'
import { SettingRow } from '@/components/shared/setting-row'
import { BackButton } from '@/components/shared/back-button'
import type { Badge } from '@/lib/types'

export function SettingsView({ badges, toggleBadge }: { badges: Badge[]; toggleBadge: (b: Badge) => void }) {
  return (
    <div className="flex flex-col gap-4">
      <BackButton fallbackHref="/profile" />
      <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
        <aside className="flex gap-1 overflow-x-auto lg:flex-col">
          {['Account', 'Privacy', 'Notifications', 'Upgrade Account', 'Premium'].map((item) => (
            <button key={item} className="whitespace-nowrap rounded-lg px-4 py-3 text-left text-sm font-bold hover:bg-muted">
              {item}
            </button>
          ))}
        </aside>
        <Panel className="p-6 sm:p-8">
          <span className="eyebrow">Ikaw ang masusunod dito</span>
          <h1 className="mt-3 font-serif text-3xl font-bold">Upgrade Account</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Puwede kang pumili ng higit sa isang role. Ikaw ang bahala kung paano sasali.</p>
          <div className="mt-8 flex flex-col gap-5">
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
      </div>
    </div>
  )
}
