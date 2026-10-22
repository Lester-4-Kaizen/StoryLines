export function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-border bg-card p-5 shadow-[0_2px_0_rgba(68,45,31,0.05)] ${className}`}>
      {children}
    </section>
  )
}
