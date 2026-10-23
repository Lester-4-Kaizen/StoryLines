import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { normalizeWorkLanguage, normalizeWritingLanguages } from '@/lib/work-taxonomy'
import type { Badge, CommunityPostType } from '@/lib/types'

export type ProfileRecord = {
  id: string
  displayName: string
  username: string
  avatarPath: string | null
  avatarUrl: string | null
  roles: Badge[]
  bio: string
  writingLanguages: string[]
  favoriteGenres: string[]
  facebookUrl: string | null
  instagramUrl: string | null
  portfolioUrl: string | null
  openForCollaboration: boolean
  collaborationRoles: string[]
  createdAt: string
}

export type ProfilePost = {
  id: string
  content: string
  type: CommunityPostType
  imageUrls: string[]
  tags: string[]
  lookingFor: string[]
  createdAt: string
  likes: number
  likedByMe: boolean
  savedByMe: boolean
  authorId?: string
  authorDisplayName?: string
  authorUsername?: string
  authorAvatarUrl?: string | null
}

export type ProfileWork = {
  id: string
  title: string
  type: 'story' | 'comic' | 'art'
  synopsis: string
  genre: string | null
  language: string | null
  status: 'Ongoing' | 'Complete'
  coverImageUrl: string | null
  createdAt: string
}

export type ProfileCursor = { createdAt: string; id: string }

export type ProfilePageData = {
  profile: ProfileRecord | null
  currentUserId: string | null
  isFollowing: boolean
  counts: { followers: number; following: number; works: number; posts: number }
  posts: ProfilePost[]
  postCursor: ProfileCursor | null
  likedPosts: ProfilePost[]
  likedCursor: ProfileCursor | null
  savedPosts: ProfilePost[]
  savedCursor: ProfileCursor | null
  works: ProfileWork[]
  workCursors: Record<ProfileWork['type'], ProfileCursor | null>
  error: string | null
}

const BADGES: Badge[] = ['reader', 'writer', 'artist']
const POST_TYPES: CommunityPostType[] = [
  'update',
  'recommendation',
  'work-in-progress',
  'collaborator',
  'feedback',
  'poll',
  'random',
]

function isBadge(role: string): role is Badge {
  return BADGES.some((badge) => badge === role)
}

function isCommunityPostType(type: string): type is CommunityPostType {
  return POST_TYPES.some((postType) => postType === type)
}

function hasFollowCounts(value: unknown): value is { followers: number; following: number } {
  return typeof value === 'object'
    && value !== null
    && 'followers' in value
    && 'following' in value
    && typeof value.followers === 'number'
    && typeof value.following === 'number'
}

function profileLoadError(error: unknown) {
  if (
    typeof error === 'object'
    && error !== null
    && 'code' in error
    && ['PGRST204', 'PGRST205', '42P01', '42883'].includes(String(error.code))
  ) {
    return 'Hindi pa naka-set up ang profile features. I-run ang profile page migration sa Supabase SQL Editor.'
  }
  return 'Hindi ma-load ang profile ngayon. Tingnan ang connection at subukan ulit.'
}

function profileLoadErrorDetails(error: unknown) {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack }
  }

  if (typeof error === 'object' && error !== null) {
    const getField = (field: string) => field in error ? Reflect.get(error, field) : undefined
    return {
      name: getField('name'),
      message: getField('message'),
      code: getField('code'),
      details: getField('details'),
      hint: getField('hint'),
    }
  }

  return { message: String(error) }
}

function emptyProfilePageData(error: string | null = null): ProfilePageData {
  return {
    profile: null,
    currentUserId: null,
    isFollowing: false,
    counts: { followers: 0, following: 0, works: 0, posts: 0 },
    posts: [],
    postCursor: null,
    likedPosts: [],
    likedCursor: null,
    savedPosts: [],
    savedCursor: null,
    works: [],
    workCursors: { story: null, comic: null, art: null },
    error,
  }
}

