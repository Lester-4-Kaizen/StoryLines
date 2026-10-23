'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react'
import {
  BookOpen,
  Brush,
  ExternalLink,
  MessageCircle,
  PenLine,
  Share2,
  UserRound,
  UsersRound,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/shared/panel'
import { ProfilePostCard } from '@/components/profile/profile-post-card'
import { isSupabaseStorageImage } from '@/lib/is-supabase-storage-image'
import { getSupabaseClient } from '@/lib/supabase'
import type { ProfileCursor, ProfilePageData, ProfilePost, ProfileRecord, ProfileWork } from '@/lib/profile-data'
import type { Badge, CommunityPostType } from '@/lib/types'

type ProfileTab = 'Posts' | 'Stories' | 'Comics' | 'Art' | 'About' | 'Liked' | 'Saved'
type PostFilter = 'All posts' | 'Updates' | 'Work in progress' | 'Recommendations'
type EditableProfile = {
  displayName: string
  bio: string
  writingLanguages: string
  favoriteGenres: string
  facebookUrl: string
  instagramUrl: string
  portfolioUrl: string
  collaborationRoles: string
}

type ProfileFieldErrors = Partial<Record<keyof EditableProfile, string>>

const TABS: ProfileTab[] = ['Posts', 'Stories', 'Comics', 'Art', 'About']
const FILTERS: PostFilter[] = ['All posts', 'Updates', 'Work in progress', 'Recommendations']
const COMMUNITY_POST_TYPES: CommunityPostType[] = [
  'update',
  'recommendation',
  'work-in-progress',
  'collaborator',
  'feedback',
  'poll',
  'random',
]
const FILTER_TYPES: Record<PostFilter, CommunityPostType | null> = {
  'All posts': null,
  Updates: 'update',
  'Work in progress': 'work-in-progress',
  Recommendations: 'recommendation',
}
function roleLabel(role: Badge) {
  return role === 'artist' ? 'Artist' : role === 'writer' ? 'Writer' : 'Reader'
}

function safeExternalUrl(value: string | null) {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  } catch {
    return null
  }
}

function splitList(value: string) {
  return Array.from(new Set(value.split(',').map((item) => item.trim()).filter(Boolean)))
}

function isCommunityPostType(type: string): type is CommunityPostType {
  return COMMUNITY_POST_TYPES.some((postType) => postType === type)
}

function workTabType(tab: ProfileTab): ProfileWork['type'] | null {
  if (tab === 'Stories') return 'story'
  if (tab === 'Comics') return 'comic'
  if (tab === 'Art') return 'art'
  return null
}

