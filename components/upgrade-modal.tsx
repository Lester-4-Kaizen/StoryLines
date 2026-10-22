import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Badge } from '@/lib/types'

export function UpgradeModal({
  onClose,
  onUpgrade,
}: {
  onClose: () => void
  onUpgrade: (badge: Badge) => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/40 p-4" role="dialog" aria-modal="true">
      <div className="paper-panel max-w-md bg-card p-7">
        <div className="flex items-start justify-between gap-5">
          <div>
            <span className="eyebrow">Creator access</span>
            <h2 className="mt-2 font-serif text-3xl font-bold">Make room for your work.</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-2 hover:bg-muted">
            <X className="size-5" />
          </button>
        </div>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">Add a Writer or Artist badge to open the creator studio.</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Button onClick={() => onUpgrade('writer')} className="rounded-lg bg-accent text-accent-foreground">
            Add Writer
          </Button>
          <Button onClick={() => onUpgrade('artist')} variant="outline" className="rounded-lg">
            Add Artist
          </Button>
        </div>
      </div>
    </div>
  )
}
