export default function Loading() {
  return (
    <div role="status" aria-label="Naglo-load ang babasahin" className="mx-auto w-full max-w-4xl">
      <div className="h-11 w-24 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
      <div className="mt-5 animate-pulse rounded-xl border border-border bg-card p-5 sm:p-8 motion-reduce:animate-none">
        <div className="h-3 w-20 rounded bg-muted" />
        <div className="mt-3 h-10 w-2/3 rounded bg-muted" />
        <div className="mt-3 h-4 w-1/3 rounded bg-muted" />
        <div className="mx-auto mt-16 max-w-2xl space-y-4">
          <div className="mx-auto h-4 w-20 rounded bg-muted" />
          <div className="mx-auto h-7 w-1/2 rounded bg-muted" />
          {[0, 1, 2, 3, 4, 5, 6].map((item) => (
            <div key={item} className="h-4 rounded bg-muted" />
          ))}
        </div>
      </div>
      <span className="sr-only">Pansamantalang placeholder habang binubuksan ang kabanata.</span>
    </div>
  )
}
