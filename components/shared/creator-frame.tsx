import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BookOpen, Brush, ChartNoAxesCombined, LayoutDashboard, PenLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BackButton } from '@/components/shared/back-button'
import type { Route } from '@/lib/types'

const STUDIO_LINKS: { href: Route; label: string; icon: React.ReactNode }[] = [
  { href: '/create', label: 'Dashboard', icon: <LayoutDashboard className="size-4" /> },
  { href: '/create/works', label: 'My works', icon: <BookOpen className="size-4" /> },
  { href: '/create/portfolio', label: 'Portfolio', icon: <Brush className="size-4" /> },
  { href: '/create/works/analytics', label: 'Analytics', icon: <ChartNoAxesCombined className="size-4" /> },
]

export function CreatorFrame({
  title,
  eyebrow,
  children,
  go,
  backHref = '/create',
}: {
  title: string
  eyebrow: string
  children: React.ReactNode
  go: (route: Route) => void
  backHref?: string
}) {
  const pathname = usePathname()
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <BackButton fallbackHref={backHref} />
          <span className="eyebrow">{eyebrow}</span>
          <h1 className="mt-1 font-serif text-5xl font-bold text-balance">{title}</h1>
        </div>
        <Button onClick={() => go('/create/works/new')} className="min-h-11 rounded-lg bg-accent text-accent-foreground">
          <PenLine data-icon="inline-start" /> New work
        </Button>
      </div>
      <nav aria-label="Creator studio" className="-mt-3 flex gap-2 overflow-x-auto border-b border-border pb-2">
        {STUDIO_LINKS.map((item) => (
          <Link key={item.href} href={item.href} aria-current={pathname === item.href ? 'page' : undefined} className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-ring ${pathname === item.href ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'}`}>
            {item.icon}{item.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  )
}
