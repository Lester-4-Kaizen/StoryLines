export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4" aria-label="Loading profile" aria-busy="true">
      <div className="h-64 animate-pulse rounded-2xl border border-border bg-card motion-reduce:animate-none" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex flex-col gap-4">
          <div className="h-14 animate-pulse rounded-xl border border-border bg-card motion-reduce:animate-none" />
          <div className="h-56 animate-pulse rounded-2xl border border-border bg-card motion-reduce:animate-none" />
          <div className="h-56 animate-pulse rounded-2xl border border-border bg-card motion-reduce:animate-none" />
        </div>
        <div className="h-48 animate-pulse rounded-2xl border border-border bg-card motion-reduce:animate-none" />
      </div>
    </div>
  )
}