function mapProfile(profile: {
  id: string
  display_name: string
  username: string
  avatar_path: string | null
  avatar_url: string | null
  roles: string[] | null
  bio: string | null
  writing_languages: string[] | null
  favorite_genres: string[] | null
  facebook_url: string | null
  instagram_url: string | null
  portfolio_url: string | null
  open_for_collaboration: boolean | null
  collaboration_roles: string[] | null
  created_at: string
}): ProfileRecord {
  return {
    id: profile.id,
    displayName: profile.display_name,
    username: profile.username,
    avatarPath: profile.avatar_path,
    avatarUrl: profile.avatar_url,
    roles: (profile.roles ?? []).filter(isBadge),
    bio: profile.bio ?? '',
    writingLanguages: normalizeWritingLanguages(profile.writing_languages ?? []),
    favoriteGenres: profile.favorite_genres ?? [],
    facebookUrl: profile.facebook_url,
    instagramUrl: profile.instagram_url,
    portfolioUrl: profile.portfolio_url,
    openForCollaboration: profile.open_for_collaboration ?? false,
    collaborationRoles: profile.collaboration_roles ?? [],
    createdAt: profile.created_at,
  }
}

export async function getProfilePageData(profileId?: string): Promise<ProfilePageData> {
  if (!isSupabaseConfigured) {
    return emptyProfilePageData('Hindi pa naka-configure ang profile database.')
  }

  const supabase = await createSupabaseServerClient()
  try {
    const { data: userResult, error: userError } = await supabase.auth.getUser()
    if (userError) throw userError
    const currentUserId = userResult.user?.id ?? null
    const targetId = profileId ?? currentUserId
    if (!targetId) return { ...emptyProfilePageData(), currentUserId }

    const isOwnProfile = currentUserId === targetId
    const [profileResult, postsResult, storyWorksResult, comicWorksResult, artWorksResult, followCountsResult, postCountResult, workCountResult, likedActivityResult, savedActivityResult] =
      await Promise.all([
        supabase
          .from('profiles')
          .select('id, display_name, username, avatar_path, roles, bio, writing_languages, favorite_genres, facebook_url, instagram_url, portfolio_url, open_for_collaboration, collaboration_roles, created_at')
          .eq('id', targetId)
          .maybeSingle(),
        supabase
          .from('community_posts')
          .select('id, content, type, image_urls, tags, looking_for, created_at')
          .eq('author_id', targetId)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(10),
        supabase
          .from('creator_works')
          .select('id, title, type, synopsis, genre, language, status, cover_image_url, created_at')
          .eq('author_id', targetId)
          .eq('type', 'story')
          .neq('status', 'Draft')
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(10),
        supabase
          .from('creator_works')
          .select('id, title, type, synopsis, genre, language, status, cover_image_url, created_at')
          .eq('author_id', targetId)
          .eq('type', 'comic')
          .neq('status', 'Draft')
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(10),
        supabase
          .from('creator_works')
          .select('id, title, type, synopsis, genre, language, status, cover_image_url, created_at')
          .eq('author_id', targetId)
          .eq('type', 'art')
          .neq('status', 'Draft')
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(10),
        supabase.rpc('get_community_follow_counts', { profile_id: targetId }).maybeSingle(),
        supabase
          .from('community_posts')
          .select('id', { count: 'exact', head: true })
          .eq('author_id', targetId),
        supabase
          .from('creator_works')
          .select('id', { count: 'exact', head: true })
          .eq('author_id', targetId)
          .neq('status', 'Draft'),
        isOwnProfile
          ? supabase.from('community_post_likes').select('post_id, created_at').eq('user_id', targetId).order('created_at', { ascending: false }).order('post_id', { ascending: false }).limit(10)
          : Promise.resolve({ data: [], error: null }),
        isOwnProfile
          ? supabase.from('community_saved_posts').select('post_id, created_at').eq('user_id', targetId).order('created_at', { ascending: false }).order('post_id', { ascending: false }).limit(10)
          : Promise.resolve({ data: [], error: null }),
      ])

    if (profileResult.error) throw profileResult.error
    if (!profileResult.data) return { ...emptyProfilePageData('Hindi makita ang profile na ito.'), currentUserId }
    if (postsResult.error) throw postsResult.error
    if (storyWorksResult.error) throw storyWorksResult.error
    if (comicWorksResult.error) throw comicWorksResult.error
    if (artWorksResult.error) throw artWorksResult.error
    if (followCountsResult.error) throw followCountsResult.error
    if (postCountResult.error) throw postCountResult.error
    if (workCountResult.error) throw workCountResult.error
    if (likedActivityResult.error) throw likedActivityResult.error
    if (savedActivityResult.error) throw savedActivityResult.error
    const followCounts = followCountsResult.data
    if (!hasFollowCounts(followCounts)) {
      throw new Error('Hindi ma-load ang follower counts. Subukan ulit.')
    }

    const profile = mapProfile({
      ...profileResult.data,
      avatar_path: profileResult.data.avatar_path,
      avatar_url: profileResult.data.avatar_path
        ? supabase.storage.from('avatars').getPublicUrl(profileResult.data.avatar_path).data.publicUrl
        : null,
    })
    const postRows = postsResult.data ?? []
    const storyRows = storyWorksResult.data ?? []
    const comicRows = comicWorksResult.data ?? []
    const artRows = artWorksResult.data ?? []
    const postIds = postRows.map((post) => post.id)
    const likedActivityRows = likedActivityResult.data ?? []
    const savedActivityRows = savedActivityResult.data ?? []
    const likedActivityIds = likedActivityRows.map((row) => row.post_id)
    const savedActivityIds = savedActivityRows.map((row) => row.post_id)
    const activityIds = Array.from(new Set([...likedActivityIds, ...savedActivityIds]))
    const allPostIds = Array.from(new Set([...postIds, ...activityIds]))
    const [likesResult, likedResult, savedResult, followResult, activityRowsResult] = await Promise.all([
      allPostIds.length
        ? supabase.rpc('get_community_post_like_counts', { post_ids: allPostIds })
        : Promise.resolve({ data: [], error: null }),
      currentUserId && postIds.length
        ? supabase.from('community_post_likes').select('post_id').eq('user_id', currentUserId).in('post_id', postIds)
        : Promise.resolve({ data: [], error: null }),
      currentUserId && postIds.length
        ? supabase.from('community_saved_posts').select('post_id').eq('user_id', currentUserId).in('post_id', postIds)
        : Promise.resolve({ data: [], error: null }),
      currentUserId && currentUserId !== targetId
        ? supabase
          .from('community_follows')
          .select('creator_id')
          .eq('follower_id', currentUserId)
          .eq('creator_id', targetId)
          .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      activityIds.length
        ? supabase.from('community_posts')
          .select('id, author_id, author_role, type, content, image_urls, tags, looking_for, created_at')
          .in('id', activityIds)
        : Promise.resolve({ data: [], error: null }),
    ])
    if (likesResult.error) throw likesResult.error
    if (likedResult.error) throw likedResult.error
    if (savedResult.error) throw savedResult.error
    if (followResult.error) throw followResult.error
    if (activityRowsResult.error) throw activityRowsResult.error

    const activityRows = activityRowsResult.data ?? []
    const activityAuthorIds = Array.from(new Set(activityRows.map((post) => post.author_id)))
    const { data: activityAuthors, error: activityAuthorsError } = activityAuthorIds.length
      ? await supabase.from('profiles').select('id, display_name, username, avatar_path').in('id', activityAuthorIds)
      : { data: [], error: null }
    if (activityAuthorsError) throw activityAuthorsError

    const likesByPost = new Map<string, number>()
    for (const like of likesResult.data ?? []) {
      likesByPost.set(like.post_id, Number(like.like_count))
    }
    const likedPostIds = new Set([...likedActivityIds, ...(likedResult.data ?? []).map((like) => like.post_id)])
    const savedPostIds = new Set([...savedActivityIds, ...(savedResult.data ?? []).map((saved) => saved.post_id)])
    const posts: ProfilePost[] = postRows.map((post) => {
      const likes = likesByPost.get(post.id)
      return {
        id: post.id,
        authorId: targetId,
        content: post.content,
        type: isCommunityPostType(post.type) ? post.type : 'update',
        imageUrls: post.image_urls ?? [],
        tags: post.tags ?? [],
        lookingFor: post.looking_for ?? [],
        createdAt: post.created_at,
        likes: likesByPost.get(post.id) ?? 0,
        likedByMe: likedPostIds.has(post.id),
        savedByMe: savedPostIds.has(post.id),
        authorAvatarUrl: profile.avatarUrl,
      }
    })
    const activityAuthorById = new Map((activityAuthors ?? []).map((author) => [author.id, author]))
    const activityPosts: ProfilePost[] = activityRows.map((post) => {
      const author = activityAuthorById.get(post.author_id)
      return {
        id: post.id,
        content: post.content,
        type: isCommunityPostType(post.type) ? post.type : 'update',
        imageUrls: post.image_urls ?? [],
        tags: post.tags ?? [],
        lookingFor: post.looking_for ?? [],
        createdAt: post.created_at,
        likes: likesByPost.get(post.id) ?? 0,
        likedByMe: likedPostIds.has(post.id),
        savedByMe: savedPostIds.has(post.id),
        authorId: post.author_id,
        authorDisplayName: author?.display_name ?? 'StoryLines creator',
        authorUsername: author?.username ?? '',
        authorAvatarUrl: author?.avatar_path
          ? supabase.storage.from('avatars').getPublicUrl(author.avatar_path).data.publicUrl
          : null,
      }
    })
    const works: ProfileWork[] = [...storyRows, ...comicRows, ...artRows].map((work) => ({
      id: work.id,
      title: work.title,
      type: work.type === 'comic' || work.type === 'art' ? work.type : 'story',
      synopsis: work.synopsis ?? '',
      genre: work.genre,
      language: work.language ? normalizeWorkLanguage(work.language) : null,
      status: work.status === 'Complete' ? 'Complete' : 'Ongoing',
      coverImageUrl: work.cover_image_url,
      createdAt: work.created_at,
    }))

    return {
      profile,
      currentUserId,
      isFollowing: Boolean(followResult.data),
      counts: {
        followers: followCounts.followers,
        following: followCounts.following,
        works: workCountResult.count ?? 0,
        posts: postCountResult.count ?? 0,
      },
      posts,
      postCursor: postRows.length === 10 ? { createdAt: postRows[9].created_at, id: postRows[9].id } : null,
      likedPosts: likedActivityIds.flatMap((id) => {
        const post = activityPosts.find((item) => item.id === id)
        return post ? [post] : []
      }),
      likedCursor: likedActivityRows.length === 10 ? { createdAt: likedActivityRows[9].created_at, id: likedActivityRows[9].post_id } : null,
      savedPosts: savedActivityIds.flatMap((id) => {
        const post = activityPosts.find((item) => item.id === id)
        return post ? [post] : []
      }),
      savedCursor: savedActivityRows.length === 10 ? { createdAt: savedActivityRows[9].created_at, id: savedActivityRows[9].post_id } : null,
      works,
      workCursors: {
        story: storyRows.length === 10 ? { createdAt: storyRows[9].created_at, id: storyRows[9].id } : null,
        comic: comicRows.length === 10 ? { createdAt: comicRows[9].created_at, id: comicRows[9].id } : null,
        art: artRows.length === 10 ? { createdAt: artRows[9].created_at, id: artRows[9].id } : null,
      },
      error: null,
    }
  } catch (error) {
    console.error('Failed to load profile data', profileLoadErrorDetails(error))
    return emptyProfilePageData(profileLoadError(error))
  }
}
