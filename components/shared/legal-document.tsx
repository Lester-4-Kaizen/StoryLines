import Link from 'next/link'
import { ArrowUpRight, FileText } from 'lucide-react'
import type { ReactNode } from 'react'

type LegalSection = {
  id: string
  title: string
  content: ReactNode
}

export function LegalDocument({
  eyebrow,
  title,
  description,
  updatedOn,
  updatedAt,
  sections,
}: {
  eyebrow: string
  title: string
  description: string
  updatedOn: string
  updatedAt: string
  sections: LegalSection[]
}) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <header className="overflow-hidden rounded-3xl border border-border bg-card shadow-[0_12px_36px_color-mix(in_oklch,var(--primary)_7%,transparent)]">
        <div className="grid gap-6 p-6 sm:p-9 md:grid-cols-[minmax(0,1fr)_auto] md:items-end lg:p-12">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary/60 px-3 py-1.5 text-xs font-bold text-secondary-foreground">
              <FileText className="size-3.5" aria-hidden="true" />
              {eyebrow}
            </div>
            <h1 className="mt-5 font-serif text-4xl font-bold tracking-tight sm:text-5xl">{title}</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">{description}</p>
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Last updated <time className="mt-1 block text-sm normal-case tracking-normal text-foreground" dateTime={updatedAt}>{updatedOn}</time>
          </p>
        </div>
        <div className="h-1 bg-gradient-to-r from-accent via-primary/70 to-transparent" aria-hidden="true" />
      </header>

      <div className="mt-6 grid min-w-0 items-start gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <nav aria-label={`${title} sections`} className="min-w-0 rounded-2xl border border-border bg-card p-4 lg:sticky lg:top-24">
          <p className="px-2 pb-2 text-xs font-extrabold uppercase tracking-[0.14em] text-muted-foreground">On this page</p>
          <ul className="flex min-w-0 max-w-full gap-1 overflow-x-auto lg:flex-col">
            {sections.map((section) => (
              <li key={section.id} className="shrink-0 lg:shrink">
                <a href={`#${section.id}`} className="flex min-h-10 items-center rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
                  {section.title}
                </a>
              </li>
            ))}
          </ul>
          <div className="mt-4 hidden border-t border-border pt-4 lg:block">
            <p className="px-2 text-xs leading-5 text-muted-foreground">Explore the other StoryLines documents.</p>
            <Link href="/guidelines" className="mt-2 flex min-h-10 items-center justify-between rounded-lg px-3 text-sm font-semibold hover:bg-secondary">
              Guidelines <ArrowUpRight className="size-4" aria-hidden="true" />
            </Link>
            <Link href="/privacy" className="flex min-h-10 items-center justify-between rounded-lg px-3 text-sm font-semibold hover:bg-secondary">
              Privacy <ArrowUpRight className="size-4" aria-hidden="true" />
            </Link>
            <Link href="/terms" className="flex min-h-10 items-center justify-between rounded-lg px-3 text-sm font-semibold hover:bg-secondary">
              Terms <ArrowUpRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </nav>

        <article className="min-w-0 rounded-2xl border border-border bg-card px-5 py-2 shadow-sm sm:px-8">
          {sections.map((section, index) => (
            <section key={section.id} id={section.id} className={`scroll-mt-28 py-6 sm:py-8 ${index < sections.length - 1 ? 'border-b border-border' : ''}`}>
              <h2 className="font-serif text-xl font-bold sm:text-2xl">{section.title}</h2>
              <div className="legal-document-copy mt-3 space-y-4 text-sm leading-7 text-muted-foreground">
                {section.content}
              </div>
            </section>
          ))}
          <nav aria-label="Related documents" className="flex flex-wrap gap-x-5 gap-y-2 border-t border-border py-5 text-sm font-semibold text-accent lg:hidden">
            <Link href="/guidelines" className="min-h-11 inline-flex items-center">Guidelines</Link>
            <Link href="/privacy" className="min-h-11 inline-flex items-center">Privacy</Link>
            <Link href="/terms" className="min-h-11 inline-flex items-center">Terms</Link>
          </nav>
        </article>
      </div>
    </div>
  )
}
