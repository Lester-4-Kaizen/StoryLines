'use client'

import { useEffect, useState } from 'react'

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

export type InstallPlatform = 'ios' | 'android' | 'desktop' | 'other'

function getInstallPlatform(): InstallPlatform {
  const userAgent = window.navigator.userAgent
  if (/iPad|iPhone|iPod/.test(userAgent)) return 'ios'
  if (/Android/.test(userAgent)) return 'android'
  if (/Mac|Windows|Linux/.test(userAgent)) return 'desktop'
  return 'other'
}

export function usePwaInstall() {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)
  const [platform, setPlatform] = useState<InstallPlatform>('other')
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    setPlatform(getInstallPlatform())

    const mediaQuery = window.matchMedia('(display-mode: standalone)')
    const updateInstalled = () => setInstalled(mediaQuery.matches || (window.navigator as Navigator & { standalone?: boolean }).standalone === true)
    updateInstalled()

    const capturePrompt = (event: Event) => {
      event.preventDefault()
      setPromptEvent(event as InstallPromptEvent)
    }
    const handleAppInstalled = () => {
      setPromptEvent(null)
      setInstalled(true)
    }

    window.addEventListener('beforeinstallprompt', capturePrompt)
    window.addEventListener('appinstalled', handleAppInstalled)
    mediaQuery.addEventListener('change', updateInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', capturePrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
      mediaQuery.removeEventListener('change', updateInstalled)
    }
  }, [])

  const install = async () => {
    if (!promptEvent) return false
    setInstalling(true)
    try {
      await promptEvent.prompt()
      const choice = await promptEvent.userChoice
      if (choice.outcome === 'accepted') setInstalled(true)
      setPromptEvent(null)
      return choice.outcome === 'accepted'
    } finally {
      setInstalling(false)
    }
  }

  return {
    installed,
    installing,
    canPrompt: promptEvent !== null,
    platform,
    install,
  }
}
