'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  BookOpenText,
  Flag,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Search,
  Settings,
  Shield,
  ShieldAlert,
  Users,
} from 'lucide-react'
import { getSupabaseClient } from '@/lib/supabase'

const navigation = [
  { label: 'Overview', href: '/admin', icon: LayoutDashboard },
  { label: 'Reports', href: '/admin/reports', icon: Flag },
  { label: 'Warning appeals', href: '/admin/appeals', icon: ShieldAlert },
  { label: 'Users', href: '/admin/users', icon: Users },
  { label: 'Content', href: '/admin/content', icon: BookOpenText },
  { label: 'Audit log', href: '/admin/audit', icon: ListChecks },
  { label: 'Staff & settings', href: '/admin/staff', icon: Settings, adminOnly: true },
]

export function AdminLayout({
  children,
  displayName,
  staffRole,
}: {
  children: React.ReactNode
  displayName: string
  staffRole: 'moderator' | 'admin'
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [signingOut, setSigningOut] = useState(false)

  const signOut = async () => {
    setSigningOut(true)
    setError(null)
    const { error: signOutError } = await getSupabaseClient().auth.signOut()
    if (signOutError) {
      setError(signOutError.message)
      setSigningOut(false)
      return
    }
    router.replace('/login')
  }

  return (
    <div className="min-h-screen bg-[#f1e6d2] text-[#442a1c] lg:grid lg:grid-cols-[13.75rem_minmax(0,1fr)]">
      <aside className="flex flex-col bg-[#2b140b] px-4 py-4 text-[#f9ebd7] lg:min-h-screen lg:px-4 lg:py-5">
        <Link href="/admin" className="px-2 font-serif text-2xl font-bold tracking-tight">StoryLines</Link>
        <span className="ml-2 mt-1 w-fit rounded bg-[#e8ad39] px-2 py-0.5 text-[10px] font-extrabold tracking-[0.16em] text-[#2b140b]">
          {staffRole.toUpperCase()}
        </span>
        <nav className="mt-4 grid grid-cols-2 gap-1 sm:grid-cols-3 lg:mt-6 lg:grid-cols-1" aria-label="Admin navigation">
          {navigation.filter((item) => !item.adminOnly || staffRole === 'admin').map(({ label, href, icon: Icon }) => {
            const active = pathname === href || (href !== '/admin' && pathname.startsWith(`${href}/`))
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-semibold transition ${
                  active ? 'border-l-2 border-[#e6ad38] bg-[#4e2919]' : 'hover:bg-white/10'
                }`}
              >
                <Icon className="size-4 shrink-0" />
                {label}
              </Link>
            )
          })}
        </nav>
        <div className="mt-auto hidden border-t border-white/10 pt-5 lg:block">
          <div className="mt-5 flex items-center gap-3 px-2">
            <span className="flex size-9 items-center justify-center rounded-full bg-[#edddc3] text-sm font-bold text-[#442a1c]">
              {displayName.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{displayName}</p>
              <p className="text-xs capitalize text-[#d7b99d]">{staffRole}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void signOut()}
            disabled={signingOut}
            className="mt-3 flex min-h-10 items-center gap-2 px-2 text-sm text-[#d7b99d] hover:text-white disabled:opacity-60"
          >
            <LogOut className="size-4" /> {signingOut ? 'Logging out…' : 'Log out'}
          </button>
          {error && <p role="alert" className="mt-2 px-2 text-xs text-red-200">{error}</p>}
        </div>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-10 flex min-h-14 items-center justify-between gap-3 border-b border-[#e3d0b7] bg-[#fffaf1]/95 px-5 backdrop-blur lg:px-8">
          <h1 className="font-serif text-2xl font-bold capitalize">{pathname.split('/').filter(Boolean).pop()?.replaceAll('-', ' ') || 'Overview'}</h1>
          <div className="hidden items-center gap-2 rounded-full border border-[#dfc9ac] bg-[#f7eddd] px-3 py-2 text-xs text-[#866c58] sm:flex">
            <Search className="size-3.5" /> Admin moderation workspace
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f5c9bc] px-3 py-1.5 text-xs font-bold text-[#9a351f]">
            <Shield className="size-3.5" /> Staff access
          </span>
        </header>
        {error && <p role="alert" className="mx-4 mt-4 rounded-xl bg-[#f8ded5] p-3 text-sm text-[#822816] sm:mx-6 lg:mx-8">{error}</p>}
        <main className="mx-auto max-w-[94rem] p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
      <div className="fixed bottom-3 right-3 z-20 lg:hidden">
        <button
          type="button"
          onClick={() => void signOut()}
          disabled={signingOut}
          className="flex min-h-10 items-center gap-2 rounded-full bg-[#2b140b] px-4 text-xs font-bold text-white shadow-lg"
        >
          <LogOut className="size-4" /> Log out
        </button>
      </div>
    </div>
  )
}
