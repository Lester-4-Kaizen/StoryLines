'use client'

import { SettingsView } from '@/components/views/settings-view'
import { useAppState } from '@/lib/app-state'

export default function Page() {
  const { badges, saveBadges, themeMode, setThemeMode } = useAppState()
  return <SettingsView badges={badges} saveBadges={saveBadges} themeMode={themeMode} setThemeMode={setThemeMode} />
}