export function ProfileView({ initialData }: { initialData: ProfilePageData }) {
  const router = useRouter()
  const pathname = usePathname()
  const [data, setData] = useState(initialData)
  const [activeTab, setActiveTab] = useState<ProfileTab>('Posts')
  const [activityLoading, setActivityLoading] = useState(false)
  const [activityError, setActivityError] = useState<string | null>(null)
  const [postFilter, setPostFilter] = useState<PostFilter>('All posts')
  const [postDraft, setPostDraft] = useState('')
  const [posting, setPosting] = useState(false)
  const [postError, setPostError] = useState<string | null>(null)
  const [postLoading, setPostLoading] = useState(false)
  const [postCursor, setPostCursor] = useState<ProfileCursor | null>(initialData.postCursor)
  const [morePostsError, setMorePostsError] = useState<string | null>(null)
  const [workLoading, setWorkLoading] = useState(false)
  const [workError, setWorkError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileFieldErrors, setProfileFieldErrors] = useState<ProfileFieldErrors>({})
  const [followPending, setFollowPending] = useState(false)
  const [collaborationPending, setCollaborationPending] = useState(false)
  const [guestPrompt, setGuestPrompt] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [messageOpen, setMessageOpen] = useState(false)
  const [messageDraft, setMessageDraft] = useState('')
  const [messageSending, setMessageSending] = useState(false)
  const [messageError, setMessageError] = useState<string | null>(null)
  const profileTabs: ProfileTab[] = data.currentUserId && data.currentUserId === data.profile?.id
    ? [...TABS, 'Liked', 'Saved']
    : TABS
  const [editable, setEditable] = useState<EditableProfile>(() => ({
    displayName: initialData.profile?.displayName ?? '',
    bio: initialData.profile?.bio ?? '',
    writingLanguages: initialData.profile?.writingLanguages.join(', ') ?? '',
    favoriteGenres: initialData.profile?.favoriteGenres.join(', ') ?? '',
    facebookUrl: initialData.profile?.facebookUrl ?? '',
    instagramUrl: initialData.profile?.instagramUrl ?? '',
    portfolioUrl: initialData.profile?.portfolioUrl ?? '',
    collaborationRoles: initialData.profile?.collaborationRoles.join(', ') ?? '',
  }))

  useEffect(() => {
    setData(initialData)
    setPostCursor(initialData.postCursor)
    setEditable({
      displayName: initialData.profile?.displayName ?? '',
      bio: initialData.profile?.bio ?? '',
      writingLanguages: initialData.profile?.writingLanguages.join(', ') ?? '',
      favoriteGenres: initialData.profile?.favoriteGenres.join(', ') ?? '',
      facebookUrl: initialData.profile?.facebookUrl ?? '',
      instagramUrl: initialData.profile?.instagramUrl ?? '',
      portfolioUrl: initialData.profile?.portfolioUrl ?? '',
      collaborationRoles: initialData.profile?.collaborationRoles.join(', ') ?? '',
    })
  }, [initialData])

  if (initialData.error || !data.profile) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
        <div role="alert" className="rounded-2xl border border-border bg-card p-6">
          <h1 className="font-serif text-2xl font-bold">Hindi maipakita ang profile</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {initialData.error ?? 'Hindi makita ang profile na ito.'}
          </p>
          <Button type="button" variant="outline" className="mt-4 min-h-11" onClick={() => router.refresh()}>
            Subukan ulit
          </Button>
        </div>
      </div>
    )
  }

  const profile = data.profile
  const ownProfile = data.currentUserId === profile.id
  const creatorProfile = profile.roles.some((role) => role === 'writer' || role === 'artist')
  const canPost = ownProfile && creatorProfile
  const categoryPosts = activeTab === 'Liked'
    ? data.likedPosts
    : activeTab === 'Saved'
      ? data.savedPosts
      : data.posts
  const visiblePosts = categoryPosts.filter((post) => {
    const type = FILTER_TYPES[postFilter]
    return type === null || post.type === type
  })
  const visibleWorks = data.works.filter((work) => work.type === workTabType(activeTab))
  const activeWorkType = workTabType(activeTab)
  const activeWorkCursor = activeWorkType ? data.workCursors[activeWorkType] : null
  const loginHref = `/login?next=${encodeURIComponent(pathname)}`

  const askForLogin = (action: string) => {
    setGuestPrompt(action)
    setNotice(null)
  }

  const selectTabWithKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = profileTabs.indexOf(activeTab)
    let nextIndex = currentIndex
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % profileTabs.length
    else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + profileTabs.length) % profileTabs.length
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = profileTabs.length - 1
    else return
    event.preventDefault()
    setActiveTab(profileTabs[nextIndex])
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[nextIndex]?.focus()
  }

  const followProfile = async () => {
    if (followPending) return
    if (!data.currentUserId) {
      askForLogin('Sundan ang creator na ito')
      return
    }
    setFollowPending(true)
    const wasFollowing = data.isFollowing
    setData((current) => ({
      ...current,
      isFollowing: !wasFollowing,
      counts: { ...current.counts, followers: current.counts.followers + (wasFollowing ? -1 : 1) },
    }))
    setActionError(null)
    try {
      const supabase = getSupabaseClient()
      const result = wasFollowing
        ? await supabase.from('community_follows').delete().eq('follower_id', data.currentUserId).eq('creator_id', profile.id)
        : await supabase.from('community_follows').insert({ follower_id: data.currentUserId, creator_id: profile.id })
      if (result.error) throw result.error
    } catch (error) {
      setData((current) => ({
        ...current,
        isFollowing: wasFollowing,
        counts: { ...current.counts, followers: current.counts.followers + (wasFollowing ? 1 : -1) },
      }))
      setActionError(error instanceof Error ? error.message : 'Hindi ma-update ang follow status. Subukan ulit.')
    } finally {
      setFollowPending(false)
    }
  }

  const toggleCollaboration = async () => {
    if (!ownProfile || collaborationPending) return
    setCollaborationPending(true)
    const nextValue = !profile.openForCollaboration
    setData((current) => ({
      ...current,
      profile: current.profile ? { ...current.profile, openForCollaboration: nextValue } : null,
    }))
    setActionError(null)
    try {
      const { error } = await getSupabaseClient()
        .from('profiles')
        .update({ open_for_collaboration: nextValue })
        .eq('id', profile.id)
      if (error) throw error
    } catch (error) {
      setData((current) => ({
        ...current,
        profile: current.profile ? { ...current.profile, openForCollaboration: !nextValue } : null,
      }))
      setActionError(error instanceof Error ? error.message : 'Hindi ma-update ang collaboration status.')
    } finally {
      setCollaborationPending(false)
    }
  }

  const toggleLike = async (postId: string) => {
    if (!data.currentUserId) {
      askForLogin('Mag-like ng post')
      return
    }
    const post = [...data.posts, ...data.likedPosts, ...data.savedPosts].find((item) => item.id === postId)
    if (!post) return
    const wasLiked = post.likedByMe
    const previousPosts = data.posts
    const previousLikedPosts = data.likedPosts
    const previousSavedPosts = data.savedPosts
    setData((current) => ({
      ...current,
      posts: current.posts.map((item) => item.id === postId
        ? { ...item, likedByMe: !wasLiked, likes: item.likes + (wasLiked ? -1 : 1) }
        : item),
      likedPosts: current.likedPosts.map((item) => item.id === postId
        ? { ...item, likedByMe: !wasLiked, likes: item.likes + (wasLiked ? -1 : 1) }
        : item),
      savedPosts: current.savedPosts.map((item) => item.id === postId
        ? { ...item, likedByMe: !wasLiked, likes: item.likes + (wasLiked ? -1 : 1) }
        : item),
    }))
    try {
      const supabase = getSupabaseClient()
      const result = wasLiked
        ? await supabase.from('community_post_likes').delete().eq('post_id', postId).eq('user_id', data.currentUserId)
        : await supabase.from('community_post_likes').insert({ post_id: postId, user_id: data.currentUserId })
      if (result.error) throw result.error
      if (wasLiked) {
        setData((current) => ({ ...current, likedPosts: current.likedPosts.filter((item) => item.id !== postId) }))
      }
    } catch (error) {
      setData((current) => ({ ...current, posts: previousPosts, likedPosts: previousLikedPosts, savedPosts: previousSavedPosts }))
      throw error
    }
  }

  const toggleSave = async (postId: string) => {
    if (!data.currentUserId) {
      askForLogin('I-save ang post na ito')
      return
    }
    const post = [...data.posts, ...data.likedPosts, ...data.savedPosts].find((item) => item.id === postId)
    if (!post) return
    const wasSaved = post.savedByMe
    const previousPosts = data.posts
    const previousLikedPosts = data.likedPosts
    const previousSavedPosts = data.savedPosts
    setData((current) => ({
      ...current,
      posts: current.posts.map((item) => item.id === postId ? { ...item, savedByMe: !wasSaved } : item),
      savedPosts: current.savedPosts.map((item) => item.id === postId ? { ...item, savedByMe: !wasSaved } : item),
      likedPosts: current.likedPosts.map((item) => item.id === postId ? { ...item, savedByMe: !wasSaved } : item),
    }))
    try {
      const supabase = getSupabaseClient()
      const result = wasSaved
        ? await supabase.from('community_saved_posts').delete().eq('user_id', data.currentUserId).eq('post_id', postId)
        : await supabase.from('community_saved_posts').insert({ user_id: data.currentUserId, post_id: postId })
      if (result.error) throw result.error
      if (wasSaved) {
        setData((current) => ({ ...current, savedPosts: current.savedPosts.filter((item) => item.id !== postId) }))
      }
    } catch (error) {
      setData((current) => ({ ...current, posts: previousPosts, likedPosts: previousLikedPosts, savedPosts: previousSavedPosts }))
      throw error
    }
  }

  const editPost = async (postId: string, content: string) => {
    if (!ownProfile || !data.currentUserId) throw new Error('You can only edit your own community posts.')
    const post = data.posts.find((item) => item.id === postId)
    if (!post) throw new Error('Post not found.')
    const { data: updatedRow, error } = await getSupabaseClient()
      .from('community_posts')
      .update({ content })
      .eq('id', postId)
      .eq('author_id', data.currentUserId)
      .select('id')
      .single()
    if (error) throw error
    if (updatedRow.id !== postId) throw new Error('Could not verify the updated post.')
    setData((current) => ({
      ...current,
      posts: current.posts.map((item) => item.id === postId ? { ...item, content } : item),
      likedPosts: current.likedPosts.map((item) => item.id === postId ? { ...item, content } : item),
      savedPosts: current.savedPosts.map((item) => item.id === postId ? { ...item, content } : item),
    }))
  }

  const deletePost = async (postId: string) => {
    if (!ownProfile || !data.currentUserId) throw new Error('You can only delete your own community posts.')
    const { data: deletedRow, error } = await getSupabaseClient()
      .from('community_posts')
      .delete()
      .eq('id', postId)
      .eq('author_id', data.currentUserId)
      .select('id')
      .single()
    if (error) throw error
    if (deletedRow.id !== postId) throw new Error('Could not verify the deleted post.')
    setData((current) => ({
      ...current,
      posts: current.posts.filter((item) => item.id !== postId),
      likedPosts: current.likedPosts.filter((item) => item.id !== postId),
      savedPosts: current.savedPosts.filter((item) => item.id !== postId),
      counts: { ...current.counts, posts: Math.max(0, current.counts.posts - 1) },
    }))
  }

  const loadMoreActivity = async (category: 'Liked' | 'Saved') => {
    if (!data.currentUserId || activityLoading) return
    const cursor = category === 'Liked' ? data.likedCursor : data.savedCursor
    if (!cursor) return

    setActivityLoading(true)
    setActivityError(null)
    try {
      const supabase = getSupabaseClient()
      const activityResult = category === 'Liked'
        ? await supabase.from('community_post_likes')
          .select('post_id, created_at')
          .eq('user_id', data.currentUserId)
          .or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},post_id.lt.${cursor.id})`)
          .order('created_at', { ascending: false })
          .order('post_id', { ascending: false })
          .limit(10)
        : await supabase.from('community_saved_posts')
          .select('post_id, created_at')
          .eq('user_id', data.currentUserId)
          .or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},post_id.lt.${cursor.id})`)
          .order('created_at', { ascending: false })
          .order('post_id', { ascending: false })
          .limit(10)
      const { data: activityRows, error: activityError } = activityResult
      if (activityError) throw activityError
      const postIds = (activityRows ?? []).map((row) => row.post_id)
      if (!postIds.length) {
        setData((current) => ({ ...current, [category === 'Liked' ? 'likedCursor' : 'savedCursor']: null }))
        return
      }

      const { data: postRows, error: postsError } = await supabase
        .from('community_posts')
        .select('id, author_id, author_role, type, content, image_urls, tags, looking_for, created_at')
        .in('id', postIds)
      if (postsError) throw postsError
      const authorIds = Array.from(new Set((postRows ?? []).map((post) => post.author_id)))
      const authorsPromise = authorIds.length
        ? supabase.from('profiles').select('id, display_name, username').in('id', authorIds)
        : Promise.resolve({ data: [], error: null })
      const likesPromise = supabase.rpc('get_community_post_like_counts', { post_ids: postIds })
      const [authorsResult, likesResult] = await Promise.all([authorsPromise, likesPromise])
      if (authorsResult.error) throw authorsResult.error
      if (likesResult.error) throw likesResult.error
      const authorRows = authorsResult.data
      const likesRows = likesResult.data
      const authorsById = new Map((authorRows ?? []).map((author) => [author.id, author]))
      const likesById = new Map<string, number>()
      for (const row of likesRows ?? []) {
        likesById.set(row.post_id, Number(row.like_count))
      }
      const nextPosts: ProfilePost[] = (postRows ?? []).map((post) => {
        const author = authorsById.get(post.author_id)
        return {
          id: post.id,
          content: post.content,
          type: isCommunityPostType(post.type) ? post.type : 'update',
          imageUrls: post.image_urls ?? [],
          tags: post.tags ?? [],
          lookingFor: post.looking_for ?? [],
          createdAt: post.created_at,
          likes: Number(likesById.get(post.id) ?? 0),
          likedByMe: category === 'Liked',
          savedByMe: category === 'Saved',
          authorId: post.author_id,
          authorDisplayName: author?.display_name ?? 'StoryLines creator',
          authorUsername: author?.username ?? '',
        }
      })
      const cursorRow = activityRows?.[activityRows.length - 1]
      setData((current) => category === 'Liked'
        ? {
          ...current,
          likedPosts: [...current.likedPosts, ...nextPosts.filter((post) => !current.likedPosts.some((existing) => existing.id === post.id))],
          likedCursor: activityRows.length === 10 && cursorRow ? { createdAt: cursorRow.created_at, id: cursorRow.post_id } : null,
        }
        : {
          ...current,
          savedPosts: [...current.savedPosts, ...nextPosts.filter((post) => !current.savedPosts.some((existing) => existing.id === post.id))],
          savedCursor: activityRows.length === 10 && cursorRow ? { createdAt: cursorRow.created_at, id: cursorRow.post_id } : null,
        })
    } catch (error) {
      setActivityError(error instanceof Error ? error.message : 'Hindi ma-load ang posts. Subukan ulit.')
    } finally {
      setActivityLoading(false)
    }
  }

  const submitPost = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const content = postDraft.trim()
    if (!canPost || !data.currentUserId) {
      if (!data.currentUserId) askForLogin('Mag-post sa community')
      else setPostError('Kailangan ng Writer o Artist badge para makapag-post.')
      return
    }
    if (!content || content.length > 500) {
      setPostError('Maglagay ng post na 1 hanggang 500 characters.')
      return
    }
    setPosting(true)
    setPostError(null)
    try {
      const authorRole = profile.roles.includes('writer') ? 'writer' : 'artist'
      const { data: created, error } = await getSupabaseClient()
        .from('community_posts')
        .insert({
          author_id: profile.id,
          author_role: authorRole,
          type: 'update',
          content,
          image_urls: [],
          tags: [],
          looking_for: [],
        })
        .select('id, content, type, image_urls, tags, looking_for, created_at')
        .single()
      if (error) throw error
      const newPost = {
        id: created.id,
        authorId: profile.id,
        content: created.content,
        type: 'update' as const,
        imageUrls: created.image_urls ?? [],
        tags: created.tags ?? [],
        lookingFor: created.looking_for ?? [],
        createdAt: created.created_at,
        likes: 0,
        likedByMe: false,
        savedByMe: false,
      }
      setData((current) => ({
        ...current,
        posts: [newPost, ...current.posts],
        counts: { ...current.counts, posts: current.counts.posts + 1 },
      }))
      setPostDraft('')
      setNotice('Naibahagi na ang post mo.')
    } catch (error) {
      setPostError(error instanceof Error ? error.message : 'Hindi naipadala ang post. Subukan ulit.')
    } finally {
      setPosting(false)
    }
  }

  const loadMorePosts = async () => {
    if (!postCursor) return
    setPostLoading(true)
    setMorePostsError(null)
    try {
      const { data: rows, error } = await getSupabaseClient()
        .from('community_posts')
        .select('id, content, type, image_urls, tags, looking_for, created_at')
        .eq('author_id', profile.id)
        .or(`created_at.lt.${postCursor.createdAt},and(created_at.eq.${postCursor.createdAt},id.lt.${postCursor.id})`)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(10)
      if (error) throw error
      const postIds = (rows ?? []).map((post) => post.id)
      const [likesResult, likedResult, savedResult] = await Promise.all([
        postIds.length
          ? getSupabaseClient().rpc('get_community_post_like_counts', { post_ids: postIds })
          : Promise.resolve({ data: [], error: null }),
        data.currentUserId && postIds.length
          ? getSupabaseClient().from('community_post_likes').select('post_id').eq('user_id', data.currentUserId).in('post_id', postIds)
          : Promise.resolve({ data: [], error: null }),
        data.currentUserId && postIds.length
          ? getSupabaseClient().from('community_saved_posts').select('post_id').eq('user_id', data.currentUserId).in('post_id', postIds)
          : Promise.resolve({ data: [], error: null }),
      ])
      if (likesResult.error) throw likesResult.error
      if (likedResult.error) throw likedResult.error
      if (savedResult.error) throw savedResult.error
      const likesByPost = new Map<string, number>()
      for (const like of likesResult.data ?? []) {
        likesByPost.set(like.post_id, Number(like.like_count))
      }
      const likedIds = new Set((likedResult.data ?? []).map((like) => like.post_id))
      const savedIds = new Set((savedResult.data ?? []).map((row) => row.post_id))
      const nextPosts = (rows ?? []).map((post) => {
        return {
          id: post.id,
          content: post.content,
          type: isCommunityPostType(post.type) ? post.type : 'update',
          imageUrls: post.image_urls ?? [],
          tags: post.tags ?? [],
          lookingFor: post.looking_for ?? [],
          createdAt: post.created_at,
          likes: likesByPost.get(post.id) ?? 0,
          likedByMe: likedIds.has(post.id),
          savedByMe: savedIds.has(post.id),
        }
      })
      setData((current) => ({ ...current, posts: [...current.posts, ...nextPosts] }))
      setPostCursor(rows?.length === 10 && rows.length > 0
        ? { createdAt: rows[rows.length - 1].created_at, id: rows[rows.length - 1].id }
        : null)
    } catch (error) {
      setMorePostsError(error instanceof Error ? error.message : 'Hindi ma-load ang susunod na mga post.')
    } finally {
      setPostLoading(false)
    }
  }

  const loadMoreWorks = async () => {
    const type = workTabType(activeTab)
    const cursor = type ? data.workCursors[type] : null
    if (!type || !cursor) return
    setWorkLoading(true)
    setWorkError(null)
    try {
      let query = getSupabaseClient()
        .from('creator_works')
        .select('id, title, type, synopsis, genre, language, status, cover_image_url, created_at')
        .eq('author_id', profile.id)
        .eq('type', type)
        .neq('status', 'Draft')
      query = query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`)
      const { data: rows, error } = await query
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(10)
      if (error) throw error
      const nextWorks: ProfileWork[] = (rows ?? []).map((work) => ({
        id: work.id,
        title: work.title,
        type: work.type === 'comic' || work.type === 'art' ? work.type : 'story',
        synopsis: work.synopsis ?? '',
        genre: work.genre,
        language: work.language,
        status: work.status === 'Complete' ? 'Complete' : 'Ongoing',
        coverImageUrl: work.cover_image_url,
        createdAt: work.created_at,
      }))
      setData((current) => ({ ...current, works: [...current.works, ...nextWorks] }))
      setData((current) => ({
        ...current,
        workCursors: {
          ...current.workCursors,
          [type]: rows?.length === 10 && rows.length > 0
            ? { createdAt: rows[rows.length - 1].created_at, id: rows[rows.length - 1].id }
            : null,
        },
      }))
    } catch (error) {
      setWorkError(error instanceof Error ? error.message : 'Hindi ma-load ang mga gawa.')
    } finally {
      setWorkLoading(false)
    }
  }

  const shareProfile = async () => {
    const url = `${window.location.origin}${pathname}`
    try {
      await navigator.clipboard.writeText(url)
      setNotice('Nakopya ang profile link.')
    } catch {
      setNotice(url)
    }
  }

  const editProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!ownProfile || !data.currentUserId) return
    const displayName = editable.displayName.trim()
    const bio = editable.bio.trim()
    const facebookUrl = editable.facebookUrl.trim()
    const instagramUrl = editable.instagramUrl.trim()
    const portfolioUrl = editable.portfolioUrl.trim()
    const languages = splitList(editable.writingLanguages)
    const genres = splitList(editable.favoriteGenres)
    const collaborationRoles = splitList(editable.collaborationRoles)
    const nextErrors: ProfileFieldErrors = {}
    if (!displayName || displayName.length > 80) {
      nextErrors.displayName = 'Maglagay ng pangalan na 1 hanggang 80 characters.'
    }
    if (bio.length > 160) {
      nextErrors.bio = 'Hanggang 160 characters lang ang bio.'
    }
    if (languages.length > 5) nextErrors.writingLanguages = 'Hanggang 5 language lang ang puwede.'
    if (genres.length > 10) nextErrors.favoriteGenres = 'Hanggang 10 genre lang ang puwede.'
    if (collaborationRoles.length > 5) nextErrors.collaborationRoles = 'Hanggang 5 collaboration role lang ang puwede.'
    if (facebookUrl && !safeExternalUrl(facebookUrl)) nextErrors.facebookUrl = 'Gumamit ng valid na http o https link.'
    if (instagramUrl && !safeExternalUrl(instagramUrl)) nextErrors.instagramUrl = 'Gumamit ng valid na http o https link.'
    if (portfolioUrl && !safeExternalUrl(portfolioUrl)) nextErrors.portfolioUrl = 'Gumamit ng valid na http o https link.'
    setProfileFieldErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      setProfileError(null)
      return
    }
    setSavingProfile(true)
    setProfileError(null)
    try {
      const patch = {
        display_name: displayName,
        bio,
        writing_languages: languages,
        favorite_genres: genres,
        facebook_url: facebookUrl || null,
        instagram_url: instagramUrl || null,
        portfolio_url: portfolioUrl || null,
        collaboration_roles: collaborationRoles,
      }
      const { error } = await getSupabaseClient().from('profiles').update(patch).eq('id', profile.id)
      if (error) throw error
      setData((current) => ({
        ...current,
        profile: current.profile ? {
          ...current.profile,
          displayName,
          bio,
          writingLanguages: patch.writing_languages,
          favoriteGenres: patch.favorite_genres,
          facebookUrl: patch.facebook_url,
          instagramUrl: patch.instagram_url,
          portfolioUrl: patch.portfolio_url,
          collaborationRoles: patch.collaboration_roles,
        } : null,
      }))
      setEditing(false)
      setNotice('Na-save na ang profile mo.')
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : 'Hindi na-save ang profile. Subukan ulit.')
    } finally {
      setSavingProfile(false)
    }
  }

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!data.currentUserId) {
      askForLogin('Magpadala ng mensahe')
      return
    }
    const content = messageDraft.trim()
    if (!content || content.length > 2000) {
      setMessageError('Maglagay ng mensaheng 1 hanggang 2,000 characters.')
      return
    }
    setMessageSending(true)
    setMessageError(null)
    try {
      const { error } = await getSupabaseClient().from('community_direct_messages').insert({
        sender_id: data.currentUserId,
        recipient_id: profile.id,
        content,
      })
      if (error) throw error
      setMessageDraft('')
      setMessageOpen(false)
      setNotice('Naipadala na ang mensahe.')
    } catch (error) {
      setMessageError(error instanceof Error ? error.message : 'Hindi naipadala ang mensahe. Subukan ulit.')
    } finally {
      setMessageSending(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 sm:gap-4">
      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="h-28 bg-[linear-gradient(115deg,color-mix(in_oklch,var(--primary)_96%,var(--accent)),color-mix(in_oklch,var(--accent)_72%,var(--primary)))] sm:h-36" aria-hidden="true" />
        <div className="flex flex-col gap-4 px-4 pb-4 sm:flex-row sm:items-end sm:px-6">
          <span className="-mt-8 flex size-16 shrink-0 items-center justify-center rounded-full border-4 border-card bg-secondary text-accent sm:-mt-10 sm:size-20" aria-hidden="true">
            <UserRound className="size-8 sm:size-9" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="break-words font-serif text-2xl font-bold sm:text-3xl">{profile.displayName}</h1>
            <p className="mt-1 break-all text-xs text-muted-foreground">@{profile.username}{profile.bio ? ` · ${profile.bio}` : ''}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {profile.roles.map((role) => (
                <span key={role} className="rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold">
                  {roleLabel(role)}
                </span>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {ownProfile ? (
              <Button type="button" variant="outline" className="min-h-11 rounded-full" onClick={() => setEditing((value) => !value)}>
                {editing ? 'Cancel edit' : 'Edit profile'}
              </Button>
            ) : creatorProfile ? (
              <Button type="button" disabled={followPending} className="min-h-11 rounded-full bg-accent text-accent-foreground motion-reduce:transition-none" onClick={() => void followProfile()}>
                <UsersRound className="size-4" /> {followPending ? 'Saving…' : data.isFollowing ? 'Following' : 'Follow'}
              </Button>
            ) : null}
            <Button type="button" variant="outline" className="min-h-11 rounded-full" onClick={() => void shareProfile()}>
              <Share2 className="size-4" /> Share profile
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-border px-4 py-3 text-xs sm:px-6">
          <span><strong>{data.counts.followers}</strong> Followers</span>
          <span><strong>{data.counts.following}</strong> Following</span>
          <span><strong>{data.counts.works}</strong> Works</span>
          <span><strong>{data.counts.posts}</strong> Posts</span>
        </div>
        <div className="flex min-h-12 gap-1 overflow-x-auto border-t border-border px-3" role="tablist" aria-label="Profile content" onKeyDown={selectTabWithKeyboard}>
          {profileTabs.map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              id={`profile-tab-${tab.toLowerCase()}`}
              aria-controls="profile-tab-panel"
              aria-selected={activeTab === tab}
              tabIndex={activeTab === tab ? 0 : -1}
              className={`min-h-12 shrink-0 border-b-2 px-3 text-xs font-bold focus-visible:outline-2 focus-visible:outline-ring sm:px-4 ${activeTab === tab ? 'border-accent text-accent' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
      </section>

      {editing && (
        <Panel>
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => void editProfile(event)}>
            <label className="text-sm font-semibold">
              Display name
              <input value={editable.displayName} maxLength={80} aria-invalid={Boolean(profileFieldErrors.displayName)} aria-describedby={profileFieldErrors.displayName ? 'profile-error-name' : undefined} onChange={(event) => setEditable((current) => ({ ...current, displayName: event.target.value }))} className="mt-2 min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" required />
              {profileFieldErrors.displayName && <span id="profile-error-name" role="alert" className="mt-1 block text-xs text-destructive">{profileFieldErrors.displayName}</span>}
            </label>
            <label className="text-sm font-semibold sm:col-span-2">
              Bio
              <textarea value={editable.bio} maxLength={160} aria-invalid={Boolean(profileFieldErrors.bio)} aria-describedby={profileFieldErrors.bio ? 'profile-error-bio' : undefined} onChange={(event) => setEditable((current) => ({ ...current, bio: event.target.value }))} className="mt-2 min-h-20 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
              {profileFieldErrors.bio && <span id="profile-error-bio" role="alert" className="mt-1 block text-xs text-destructive">{profileFieldErrors.bio}</span>}
              <span className="mt-1 block text-right text-xs font-normal text-muted-foreground">{editable.bio.length}/160</span>
            </label>
            <label className="text-sm font-semibold">
              Writes in (comma-separated)
              <input value={editable.writingLanguages} aria-invalid={Boolean(profileFieldErrors.writingLanguages)} aria-describedby={profileFieldErrors.writingLanguages ? 'profile-error-languages' : undefined} onChange={(event) => setEditable((current) => ({ ...current, writingLanguages: event.target.value }))} className="mt-2 min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
              {profileFieldErrors.writingLanguages && <span id="profile-error-languages" role="alert" className="mt-1 block text-xs text-destructive">{profileFieldErrors.writingLanguages}</span>}
            </label>
            <label className="text-sm font-semibold">
              Favorite genres (comma-separated)
              <input value={editable.favoriteGenres} aria-invalid={Boolean(profileFieldErrors.favoriteGenres)} aria-describedby={profileFieldErrors.favoriteGenres ? 'profile-error-genres' : undefined} onChange={(event) => setEditable((current) => ({ ...current, favoriteGenres: event.target.value }))} className="mt-2 min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
              {profileFieldErrors.favoriteGenres && <span id="profile-error-genres" role="alert" className="mt-1 block text-xs text-destructive">{profileFieldErrors.favoriteGenres}</span>}
            </label>
            <label className="text-sm font-semibold">
              Facebook link
              <input type="url" value={editable.facebookUrl} aria-invalid={Boolean(profileFieldErrors.facebookUrl)} aria-describedby={profileFieldErrors.facebookUrl ? 'profile-error-facebook' : undefined} onChange={(event) => setEditable((current) => ({ ...current, facebookUrl: event.target.value }))} className="mt-2 min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
              {profileFieldErrors.facebookUrl && <span id="profile-error-facebook" role="alert" className="mt-1 block text-xs text-destructive">{profileFieldErrors.facebookUrl}</span>}
            </label>
            <label className="text-sm font-semibold">
              Instagram link
              <input type="url" value={editable.instagramUrl} aria-invalid={Boolean(profileFieldErrors.instagramUrl)} aria-describedby={profileFieldErrors.instagramUrl ? 'profile-error-instagram' : undefined} onChange={(event) => setEditable((current) => ({ ...current, instagramUrl: event.target.value }))} className="mt-2 min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
              {profileFieldErrors.instagramUrl && <span id="profile-error-instagram" role="alert" className="mt-1 block text-xs text-destructive">{profileFieldErrors.instagramUrl}</span>}
            </label>
            <label className="text-sm font-semibold">
              Portfolio link
              <input type="url" value={editable.portfolioUrl} aria-invalid={Boolean(profileFieldErrors.portfolioUrl)} aria-describedby={profileFieldErrors.portfolioUrl ? 'profile-error-portfolio' : undefined} onChange={(event) => setEditable((current) => ({ ...current, portfolioUrl: event.target.value }))} className="mt-2 min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
              {profileFieldErrors.portfolioUrl && <span id="profile-error-portfolio" role="alert" className="mt-1 block text-xs text-destructive">{profileFieldErrors.portfolioUrl}</span>}
            </label>
            <label className="text-sm font-semibold">
              Looking for (comma-separated)
              <input value={editable.collaborationRoles} aria-invalid={Boolean(profileFieldErrors.collaborationRoles)} aria-describedby={profileFieldErrors.collaborationRoles ? 'profile-error-collaboration' : undefined} onChange={(event) => setEditable((current) => ({ ...current, collaborationRoles: event.target.value }))} className="mt-2 min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
              {profileFieldErrors.collaborationRoles && <span id="profile-error-collaboration" role="alert" className="mt-1 block text-xs text-destructive">{profileFieldErrors.collaborationRoles}</span>}
            </label>
            {profileError && <p role="alert" className="text-sm text-destructive sm:col-span-2">{profileError}</p>}
            <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
              <Button type="button" variant="outline" className="min-h-11" onClick={() => setEditing(false)}>Cancel</Button>
              <Button type="submit" disabled={savingProfile} className="min-h-11 bg-accent text-accent-foreground">{savingProfile ? 'Saving…' : 'Save changes'}</Button>
            </div>
          </form>
        </Panel>
      )}

      {guestPrompt && (
        <p className="rounded-xl border border-accent/30 bg-card px-4 py-3 text-sm" role="status">
          Mag-log in para {guestPrompt.toLocaleLowerCase()}.{' '}
          <Link href={loginHref} className="font-bold text-accent underline underline-offset-2">Mag-log in</Link>
          <button type="button" className="ml-3 min-h-11 px-2 text-xs font-bold text-muted-foreground" onClick={() => setGuestPrompt(null)}>Dismiss</button>
        </p>
      )}
      {notice && <p role="status" className="rounded-xl border border-border bg-card px-4 py-3 text-sm">{notice}</p>}
      {actionError && <p role="alert" className="rounded-xl border border-destructive/30 bg-card px-4 py-3 text-sm text-destructive">{actionError}</p>}

      <div className="grid min-w-0 items-start gap-3 sm:gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section
          id="profile-tab-panel"
          role="tabpanel"
          aria-labelledby={`profile-tab-${activeTab.toLowerCase()}`}
          className="flex min-w-0 flex-col gap-3 sm:gap-4"
        >
          {['Posts', 'Liked', 'Saved'].includes(activeTab) && (
            <>
              {activeTab === 'Posts' && <form onSubmit={(event) => void submitPost(event)} className="rounded-2xl border border-border bg-card p-3 shadow-[0_2px_0_rgba(68,45,31,0.05)]">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-accent" aria-hidden="true">
                    <UserRound className="size-5" />
                  </span>
                  <label htmlFor="profile-post-input" className="sr-only">Anong ginagawa mo ngayon?</label>
                  <input
                    id="profile-post-input"
                    value={postDraft}
                    maxLength={500}
                    onChange={(event) => setPostDraft(event.target.value)}
                    placeholder={canPost ? 'Anong ginagawa mo ngayon?' : 'Mag-log in para makapag-post'}
                    disabled={!canPost}
                    className="min-h-11 min-w-0 flex-1 rounded-full border border-border bg-secondary/60 px-4 text-xs outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-80"
                  />
                  {canPost ? (
                    <Button type="submit" disabled={posting || !postDraft.trim()} className="min-h-11 rounded-full bg-accent px-4 text-xs font-bold text-accent-foreground">
                      {posting ? 'Posting…' : 'Post'}
                    </Button>
                  ) : (
                    <Link href={data.currentUserId ? '/settings' : loginHref} className="inline-flex min-h-11 items-center rounded-full bg-accent px-4 text-xs font-bold text-accent-foreground">
                      {data.currentUserId ? 'Join as creator' : 'Log in'}
                    </Link>
                  )}
                </div>
                {postError && <p role="alert" className="mt-2 text-xs text-destructive">{postError}</p>}
              </form>}
              {activeTab === 'Posts' && <div className="flex flex-wrap gap-2" aria-label="Filter community posts">
                {FILTERS.map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    aria-pressed={postFilter === filter}
                    className={`min-h-10 rounded-full border px-3 text-xs font-semibold focus-visible:ring-2 focus-visible:ring-ring ${postFilter === filter ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card hover:bg-muted'}`}
                    onClick={() => setPostFilter(filter)}
                  >
                    {filter}
                  </button>
                ))}
              </div>}
              {visiblePosts.length === 0 ? (
                <div className="rounded-2xl border border-border bg-card p-6 text-center">
                  <MessageCircle className="mx-auto size-6 text-accent" aria-hidden="true" />
                  <p className="mt-3 text-sm font-semibold">
                    {activeTab === 'Liked'
                      ? 'Wala ka pang liked na post.'
                      : activeTab === 'Saved'
                        ? 'Wala ka pang saved na post.'
                        : data.counts.posts === 0
                          ? 'Wala ka pang community post. Ikaw na ang mauna ngayon!'
                          : `Wala pang ${postFilter.toLocaleLowerCase()} na post.`}
                  </p>
                  {activeTab === 'Posts' && canPost && data.counts.posts === 0 && (
                    <button type="button" className="mt-2 min-h-11 px-2 text-xs font-bold text-accent underline underline-offset-2" onClick={() => document.getElementById('profile-post-input')?.focus()}>
                      Gumawa ng post
                    </button>
                  )}
                </div>
              ) : visiblePosts.map((post) => (
                <ProfilePostCard
                  key={post.id}
                  post={post}
                  displayName={post.authorDisplayName ?? profile.displayName}
                  username={post.authorUsername ?? profile.username}
                  currentUserId={data.currentUserId}
                  isOwnPost={ownProfile && data.currentUserId === post.authorId}
                  onLike={toggleLike}
                  onSave={toggleSave}
                  onEdit={editPost}
                  onDelete={deletePost}
                  onLoginRequired={askForLogin}
                />
              ))}
              {morePostsError && (
                <div className="rounded-xl border border-border bg-card p-3 text-sm">
                  <p role="alert" className="text-destructive">{morePostsError}</p>
                  <button type="button" className="mt-2 min-h-11 text-xs font-bold text-accent" onClick={() => void loadMorePosts()}>Subukan ulit</button>
                </div>
              )}
              {activeTab === 'Posts' && postCursor && (
                <Button type="button" variant="outline" disabled={postLoading} className="min-h-11 w-full rounded-xl" onClick={() => void loadMorePosts()}>
                  {postLoading ? 'Naglo-load…' : 'Load more posts'}
                </Button>
              )}
              {activeTab === 'Liked' && data.likedCursor && (
                <Button type="button" variant="outline" disabled={activityLoading} className="min-h-11 w-full rounded-xl" onClick={() => void loadMoreActivity('Liked')}>
                  {activityLoading ? 'Naglo-load…' : 'Load more liked posts'}
                </Button>
              )}
              {activeTab === 'Saved' && data.savedCursor && (
                <Button type="button" variant="outline" disabled={activityLoading} className="min-h-11 w-full rounded-xl" onClick={() => void loadMoreActivity('Saved')}>
                  {activityLoading ? 'Naglo-load…' : 'Load more saved posts'}
                </Button>
              )}
              {activityError && <p role="alert" className="text-sm text-destructive">{activityError}</p>}
            </>
          )}

          {workTabType(activeTab) && (
            <>
              {visibleWorks.length === 0 ? (
                <div className="rounded-2xl border border-border bg-card p-6 text-center">
                  {activeTab === 'Art' ? <Brush className="mx-auto size-6 text-accent" /> : <BookOpen className="mx-auto size-6 text-accent" />}
                  <p className="mt-3 text-sm font-semibold">Wala pang nailathalang {activeTab.toLocaleLowerCase()}.</p>
                  {ownProfile && <Link href="/create/works/new" className="mt-2 inline-flex min-h-11 items-center text-xs font-bold text-accent underline underline-offset-2">Gumawa ng bagong work</Link>}
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {visibleWorks.map((work) => (
                    <article key={work.id} className="overflow-hidden rounded-2xl border border-border bg-card">
                      <div className="relative aspect-[16/9] bg-secondary">
                        {work.coverImageUrl ? (
                          <Image src={work.coverImageUrl} alt={`Cover for ${work.title}`} fill loading="lazy" sizes="(max-width: 640px) 100vw, 50vw" className="object-cover" unoptimized={!isSupabaseStorageImage(work.coverImageUrl)} />
                        ) : (
                          <div className="flex h-full items-center justify-center text-accent" aria-hidden="true">
                            {work.type === 'comic' || work.type === 'art' ? <Brush className="size-8" /> : <BookOpen className="size-8" />}
                          </div>
                        )}
                      </div>
                      <div className="p-4">
                        <h2 className="break-words font-serif text-lg font-bold">{work.title}</h2>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {[work.genre, work.language, work.status].filter(Boolean).join(' · ')}
                        </p>
                        {work.synopsis && <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">{work.synopsis}</p>}
                      </div>
                    </article>
                  ))}
                </div>
              )}
              {workError && <p role="alert" className="text-sm text-destructive">{workError}</p>}
              {activeWorkCursor && (
                <Button type="button" variant="outline" disabled={workLoading} className="min-h-11 w-full rounded-xl" onClick={() => void loadMoreWorks()}>
                  {workLoading ? 'Naglo-load…' : 'Load more'}
                </Button>
              )}
            </>
          )}

          {activeTab === 'About' && <AboutDetails profile={profile} />}
        </section>

        <aside className="flex min-w-0 flex-col gap-3 sm:gap-4">
          <AboutDetails profile={profile} compact />
          <Panel className="p-4">
            <p className="eyebrow">Open for collaboration</p>
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="text-xs font-bold">
                {profile.collaborationRoles.length ? `Looking for: ${profile.collaborationRoles.join(', ')}` : 'Looking for collaborators'}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={profile.openForCollaboration}
                aria-label="Open for collaboration"
                onClick={() => void toggleCollaboration()}
                disabled={!ownProfile || collaborationPending}
                className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition-colors focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none disabled:cursor-default ${profile.openForCollaboration ? 'bg-accent' : 'bg-muted'}`}
              >
                <span className={`size-5 rounded-full bg-white shadow transition-transform motion-reduce:transition-none ${profile.openForCollaboration ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
            {ownProfile ? (
              <button type="button" className="mt-2 min-h-11 rounded-full border border-border px-3 text-xs font-semibold hover:bg-muted" onClick={() => setEditing(true)}>
                {editing ? 'Edit collaboration roles above' : 'Edit collaboration preferences'}
              </button>
            ) : profile.openForCollaboration ? (
              <button type="button" className="mt-2 min-h-11 rounded-full border border-border px-3 text-xs font-semibold hover:bg-muted" onClick={() => data.currentUserId ? setMessageOpen((value) => !value) : askForLogin('Magpadala ng mensahe')}>
                Send a message
              </button>
            ) : null}
            {messageOpen && (
              <form className="mt-3 flex flex-col gap-2 border-t border-border pt-3" onSubmit={(event) => void sendMessage(event)}>
                <label htmlFor="profile-message" className="text-xs font-bold">Message {profile.displayName}</label>
                <textarea id="profile-message" value={messageDraft} maxLength={2000} onChange={(event) => setMessageDraft(event.target.value)} className="min-h-24 rounded-lg border border-input bg-background p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" required />
                {messageError && <p role="alert" className="text-xs text-destructive">{messageError}</p>}
                <div className="flex justify-end gap-2">
                  <button type="button" className="min-h-11 px-3 text-xs font-semibold" onClick={() => setMessageOpen(false)}>Cancel</button>
                  <Button type="submit" disabled={messageSending} className="min-h-11 bg-accent text-accent-foreground">{messageSending ? 'Sending…' : 'Send'}</Button>
                </div>
              </form>
            )}
          </Panel>
          <Panel className="p-4">
            <p className="eyebrow">Links</p>
            <div className="mt-3 flex flex-wrap gap-x-3 gap-y-2 text-xs">
              <ProfileLink label="Facebook" href={profile.facebookUrl} />
              <ProfileLink label="Instagram" href={profile.instagramUrl} />
              <ProfileLink label="Portfolio" href={profile.portfolioUrl} />
            </div>
            {ownProfile && !profile.facebookUrl && !profile.instagramUrl && !profile.portfolioUrl && (
              <button type="button" className="mt-2 min-h-11 text-xs font-semibold text-accent underline underline-offset-2" onClick={() => setEditing(true)}>Add your links</button>
            )}
          </Panel>
        </aside>
      </div>
    </div>
  )
}

