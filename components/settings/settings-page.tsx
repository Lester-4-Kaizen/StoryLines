'use client'

import { SettingsView, type SettingsSection } from '@/components/views/settings-view'
import { useAppState } from '@/lib/app-state'

export function SettingsPage({ section }: { section: SettingsSection }) {
  const { badges, role, changeRole, saveBadges, themeMode, setThemeMode, isLoggedIn, refreshSession } = useAppState()

  return (
    <SettingsView
      section={section}
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
