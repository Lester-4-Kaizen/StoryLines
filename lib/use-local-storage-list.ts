'use client'

import { useEffect, useState } from 'react'

// Generic localStorage-backed list — the same trick app-state.tsx uses for
// the account model, pulled out so both the Works store and the Community
// store can share it instead of each reimplementing read/write/hydrate.
// `hydrated` lets callers wait for the persisted value to load before
// trusting an empty array (otherwise a refresh briefly looks like
// everything got wiped).
export function useLocalStorageList<T>(key: string): [T[], React.Dispatch<React.SetStateAction<T[]>>, boolean] {
  const [items, setItems] = useState<T[]>([])
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(key)
      if (saved) setItems(JSON.parse(saved) as T[])
    } catch {
      // Ignore malformed/unavailable storage — falls back to empty.
    } finally {
      setHydrated(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  useEffect(() => {
    if (!hydrated) return
    try {
      localStorage.setItem(key, JSON.stringify(items))
    } catch {
      // Storage may be unavailable (e.g. private browsing) — safe to skip.
    }
  }, [key, items, hydrated])

  return [items, setItems, hydrated]
}