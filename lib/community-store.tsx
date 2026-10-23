'use client'

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { getSupabaseClient } from '@/lib/supabase'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { useLocalStorageList } from '@/lib/use-local-storage-list'
import type { Badge, CommunityAuthor, CommunityPostType, Post } from '@/lib/types'

type CommunityState = {
  posts: Post[]
  authors: CommunityAuthor[]
  hydrated: boolean
  error: string | null
  refresh: () => Promise<void>
  addPost: (post: {
    content: string
    authorRole: 'writer' | 'artist'
    type: CommunityPostType
    imageUrls: string[]
    tags: string[]
    lookingFor: string[]
  }) => Promise<void>
  toggleLike: (id: string) => void
}

const CommunityContext = createContext<CommunityState | null>(null)
const IMAGE_BUCKET = 'community-post-images'
const LEGACY_STORAGE_KEY = 'storylines-community-posts'
const BADGES: Badge[] = ['reader', 'writer', 'artist']

function isBadge(value: string): value is Badge {
  return BADGES.some((badge) => badge === value)
}

function describeLoadError(loadError: unknown) {
  if (
    typeof loadError === 'object'
    && loadError !== null
    && 'code' in loadError
    && loadError.code === 'PGRST205'
  ) {
    return 'Hindi pa naka-set up ang shared community feed. I-run ang community posts migration sa README sa Supabase SQL Editor.'
  }
  return loadError instanceof Error ? loadError.message : 'Hindi ma-load ang community. Subukan ulit.'
}

export function CommunityProvider({ children }: { children: ReactNode }) {
  const [sharedPosts, setSharedPosts] = useState<Post[]>([])
  const [devicePosts, setDevicePosts, devicePostsHydrated] = useLocalStorageList<Post>(LEGACY_STORAGE_KEY)
  const [authors, setAuthors] = useState<CommunityAuthor[]>([])
  const [hydrated, setHydrated] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const posts = [...devicePosts, ...sharedPosts]

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setError('Hindi naka-configure ang community database.')
      setHydrated(true)
      return
    }

    setError(null)
    setHydrated(false)
    try {
      const supabase = getSupabaseClient()
      const [postsResult, authorsResult] = await Promise.all([
        supabase
          .from('community_posts')
          .select('id, author_id, author_role, type, content, image_urls, tags, looking_for, created_at')
          .order('created_at', { ascending: false })
          .limit(100),
        supabase
          .from('profiles')
          .select('id, display_name, username, roles')
          .overlaps('roles', ['writer', 'artist'])
          .order('display_name')
          .limit(500),
      ])

      if (postsResult.error) throw postsResult.error
      if (authorsResult.error) throw authorsResult.error

      const nextAuthors: CommunityAuthor[] = (authorsResult.data ?? []).map((author) => ({
        id: author.id,
        displayName: author.display_name,
        username: author.username,
        roles: Array.isArray(author.roles)
          ? author.roles.filter(isBadge)
          : [],
      }))
      const authorById = new Map(nextAuthors.map((author) => [author.id, author]))
      const nextPosts: Post[] = (postsResult.data ?? []).map((post) => {
        const author = authorById.get(post.author_id)
        return {
          id: post.id,
          authorId: post.author_id,
          authorName: author?.displayName ?? 'StoryLines creator',
          authorUsername: author?.username,
          authorRole: post.author_role,
          type: post.type,
          content: post.content,
          imageUrls: post.image_urls ?? [],
          tags: post.tags ?? [],
          lookingFor: post.looking_for ?? [],
          createdAt: new Date(post.created_at).getTime(),
          likes: 0,
          likedByMe: false,
        }
      })

      setSharedPosts(nextPosts)
      setAuthors(nextAuthors)
    } catch (refreshError) {
      setError(describeLoadError(refreshError))
    } finally {
      setHydrated(true)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const addPost: CommunityState['addPost'] = async (input) => {
    const supabase = getSupabaseClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError) throw userError
    if (!user) throw new Error('Mag-log in ulit bago mag-post.')

    const imageUrls: string[] = []
    for (const [index, imageUrl] of input.imageUrls.entries()) {
      const image = await fetch(imageUrl).then((response) => response.blob())
      const path = `${user.id}/${crypto.randomUUID()}-${index}.jpg`
      const { error: uploadError } = await supabase.storage.from(IMAGE_BUCKET).upload(path, image, {
        contentType: 'image/jpeg',
        cacheControl: '31536000',
      })
      if (uploadError) throw uploadError
      imageUrls.push(supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl)
    }

    const { data, error: insertError } = await supabase
      .from('community_posts')
      .insert({
        author_id: user.id,
        author_role: input.authorRole,
        type: input.type,
        content: input.content,
        image_urls: imageUrls,
        tags: input.tags,
        looking_for: input.lookingFor,
      })
      .select('id, created_at')
      .single()
    if (insertError) throw insertError

    const displayName = user.user_metadata.display_name
    const username = user.user_metadata.username
    const post: Post = {
      id: data.id,
      authorId: user.id,
      authorName: typeof displayName === 'string' ? displayName : 'StoryLines creator',
      authorUsername: typeof username === 'string' ? username : undefined,
      ...input,
      imageUrls,
      createdAt: new Date(data.created_at).getTime(),
      likes: 0,
      likedByMe: false,
    }
    setSharedPosts((current) => [post, ...current])
    setError(null)
  }

  const toggleLike = (id: string) => {
    setSharedPosts((current) =>
      current.map((post) => (post.id === id ? { ...post, likedByMe: !post.likedByMe, likes: post.likes + (post.likedByMe ? -1 : 1) } : post)),
    )
    setDevicePosts((current) =>
      current.map((post) => (post.id === id ? { ...post, likedByMe: !post.likedByMe, likes: post.likes + (post.likedByMe ? -1 : 1) } : post)),
    )
  }

  return <CommunityContext.Provider value={{ posts, authors, hydrated: hydrated && devicePostsHydrated, error, refresh, addPost, toggleLike }}>{children}</CommunityContext.Provider>
}

export function useCommunity() {
  const ctx = useContext(CommunityContext)
  if (!ctx) throw new Error('useCommunity must be used within a CommunityProvider')
  return ctx
}