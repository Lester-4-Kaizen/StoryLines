import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { PenLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Route } from '@/lib/types'

const STUDIO_LINKS: { href: Route; label: string }[] = [
  { href: '/create', label: 'Dashboard' },
  { href: '/create/works', label: 'My works' },
  { href: '/create/portfolio', label: 'Portfolio' },
  { href: '/create/works/analytics', label: 'Analytics' },
]

export function CreatorFrame({
  title,
  eyebrow,
  children,
  go,
}: {
  title: string
  eyebrow: string
  children: React.ReactNode
  go: (route: Route) => void
}) {
  const pathname = usePathname()
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 sm:gap-6">
      <header className="flex flex-col justify-between gap-4 border-b border-border pb-4 sm:flex-row sm:items-center sm:pb-3">
        <div className="min-w-0">
          <span className="eyebrow">{eyebrow}</span>
          <h1 className="mt-1 font-serif text-4xl font-bold leading-tight text-balance sm:text-5xl">{title}</h1>
        </div>
        <Button onClick={() => go('/create/works/new')} className="min-h-11 shrink-0 rounded-full bg-accent text-accent-foreground">
          <PenLine data-icon="inline-start" /> New work
        </Button>
      </header>
      <nav aria-label="Creator studio" className="-mt-2 flex gap-1 overflow-x-auto pb-1">
        {STUDIO_LINKS.map((item) => (
          <Link key={item.href} href={item.href} aria-current={pathname === item.href ? 'page' : undefined} className={`inline-flex min-h-10 shrink-0 items-center rounded-full px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${pathname === item.href ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}>
            {item.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  )
}
