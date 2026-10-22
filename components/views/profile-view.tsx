import { BookOpen, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/shared/empty-state'

export function ProfileView({ onEdit }: { onEdit: () => void }) {
  return (
    <div className="flex flex-col gap-6">
      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="profile-banner" />
        <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-end">
          <span className="profile-avatar">
            <UserRound className="size-8" />
          </span>
          <div className="flex-1">
            <h1 className="font-serif text-3xl font-bold">Profile mo</h1>
            <p className="mt-1 text-sm text-muted-foreground">@your-username · Dito lalabas ang bio mo.</p>
            <span className="badge badge-reader mt-3">
              <BookOpen className="size-3" /> Reader
            </span>
          </div>
          <Button variant="outline" onClick={onEdit} className="rounded-lg">
            Edit profile
          </Button>
        </div>
      </section>
      <EmptyState icon={<BookOpen />} title="Wala ka pang nailalathalang gawa" message="Marami pang puwang dito para sa susunod mong kuwento o likha." />
    </div>
  )
}
