import { Button } from '@/components/ui/button'
import { BackButton } from '@/components/shared/back-button'
import type { Route } from '@/lib/types'

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
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <BackButton fallbackHref={backHref} />
          <span className="eyebrow">{eyebrow}</span>
          <h1 className="mt-1 font-serif text-5xl font-bold text-balance">{title}</h1>
        </div>
        <Button variant="outline" onClick={() => go('/create')} className="rounded-lg">
          Dashboard ng creator
        </Button>
      </div>
      {children}
    </div>
  )
}
