'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'
import { getSupabaseClient } from '@/lib/supabase'
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
  addWork: (work: Omit<Work, 'id' | 'createdAt'>) => Promise<Work>
  updateWork: (id: string, patch: Partial<Work>) => Promise<void>
  deleteWork: (id: string) => Promise<void>
}

const WorksContext = createContext<WorksState | null>(null)
const STORAGE_KEY = 'storylines-works'

export function WorksProvider({ children }: { children: ReactNode }) {
  const [works, setWorks, hydrated] = useLocalStorageList<Work>(STORAGE_KEY)
  const [draft, setDraftState] = useState<Partial<Work> | null>(null)

  const setDraft = (patch: Partial<Work>) => setDraftState((current) => ({ ...current, ...patch }))
  const clearDraft = () => setDraftState(null)

  const addWork = async (work: Omit<Work, 'id' | 'createdAt'>) => {
    const supabase = getSupabaseClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError) throw userError
    if (!user) throw new Error('Mag-log in ulit bago mag-save ng work.')

    const { data, error } = await supabase
      .from('creator_works')
      .insert({
        author_id: user.id,
        title: work.title,
        type: work.type,
        synopsis: work.synopsis ?? '',
        genre: work.genre ?? null,
        language: work.language ?? null,
        status: work.status,
      })
      .select('id, created_at')
      .single()
    if (error) throw error

    if (work.type === 'story' && work.chapterTitle) {
      const { error: chapterError } = await supabase.from('creator_work_chapters').insert({
        work_id: data.id,
        chapter_number: 1,
        title: work.chapterTitle,
        body: work.chapterBody ?? '',
        is_published: work.status !== 'Draft',
      })
      if (chapterError) {
        const { error: cleanupError } = await supabase.from('creator_works').delete().eq('id', data.id)
        if (cleanupError) console.error('Failed to clean up a story after chapter creation failed', cleanupError)
        throw chapterError
      }
    }

    const newWork: Work = { ...work, authorId: user.id, id: data.id, createdAt: new Date(data.created_at).getTime() }
    setWorks((current) => [newWork, ...current])
    return newWork
  }

  const updateWork = async (id: string, patch: Partial<Work>) => {
    const supabase = getSupabaseClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError) throw userError
    if (!user) throw new Error('Mag-log in ulit bago mag-update ng work.')

    const current = works.find((work) => work.id === id)
    if (!current) throw new Error('Hindi na makita ang work na ito.')
    if (current.authorId !== 'me' && current.authorId !== user.id) {
      throw new Error('Hindi mo puwedeng i-edit ang work ng ibang account.')
    }
    const updated = { ...current, ...patch }
    const { data: existing, error: lookupError } = await supabase
      .from('creator_works')
      .select('id')
      .eq('id', id)
      .maybeSingle()
    if (lookupError) throw lookupError
    const fields = {
      title: updated.title,
      synopsis: updated.synopsis ?? '',
      genre: updated.genre ?? null,
      language: updated.language ?? null,
      status: updated.status,
      updated_at: new Date().toISOString(),
    }
    if (existing) {
      const { data, error } = await supabase
        .from('creator_works')
        .update(fields)
        .eq('id', id)
        .eq('author_id', user.id)
        .select('id')
        .maybeSingle()
      if (error) throw error
      if (!data) throw new Error('Hindi ma-update ang work na ito. I-refresh ang pahina at subukan ulit.')
      if (current.type === 'story' && current.status !== updated.status) {
        const { error: chapterError } = await supabase
          .from('creator_work_chapters')
          .update({ is_published: updated.status !== 'Draft', updated_at: new Date().toISOString() })
          .eq('work_id', id)
        if (chapterError) throw chapterError
      }
    } else {
      const { error } = await supabase.from('creator_works').insert({
        id,
        author_id: user.id,
        type: updated.type,
        ...fields,
      })
      if (error) throw error
    }
    setWorks((current) => current.map((work) => (work.id === id ? { ...work, ...patch, authorId: user.id } : work)))
  }

  const deleteWork = async (id: string) => {
    const supabase = getSupabaseClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError) throw userError
    if (!user) throw new Error('Mag-log in ulit bago mag-delete ng work.')
    const current = works.find((work) => work.id === id)
    if (!current) throw new Error('Hindi na makita ang work na ito.')
    if (current.authorId !== 'me' && current.authorId !== user.id) {
      throw new Error('Hindi mo puwedeng i-delete ang work ng ibang account.')
    }
    const { data, error } = await supabase
      .from('creator_works')
      .delete()
      .eq('id', id)
      .eq('author_id', user.id)
      .select('id')
      .maybeSingle()
    if (error) throw error
    if (!data && current.authorId !== 'me') {
      throw new Error('Hindi ma-delete ang work na ito. I-refresh ang pahina at subukan ulit.')
    }
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