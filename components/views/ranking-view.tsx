'use client'

import { useState } from 'react'
import { Crown } from 'lucide-react'
import { EmptyState } from '@/components/shared/empty-state'

export function RankingView() {
  const [period, setPeriod] = useState('This week')
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <span className="eyebrow">Community favorites</span>
          <h1 className="mt-3 font-serif text-5xl font-bold">Ranking.</h1>
          <p className="mt-3 text-sm text-muted-foreground">A gentle pulse of what readers are loving.</p>
        </div>
        <select value={period} onChange={(e) => setPeriod(e.target.value)} className="rounded-lg border border-input bg-card px-3 py-2 text-sm">
          <option>This week</option>
          <option>This month</option>
          <option>All time</option>
        </select>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {['Stories', 'Comics', 'Creators'].map((item) => (
          <EmptyState key={item} icon={<Crown />} title={`${item} ranking`} message="Not enough community activity to rank anything yet." />
        ))}
      </div>
    </div>
  )
}
