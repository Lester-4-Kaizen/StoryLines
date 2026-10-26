'use client'

import { ShieldAlert, X } from 'lucide-react'
import { useState } from 'react'

export function AccountStatusBanner({
  warningCount,
  message,
}: {
  warningCount: number
  message: string | null
}) {
  const [dismissedWarning, setDismissedWarning] = useState<string | null>(null)
  const warningKey = `${warningCount}:${message ?? ''}`

  if (warningCount < 1 || dismissedWarning === warningKey) return null

  return (
    <aside
      role="alert"
      className="fixed inset-x-3 top-3 z-50 mx-auto flex max-w-xl items-start gap-3 rounded-xl border border-red-300 bg-red-50 p-4 text-red-950 shadow-xl sm:inset-x-auto sm:right-5 sm:top-5"
    >
      <ShieldAlert className="mt-0.5 size-5 shrink-0 text-red-700" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-bold">
          Account warning{warningCount === 1 ? '' : 's'}: {warningCount}
        </p>
        <p className="mt-1 text-sm leading-5">
          {message ?? 'A moderator issued a warning to your account. Further violations may result in account restrictions.'}
        </p>
      </div>
      <button
        type="button"
        onClick={() => setDismissedWarning(warningKey)}
        aria-label="Dismiss account warning"
        className="rounded p-1 text-red-800 hover:bg-red-100"
      >
        <X className="size-4" />
      </button>
    </aside>
  )
}
