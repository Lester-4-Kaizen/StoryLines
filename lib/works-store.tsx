'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'
import { useLocalStorageList } from '@/lib/use-local-storage-list'
import type { Work } from '@/lib/types'

type WorksState = {
  works: Work[]
  hydrated: boolean
  // `draft` carries what WorkSetup captures (title, synopsis, genre...)
  // across the navigation to the Story/Comic editor — those are separate
  // pages, so this is the in-memory handoff between them. It's cleared
  // once the editor actually publishes.
  draft: Partial<Work> | null
  setDraft: (draft: Partial<Work>) => void
  clearDraft: () => void
  addWork: (work: Omit<Work, 'id' | 'createdAt'>) => Work
  updateWork: (id: string, patch: Partial<Work>) => void
  deleteWork: (id: string) => void
}

const WorksContext = createContext<WorksState | null>(null)
const STORAGE_KEY = 'storylines-works'

export function WorksProvider({ children }: { children: ReactNode }) {
  const [works, setWorks, hydrated] = useLocalStorageList<Work>(STORAGE_KEY)
  const [draft, setDraftState] = useState<Partial<Work> | null>(null)

  const setDraft = (patch: Partial<Work>) => setDraftState((current) => ({ ...current, ...patch }))
  const clearDraft = () => setDraftState(null)

  const addWork = (work: Omit<Work, 'id' | 'createdAt'>) => {
    const newWork: Work = { ...work, id: crypto.randomUUID(), createdAt: Date.now() }
    setWorks((current) => [newWork, ...current])
    return newWork
  }

  const updateWork = (id: string, patch: Partial<Work>) => {
    setWorks((current) => current.map((work) => (work.id === id ? { ...work, ...patch } : work)))
  }

  const deleteWork = (id: string) => {
    setWorks((current) => current.filter((work) => work.id !== id))
  }

  return (
    <WorksContext.Provider value={{ works, hydrated, draft, setDraft, clearDraft, addWork, updateWork, deleteWork }}>
      {children}
    </WorksContext.Provider>
  )
}

export function useWorks() {
  const ctx = useContext(WorksContext)
  if (!ctx) throw new Error('useWorks must be used within a WorksProvider')
  return ctx
}