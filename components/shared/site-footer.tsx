import Link from 'next/link'
import { ArrowUpRight, BookOpenText } from 'lucide-react'

export function SiteFooter({ compact = false }: { compact?: boolean }) {
  return (
    <footer className={`hidden border-t border-border/70 sm:block ${compact ? 'mt-4 bg-transparent' : 'mt-8 bg-secondary/35'}`}>
      <div className={`mx-auto ${compact ? 'max-w-xl px-0 py-3' : 'max-w-7xl px-4 py-4 sm:px-6 lg:px-8'}`}>
        <div className={`flex gap-3 ${compact ? 'flex-row items-center justify-between' : 'flex-col sm:flex-row sm:items-center sm:justify-between'}`}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Link href="/" className={`inline-flex items-center gap-2 rounded-lg font-serif font-bold text-foreground transition-colors hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring ${compact ? 'min-h-8 text-base' : 'min-h-9 text-lg'}`}>
              <span className={`flex items-center justify-center rounded-lg bg-primary text-primary-foreground ${compact ? 'size-6' : 'size-7'}`}>
                <BookOpenText className={compact ? 'size-3.5' : 'size-4'} aria-hidden="true" />
              </span>
              StoryLines
            </Link>
            {!compact && <span className="hidden text-sm text-muted-foreground sm:inline">A home for the stories you carry.</span>}
          </div>
          <nav aria-label="Footer navigation" className={`flex text-xs font-medium text-muted-foreground ${compact ? 'flex-nowrap gap-x-3 whitespace-nowrap' : 'flex-wrap gap-x-4 gap-y-1 sm:justify-end sm:text-sm'}`}>
            <Link href="/browse" className={`inline-flex items-center gap-1 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring ${compact ? 'min-h-8' : 'min-h-8'}`}>
              Browse <ArrowUpRight className="size-3" aria-hidden="true" />
            </Link>
            <Link href="/community" className="inline-flex min-h-8 items-center transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">Community</Link>
            <Link href="/guidelines" className="inline-flex min-h-8 items-center transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">Guidelines</Link>
            <Link href="/terms" className="inline-flex min-h-8 items-center transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">Terms</Link>
            <Link href="/privacy" className="inline-flex min-h-8 items-center transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">Privacy</Link>
          </nav>
        </div>
        <p className={`border-border/60 text-[11px] text-muted-foreground ${compact ? 'mt-1 text-center' : 'mt-2 border-t pt-2'}`}>© StoryLines. Made for readers and creators.</p>
      </div>
    </footer>
  )
}
