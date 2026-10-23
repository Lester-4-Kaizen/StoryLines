export default function Loading() {
  return (
    <div role="status" aria-label="Naglo-load ang library mo" className="mx-auto flex w-full max-w-5xl flex-col gap-7">
      <div className="animate-pulse motion-reduce:animate-none">
        <div className="h-3 w-32 rounded bg-muted" />
        <div className="mt-3 h-12 w-56 rounded bg-muted" />
        <div className="mt-3 h-4 w-80 max-w-full rounded bg-muted" />
      </div>
      <section aria-hidden="true">
        <div className="mb-3 h-6 w-40 rounded bg-muted" />
        <div className="grid gap-3 md:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div key={item} className="flex h-24 animate-pulse items-center gap-3 rounded-2xl border border-border bg-card p-3 motion-reduce:animate-none">
              <div className="size-16 shrink-0 rounded-lg bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-3/4 rounded bg-muted" />
                <div className="h-3 w-1/2 rounded bg-muted" />
                <div className="h-1 rounded bg-muted" />
              </div>
              <div className="h-10 w-16 rounded-full bg-muted" />
            </div>
          ))}
        </div>
      </section>
      <div className="flex gap-5 border-b border-border pb-2">
        <div className="h-6 w-14 animate-pulse rounded bg-muted motion-reduce:animate-none" />
        <div className="h-6 w-14 animate-pulse rounded bg-muted motion-reduce:animate-none" />
      </div>
      <div className="flex gap-2 overflow-hidden" aria-hidden="true">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="h-11 w-24 shrink-0 animate-pulse rounded-full bg-muted motion-reduce:animate-none" />
        ))}
      </div>
      <section aria-hidden="true" className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {[0, 1, 2, 3, 4, 5].map((item) => (
          <div key={item} className="animate-pulse motion-reduce:animate-none">
            <div className="aspect-[0.68] rounded-xl bg-muted" />
            <div className="mt-2 h-4 rounded bg-muted" />
            <div className="mt-1 h-3 w-2/3 rounded bg-muted" />
          </div>
        ))}
      </section>
      <div className="h-56 animate-pulse rounded-2xl border border-border bg-card motion-reduce:animate-none" aria-hidden="true" />
      <span className="sr-only">Pansamantalang placeholder habang kinukuha ang saved works at reading history.</span>
    </div>
  )
}
