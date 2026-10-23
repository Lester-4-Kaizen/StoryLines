'use client'

import { SettingsView } from '@/components/views/settings-view'
import { useAppState } from '@/lib/app-state'

export default function Page() {
  const { badges, role, changeRole, saveBadges, themeMode, setThemeMode, isLoggedIn, refreshSession } = useAppState()
  return (
    <SettingsView
      badges={badges}
      activeRole={role}
      changeRole={changeRole}
      saveBadges={saveBadges}
      themeMode={themeMode}
      setThemeMode={setThemeMode}
      isLoggedIn={isLoggedIn}
      refreshSession={refreshSession}
    />
  )
}
