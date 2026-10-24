'use client'

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { getSupabaseClient } from '@/lib/supabase'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { useLocalStorageList } from '@/lib/use-local-storage-list'
import type { Badge, CommunityAuthor, CommunityComment, CommunityPostType, Post } from '@/lib/types'

type CommunityState = {
  posts: Post[]
  authors: CommunityAuthor[]
  currentProfile: { displayName: string; username: string; avatarUrl: string | null; bio: string; roles: Badge[] } | null
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
  toggleLike: (id: string) => Promise<void>
  updatePost: (id: string, content: string) => Promise<void>
  deletePost: (id: string) => Promise<void>
  toggleSaved: (id: string) => Promise<void>
  loadComments: (postId: string) => Promise<CommunityComment[]>
  addComment: (postId: string, content: string, parentCommentId?: string) => Promise<CommunityComment>
  toggleCommentReaction: (commentId: string, reaction: 'like' | 'dislike') => Promise<void>
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
  const [currentProfile, setCurrentProfile] = useState<CommunityState['currentProfile']>(null)
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
          .select('id, display_name, username, avatar_path, roles')
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
        avatarUrl: author.avatar_path
          ? supabase.storage.from('avatars').getPublicUrl(author.avatar_path).data.publicUrl
          : null,
        roles: Array.isArray(author.roles)
          ? author.roles.filter(isBadge)
          : [],
      }))
      const authorById = new Map(nextAuthors.map((author) => [author.id, author]))
      let savedIds: string[] = []
      const user = sessionResult.data.session?.user
      setCurrentUserId(user?.id ?? null)
      let nextCurrentProfile: CommunityState['currentProfile'] = null
      if (user) {
        const [savedResult, profileResult] = await Promise.all([
          supabase
            .from('community_saved_posts')
            .select('post_id')
            .eq('user_id', user.id)
            .limit(500),
          supabase
            .from('profiles')
            .select('display_name, username, avatar_path, bio, roles')
            .eq('id', user.id)
            .maybeSingle(),
        ])
        if (savedResult.error) throw savedResult.error
        if (profileResult.error) throw profileResult.error
        if (profileResult.data) {
          nextCurrentProfile = {
            displayName: profileResult.data.display_name,
            username: profileResult.data.username,
            avatarUrl: profileResult.data.avatar_path
              ? supabase.storage.from('avatars').getPublicUrl(profileResult.data.avatar_path).data.publicUrl
              : null,
            bio: profileResult.data.bio ?? '',
            roles: Array.isArray(profileResult.data.roles)
              ? profileResult.data.roles.filter(isBadge)
              : [],
          }
        }
        savedIds = (savedResult.data ?? []).map((saved) => saved.post_id)
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

      let nextPosts: Post[] = [...feedRows, ...(savedPostsResult?.data ?? [])].map((post) => {
        const author = authorById.get(post.author_id)
        return {
          id: post.id,
          authorId: post.author_id,
          authorName: author?.displayName ?? 'StoryLines creator',
          authorUsername: author?.username,
          authorAvatarUrl: author?.avatarUrl,
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
      if (nextPosts.length) {
        const ids = nextPosts.map((post) => post.id)
        const idBatches = Array.from({ length: Math.ceil(ids.length / 50) }, (_, index) => ids.slice(index * 50, index * 50 + 50))
        const [countResults, commentCountResults] = await Promise.all([
          Promise.all(idBatches.map((postIds) => (
            supabase.rpc('get_community_post_like_counts', { post_ids: postIds })
          ))),
          Promise.all(idBatches.map((postIds) => (
            supabase.rpc('get_community_post_comment_counts', { post_ids: postIds })
          ))),
        ])
        const countError = countResults.find((result) => result.error)?.error
        if (countError) throw countError
        const commentCountError = commentCountResults.find((result) => result.error)?.error
        if (commentCountError) throw commentCountError
        const counts = countResults.flatMap((result) => result.data ?? [])
        const commentCounts = commentCountResults.flatMap((result) => result.data ?? [])
        const likeResults = user
          ? await Promise.all(idBatches.map((postIds) => (
            supabase.from('community_post_likes').select('post_id').eq('user_id', user.id).in('post_id', postIds)
          )))
          : []
        const likeError = likeResults.find((result) => result.error)?.error
        if (likeError) throw likeError
        const countsByPost = new Map<string, number>(counts.map((row: { post_id: string; like_count: number | string }) => [row.post_id, Number(row.like_count)]))
        const commentCountsByPost = new Map<string, number>(commentCounts.map((row: { post_id: string; comment_count: number | string }) => [row.post_id, Number(row.comment_count)]))
        const myLikedIds = new Set(likeResults.flatMap((result) => result.data ?? []).map((row) => row.post_id))
        nextPosts = nextPosts.map((post) => ({
          ...post,
          likes: countsByPost.get(post.id) ?? 0,
          likedByMe: myLikedIds.has(post.id),
          commentsCount: commentCountsByPost.get(post.id) ?? 0,
        }))
      }

      setSharedPosts(nextPosts)
      setAuthors(nextAuthors)
      setCurrentProfile(nextCurrentProfile)
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

  useEffect(() => {
    const onAvatarUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ userId: string; avatarUrl: string | null }>).detail
      if (!detail?.userId) return
      setAuthors((current) => current.map((author) => (
        author.id === detail.userId ? { ...author, avatarUrl: detail.avatarUrl } : author
      )))
      if (detail.userId === currentUserId) {
        setCurrentProfile((profile) => profile ? { ...profile, avatarUrl: detail.avatarUrl } : profile)
      }
      setSharedPosts((current) => current.map((post) => (
        post.authorId === detail.userId ? { ...post, authorAvatarUrl: detail.avatarUrl } : post
      )))
    }
    window.addEventListener('storylines:profile-avatar-updated', onAvatarUpdated)
    return () => window.removeEventListener('storylines:profile-avatar-updated', onAvatarUpdated)
  }, [currentUserId])

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

  const toggleLike: CommunityState['toggleLike'] = async (id) => {
    const localPost = devicePosts.find((post) => post.id === id)
    if (localPost) {
      setDevicePosts((current) => current.map((post) => (
        post.id === id ? { ...post, likedByMe: !post.likedByMe, likes: post.likes + (post.likedByMe ? -1 : 1) } : post
      )))
      return
    }
    const post = sharedPosts.find((item) => item.id === id)
    if (!post) throw new Error('Post not found.')
    const supabase = getSupabaseClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError) throw userError
    if (!user) throw new Error('Mag-log in para mag-like ng post.')
    setSharedPosts((current) => current.map((item) => (
      item.id === id ? { ...item, likedByMe: !post.likedByMe, likes: Math.max(0, item.likes + (post.likedByMe ? -1 : 1)) } : item
    )))
    try {
      const request = post.likedByMe
        ? supabase.from('community_post_likes').delete().eq('post_id', id).eq('user_id', user.id)
        : supabase.from('community_post_likes').insert({ post_id: id, user_id: user.id })
      const { error } = await request
      if (error) throw error
    } catch (error) {
      setSharedPosts((current) => current.map((item) => item.id === id ? post : item))
      throw error
    }
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

    const wasSaved = savedPostIds.includes(postId)
    setSavedPostIds((current) => wasSaved
      ? current.filter((id) => id !== postId)
      : current.includes(postId) ? current : [...current, postId])
    try {
      const { error: updateError } = wasSaved
        ? await supabase
          .from('community_saved_posts')
          .delete()
          .eq('user_id', user.id)
          .eq('post_id', postId)
        : await supabase
          .from('community_saved_posts')
          .insert({ user_id: user.id, post_id: postId })
      if (updateError) throw updateError
    } catch (error) {
      setSavedPostIds((current) => wasSaved
        ? current.includes(postId) ? current : [...current, postId]
        : current.filter((id) => id !== postId))
      throw error
    }
  }

  const loadComments: CommunityState['loadComments'] = async (postId) => {
    const supabase = getSupabaseClient()
    const { data, count, error: commentsError } = await supabase
      .from('community_post_comments')
      .select('id, post_id, author_id, content, created_at, parent_comment_id', { count: 'exact' })
      .eq('post_id', postId)
      .order('created_at', { ascending: true })
      .limit(100)
    if (commentsError) throw commentsError

    const authorIds = Array.from(new Set((data ?? []).map((comment) => comment.author_id)))
    const commentIds = (data ?? []).map((comment) => comment.id)
    const [profilesResult, reactionCountsResult, myReactionsResult] = await Promise.all([
      authorIds.length
      ? await supabase
        .from('profiles')
        .select('id, display_name, username, avatar_path')
        .in('id', authorIds)
      : Promise.resolve({ data: [], error: null }),
      commentIds.length
        ? supabase.rpc('get_community_comment_reaction_counts', { comment_ids: commentIds })
        : Promise.resolve({ data: [], error: null }),
      currentUserId && commentIds.length
        ? supabase.from('community_comment_reactions').select('comment_id, reaction').eq('user_id', currentUserId).in('comment_id', commentIds)
        : Promise.resolve({ data: [], error: null }),
    ])
    if (profilesResult.error) throw profilesResult.error
    if (reactionCountsResult.error) throw reactionCountsResult.error
    if (myReactionsResult.error) throw myReactionsResult.error
    const profileById = new Map((profilesResult.data ?? []).map((profile) => [profile.id, profile]))
    const reactionCountById = new Map<string, { likes: number | string; dislikes: number | string }>(
      (reactionCountsResult.data ?? []).map((row: { comment_id: string; likes: number | string; dislikes: number | string }) => [row.comment_id, row]),
    )
    const myReactionById = new Map<string, 'like' | 'dislike'>(
      (myReactionsResult.data ?? []).map((row: { comment_id: string; reaction: 'like' | 'dislike' }) => [row.comment_id, row.reaction]),
    )
    const comments: CommunityComment[] = (data ?? []).map((comment) => {
      const author = profileById.get(comment.author_id)
      const reactionCounts = reactionCountById.get(comment.id)
      return {
        id: comment.id,
        postId: comment.post_id,
        authorId: comment.author_id,
        authorName: author?.display_name ?? 'StoryLines reader',
        authorUsername: author?.username,
        authorAvatarUrl: author?.avatar_path
          ? supabase.storage.from('avatars').getPublicUrl(author.avatar_path).data.publicUrl
          : null,
        content: comment.content,
        createdAt: new Date(comment.created_at).getTime(),
        parentCommentId: comment.parent_comment_id,
        likes: Number(reactionCounts?.likes ?? 0),
        dislikes: Number(reactionCounts?.dislikes ?? 0),
        myReaction: myReactionById.get(comment.id) ?? null,
      }
    })
    setSharedPosts((current) => current.map((post) => (
      post.id === postId ? { ...post, commentsCount: count ?? comments.length } : post
    )))
    return comments
  }

  const addComment: CommunityState['addComment'] = async (postId, content, parentCommentId) => {
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
      .select('display_name, username, avatar_path')
      .eq('id', user.id)
      .single()
    if (profileError) throw profileError

    const { data, error: insertError } = await supabase
      .from('community_post_comments')
      .insert({ post_id: postId, author_id: user.id, content: trimmedContent, parent_comment_id: parentCommentId ?? null })
      .select('id, post_id, author_id, content, created_at, parent_comment_id')
      .single()
    if (insertError) throw insertError

    const comment: CommunityComment = {
      id: data.id,
      postId: data.post_id,
      authorId: data.author_id,
      authorName: profile.display_name,
      authorUsername: profile.username,
      authorAvatarUrl: profile.avatar_path
        ? supabase.storage.from('avatars').getPublicUrl(profile.avatar_path).data.publicUrl
        : null,
      content: data.content,
      createdAt: new Date(data.created_at).getTime(),
      parentCommentId: data.parent_comment_id,
      likes: 0,
      dislikes: 0,
      myReaction: null,
    }
    setSharedPosts((current) => current.map((post) => (
      post.id === postId ? { ...post, commentsCount: (post.commentsCount ?? 0) + 1 } : post
    )))
    return comment
  }

  const toggleCommentReaction: CommunityState['toggleCommentReaction'] = async (commentId, reaction) => {
    const supabase = getSupabaseClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError) throw userError
    if (!user) throw new Error('Mag-log in para mag-react sa comment.')
    const { data: existing, error: readError } = await supabase
      .from('community_comment_reactions')
      .select('reaction')
      .eq('comment_id', commentId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (readError) throw readError

    if (existing?.reaction === reaction) {
      const { error } = await supabase.from('community_comment_reactions').delete().eq('comment_id', commentId).eq('user_id', user.id)
      if (error) throw error
    } else if (existing) {
      const { error } = await supabase.from('community_comment_reactions').update({ reaction }).eq('comment_id', commentId).eq('user_id', user.id)
      if (error) throw error
    } else {
      const { error } = await supabase.from('community_comment_reactions').insert({ comment_id: commentId, user_id: user.id, reaction })
      if (error) throw error
    }
  }

  return (
    <CommunityContext.Provider
      value={{
        posts,
        authors,
        currentProfile,
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
        toggleCommentReaction,
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