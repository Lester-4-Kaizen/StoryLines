'use client'

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { getSupabaseClient } from '@/lib/supabase'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { useLocalStorageList } from '@/lib/use-local-storage-list'
import type { Badge, CommunityAuthor, CommunityComment, CommunityPostType, Post } from '@/lib/types'

type CommunityState = {
  posts: Post[]
  authors: CommunityAuthor[]
  savedPostIds: string[]
  currentUserId: string | null
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
  updatePost: (id: string, content: string) => Promise<void>
  deletePost: (id: string) => Promise<void>
  toggleSaved: (id: string) => Promise<void>
  loadComments: (postId: string) => Promise<CommunityComment[]>
  addComment: (postId: string, content: string) => Promise<CommunityComment>
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
  const [savedPostIds, setSavedPostIds] = useState<string[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
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
      const [postsResult, authorsResult, sessionResult] = await Promise.all([
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
        supabase.auth.getSession(),
      ])

      if (postsResult.error) throw postsResult.error
      if (authorsResult.error) throw authorsResult.error
      if (sessionResult.error) throw sessionResult.error

      const nextAuthors: CommunityAuthor[] = (authorsResult.data ?? []).map((author) => ({
        id: author.id,
        displayName: author.display_name,
        username: author.username,
        roles: Array.isArray(author.roles)
          ? author.roles.filter(isBadge)
          : [],
      }))
      const authorById = new Map(nextAuthors.map((author) => [author.id, author]))
      let savedIds: string[] = []
      const user = sessionResult.data.session?.user
      setCurrentUserId(user?.id ?? null)
      if (user) {
        const { data: savedRows, error: savedError } = await supabase
          .from('community_saved_posts')
          .select('post_id')
          .eq('user_id', user.id)
          .limit(500)
        if (savedError) throw savedError
        savedIds = (savedRows ?? []).map((saved) => saved.post_id)
      }

      const feedRows = postsResult.data ?? []
      const missingSavedIds = savedIds.filter((id) => !feedRows.some((post) => post.id === id))
      const savedPostsResult = missingSavedIds.length
        ? await supabase
          .from('community_posts')
          .select('id, author_id, author_role, type, content, image_urls, tags, looking_for, created_at')
          .in('id', missingSavedIds)
        : null
      if (savedPostsResult?.error) throw savedPostsResult.error

      const nextPosts: Post[] = [...feedRows, ...(savedPostsResult?.data ?? [])].map((post) => {
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
          commentsCount: 0,
        }
      })

      setSharedPosts(nextPosts)
      setAuthors(nextAuthors)
      setSavedPostIds(savedIds)
    } catch (refreshError) {
      setError(describeLoadError(refreshError))
    } finally {
      setHydrated(true)
    }
  }, [])

  useEffect(() => {
    void refresh()
    if (!isSupabaseConfigured) return

    const supabase = getSupabaseClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      setSavedPostIds([])
      window.setTimeout(() => void refresh(), 0)
    })
    return () => subscription.unsubscribe()
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

  const updatePost: CommunityState['updatePost'] = async (postId, content) => {
    const trimmedContent = content.trim()
    if (!trimmedContent || trimmedContent.length > 500) {
      throw new Error('A post must be between 1 and 500 characters.')
    }

    const post = sharedPosts.find((item) => item.id === postId)
    if (!post) throw new Error('Post not found.')

    const supabase = getSupabaseClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError) throw userError
    if (!user || user.id !== post.authorId) {
      throw new Error('You can only edit your own community posts.')
    }

    const { data, error: updateError } = await supabase
      .from('community_posts')
      .update({ content: trimmedContent })
      .eq('id', postId)
      .eq('author_id', user.id)
      .select('id')
      .single()
    if (updateError) throw updateError
    if (data.id !== postId) throw new Error('Could not verify the updated post.')

    setSharedPosts((current) => current.map((item) => (
      item.id === postId ? { ...item, content: trimmedContent } : item
    )))
  }

  const deletePost: CommunityState['deletePost'] = async (postId) => {
    const localPost = devicePosts.find((post) => post.id === postId)
    if (localPost) {
      if (localPost.authorId) throw new Error('You can only delete your own community posts.')
      setDevicePosts((current) => current.filter((post) => post.id !== postId))
      return
    }

    const post = sharedPosts.find((item) => item.id === postId)
    if (!post) throw new Error('Post not found.')

    const supabase = getSupabaseClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError) throw userError
    if (!user || user.id !== post.authorId) {
      throw new Error('You can only delete your own community posts.')
    }

    const { data, error: deleteError } = await supabase
      .from('community_posts')
      .delete()
      .eq('id', postId)
      .eq('author_id', user.id)
      .select('id')
      .single()
    if (deleteError) throw deleteError
    if (data.id !== postId) throw new Error('Could not verify the deleted post.')

    setSharedPosts((current) => current.filter((item) => item.id !== postId))
    setSavedPostIds((current) => current.filter((id) => id !== postId))
  }

  const toggleSaved: CommunityState['toggleSaved'] = async (postId) => {
    const supabase = getSupabaseClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError) throw userError
    if (!user) throw new Error('Mag-log in para mag-save ng community post.')
    if (!sharedPosts.some((post) => post.id === postId)) {
      throw new Error('Hindi mase-save ang post na ito.')
    }

    if (savedPostIds.includes(postId)) {
      const { error: deleteError } = await supabase
        .from('community_saved_posts')
        .delete()
        .eq('user_id', user.id)
        .eq('post_id', postId)
      if (deleteError) throw deleteError
      setSavedPostIds((current) => current.filter((id) => id !== postId))
      return
    }

    const { error: insertError } = await supabase
      .from('community_saved_posts')
      .insert({ user_id: user.id, post_id: postId })
    if (insertError) throw insertError
    setSavedPostIds((current) => current.includes(postId) ? current : [...current, postId])
  }

  const loadComments: CommunityState['loadComments'] = async (postId) => {
    const supabase = getSupabaseClient()
    const { data, count, error: commentsError } = await supabase
      .from('community_post_comments')
      .select('id, post_id, author_id, content, created_at', { count: 'exact' })
      .eq('post_id', postId)
      .order('created_at', { ascending: true })
      .limit(100)
    if (commentsError) throw commentsError

    const authorIds = Array.from(new Set((data ?? []).map((comment) => comment.author_id)))
    const { data: profiles, error: profilesError } = authorIds.length
      ? await supabase
        .from('profiles')
        .select('id, display_name, username')
        .in('id', authorIds)
      : { data: [], error: null }
    if (profilesError) throw profilesError
    const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]))
    const comments: CommunityComment[] = (data ?? []).map((comment) => {
      const author = profileById.get(comment.author_id)
      return {
        id: comment.id,
        postId: comment.post_id,
        authorId: comment.author_id,
        authorName: author?.display_name ?? 'StoryLines reader',
        authorUsername: author?.username,
        content: comment.content,
        createdAt: new Date(comment.created_at).getTime(),
      }
    })
    setSharedPosts((current) => current.map((post) => (
      post.id === postId ? { ...post, commentsCount: count ?? comments.length } : post
    )))
    return comments
  }

  const addComment: CommunityState['addComment'] = async (postId, content) => {
    const trimmedContent = content.trim()
    if (!trimmedContent || trimmedContent.length > 500) {
      throw new Error('A comment must be between 1 and 500 characters.')
    }

    const supabase = getSupabaseClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError) throw userError
    if (!user) throw new Error('Mag-log in para mag-comment.')

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('display_name, username')
      .eq('id', user.id)
      .single()
    if (profileError) throw profileError

    const { data, error: insertError } = await supabase
      .from('community_post_comments')
      .insert({ post_id: postId, author_id: user.id, content: trimmedContent })
      .select('id, post_id, author_id, content, created_at')
      .single()
    if (insertError) throw insertError

    const comment: CommunityComment = {
      id: data.id,
      postId: data.post_id,
      authorId: data.author_id,
      authorName: profile.display_name,
      authorUsername: profile.username,
      content: data.content,
      createdAt: new Date(data.created_at).getTime(),
    }
    setSharedPosts((current) => current.map((post) => (
      post.id === postId ? { ...post, commentsCount: (post.commentsCount ?? 0) + 1 } : post
    )))
    return comment
  }

  return (
    <CommunityContext.Provider
      value={{
        posts,
        authors,
        savedPostIds,
        currentUserId,
        hydrated: hydrated && devicePostsHydrated,
        error,
        refresh,
        addPost,
        toggleLike,
        updatePost,
        deletePost,
        toggleSaved,
        loadComments,
        addComment,
      }}
    >
      {children}
    </CommunityContext.Provider>
  )
}

export function useCommunity() {
  const ctx = useContext(CommunityContext)
  if (!ctx) throw new Error('useCommunity must be used within a CommunityProvider')
  return ctx
}