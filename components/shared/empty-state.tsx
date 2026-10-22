import { ChevronRight } from 'lucide-react'

export function EmptyState({
  icon,
  title,
  message,
  action,
  onAction,
}: {
  icon: React.ReactNode
  title: string
  message: string
  action?: string
  onAction?: () => void
}) {
  return (
    <div className="paper-panel flex min-h-56 flex-col items-center justify-center p-7 text-center">
      <span className="empty-icon">{icon}</span>
      <h2 className="mt-4 font-serif text-2xl font-bold">{title}</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{message}</p>
      {action && (
        <button onClick={onAction} className="mt-5 text-xs font-bold uppercase tracking-wider text-accent hover:underline">
          {action}
          <ChevronRight className="ml-1 inline size-3.5" />
        </button>
      )}
    </div>
  )
}