function ProfileLink({ label, href }: { label: string; href: string | null }) {
  const safeUrl = safeExternalUrl(href)
  if (!safeUrl) return <span className="text-muted-foreground">{label}</span>
  return (
    <a href={safeUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 font-semibold text-accent underline-offset-2 hover:underline">
      {label}<ExternalLink className="size-3" aria-hidden="true" />
    </a>
  )
}

function AboutDetails({ profile, compact = false }: { profile: ProfileRecord; compact?: boolean }) {
  return (
    <Panel className="p-4">
      <p className="eyebrow">About</p>
      <p className={`mt-3 whitespace-pre-wrap break-words text-sm leading-6 ${compact ? 'line-clamp-4' : ''}`}>
        {profile.bio || 'This creator has not added a bio yet.'}
      </p>
      <dl className="mt-3 flex flex-col gap-2 text-xs leading-5 text-muted-foreground">
        <div><dt className="sr-only">Joined</dt><dd>Joined {new Date(profile.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</dd></div>
        <div><dt className="sr-only">Writes in</dt><dd>Writes in {profile.writingLanguages.length ? profile.writingLanguages.join(' · ') : '—'}</dd></div>
        <div><dt className="sr-only">Favorite genres</dt><dd>Favorite genres: {profile.favoriteGenres.length ? profile.favoriteGenres.join(' · ') : '—'}</dd></div>
      </dl>
      {!compact && profile.roles.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          {profile.roles.includes('writer') && <PenLine className="mr-1 inline size-3" aria-hidden="true" />}
          {profile.roles.includes('artist') && <Brush className="mr-1 inline size-3" aria-hidden="true" />}
          {profile.roles.map(roleLabel).join(' · ')}
        </p>
      )}
    </Panel>
  )
}
