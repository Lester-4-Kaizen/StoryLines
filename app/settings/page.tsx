'use client'

import { SettingsView } from '@/components/views/settings-view'
import { useAppState } from '@/lib/app-state'

export default function Page() {
  const { badges, toggleBadge } = useAppState()
  return <SettingsView badges={badges} toggleBadge={toggleBadge} />
}
