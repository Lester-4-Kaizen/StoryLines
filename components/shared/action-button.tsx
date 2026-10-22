import { ChevronRight } from 'lucide-react'

export function ActionButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 rounded-lg border border-border bg-background p-4 text-left text-sm font-bold transition hover:-translate-y-0.5 hover:border-accent"
    >
      <span className="section-icon">{icon}</span>
      {label}
      <ChevronRight className="ml-auto size-4 text-muted-foreground" />
    </button>
  )
}
