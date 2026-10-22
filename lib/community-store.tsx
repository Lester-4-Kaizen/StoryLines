'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { useLocalStorageList } from '@/lib/use-local-storage-list'
import type { Post } from '@/lib/types'

type CommunityState = {
  posts: Post[]
  hydrated: boolean
  addPost: (content: string, authorRole: 'writer' | 'artist', imageUrl?: string) => void
  toggleLike: (id: string) => void
}

const CommunityContext = createContext<CommunityState | null>(null)
const STORAGE_KEY = 'storylines-community-posts'

export function CommunityProvider({ children }: { children: ReactNode }) {
  const [posts, setPosts, hydrated] = useLocalStorageList<Post>(STORAGE_KEY)

  const addPost = (content: string, authorRole: 'writer' | 'artist', imageUrl?: string) => {
    const post: Post = { id: crypto.randomUUID(), authorRole, content, imageUrl, createdAt: Date.now(), likes: 0, likedByMe: false }
    setPosts((current) => [post, ...current])
  }

  // Readers can react but not post — enforced in CommunityView (no
  // composer shown to them), not here; toggling a like doesn't need a
  // role check since it's available to everyone who can see the feed.
  const toggleLike = (id: string) => {
    setPosts((current) =>
      current.map((post) => (post.id === id ? { ...post, likedByMe: !post.likedByMe, likes: post.likes + (post.likedByMe ? -1 : 1) } : post)),
    )
  }

  return <CommunityContext.Provider value={{ posts, hydrated, addPost, toggleLike }}>{children}</CommunityContext.Provider>
}

export function useCommunity() {
  const ctx = useContext(CommunityContext)
  if (!ctx) throw new Error('useCommunity must be used within a CommunityProvider')
  return ctx
}