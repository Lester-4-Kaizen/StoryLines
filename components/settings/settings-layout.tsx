'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AppWindow, Database, ShieldCheck, UserRound } from 'lucide-react'
import { Panel } from '@/components/shared/panel'
import { useAppState } from '@/lib/app-state'

const navigation = [
  { label: 'Account & roles', href: '/settings/account', icon: UserRound },
  { label: 'Privacy & safety', href: '/settings/privacy', icon: ShieldCheck, requiresLogin: true },
  { label: 'Appearance & device', href: '/settings/appearance', icon: AppWindow },
  { label: 'Account data', href: '/settings/account-data', icon: Database },
]

export function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { isLoggedIn } = useAppState()

  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-[14rem_minmax(0,1fr)] lg:items-start">
      <aside className="lg:sticky lg:top-6">
        <Panel className="p-4">
          <p className="eyebrow px-2">Preferences</p>
          <h1 className="px-2 pt-1 font-serif text-2xl font-bold">Settings</h1>
          <nav aria-label="Settings navigation" className="mt-4 flex gap-1 overflow-x-auto lg:grid lg:overflow-visible">
            {navigation
              .filter((item) => !item.requiresLogin || isLoggedIn)
              .map(({ label, href, icon: Icon }) => {
                const active = pathname === href
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? 'page' : undefined}
                    className={`flex min-h-11 shrink-0 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-ring lg:shrink ${
                      active ? 'bg-secondary text-accent' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                    {label}
                  </Link>
                )
              })}
          </nav>
        </Panel>
      </aside>
      <main className="min-w-0">{children}</main>
    </div>
  )
}
