import Link from 'next/link'

export function SiteFooter() {
  return (
    <footer className="border-t border-border/70 bg-background">
      <div className="mx-auto flex min-h-12 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link
          href="/"
          className="flex min-h-11 shrink-0 items-center font-serif text-xs font-bold text-foreground hover:text-accent"
        >
          StoryLines
        </Link>
        <nav aria-label="Footer navigation" className="flex items-center gap-1 text-[10px] text-muted-foreground sm:gap-3 sm:text-xs">
          <Link href="/guidelines" className="flex min-h-11 items-center px-1 hover:text-foreground">Guidelines</Link>
          <Link href="/terms" className="flex min-h-11 items-center px-1 hover:text-foreground">Terms</Link>
          <Link href="/privacy" className="flex min-h-11 items-center px-1 hover:text-foreground">Privacy</Link>
        </nav>
      </div>
    </footer>
  )
}
