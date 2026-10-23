'use client'

import { SettingsView } from '@/components/views/settings-view'
import { useAppState } from '@/lib/app-state'

export default function Page() {
  const { badges, toggleBadge, themeMode, setThemeMode } = useAppState()
  return <SettingsView badges={badges} toggleBadge={toggleBadge} themeMode={themeMode} setThemeMode={setThemeMode} />
}
