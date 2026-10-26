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
        <Panel className="p-3 sm:p-4">
          <p className="eyebrow px-2">Preferences</p>
          <h1 className="px-2 pt-1 font-serif text-2xl font-bold">Settings</h1>
          <nav aria-label="Settings navigation" className="mt-3 grid grid-cols-2 gap-2 lg:mt-4 lg:grid-cols-1 lg:gap-1">
            {navigation
              .filter((item) => !item.requiresLogin || isLoggedIn)
              .map(({ label, href, icon: Icon }) => {
                const active = pathname === href
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? 'page' : undefined}
                    className={`flex min-h-12 min-w-0 items-center gap-2 rounded-xl px-2 py-2 text-left text-xs font-semibold leading-tight transition-colors focus-visible:outline-2 focus-visible:outline-ring sm:px-3 sm:text-sm lg:min-h-11 lg:gap-3 lg:py-0 ${
                      active ? 'bg-secondary text-accent' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                    <span className="min-w-0">{label}</span>
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
