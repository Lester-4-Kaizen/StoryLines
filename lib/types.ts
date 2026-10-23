export type Badge = 'reader' | 'writer' | 'artist'

export type Route =
  | '/'
  | '/community'
  | '/browse'
  | '/ranking'
  | '/library'
  | '/messages'
  | '/updates'
  | '/collaborate'
  | '/profile'
  | '/settings'
  | '/create'
  | '/create/works'
  | '/create/works/new'
  | '/create/works/new/story'
  | '/create/works/new/story/editor'
  | '/create/works/new/comic'
  | '/create/works/new/comic/editor'
  | '/create/works/analytics'
  | '/create/portfolio'
  | '/create/collaborate'

export type Work = {
  id: string
  title: string
  type: 'story' | 'comic' | 'art'
  authorId: string
  synopsis?: string
  authorName?: string
  genre?: string
  moods?: string[]
  language?: string
  rating?: string
  coverImageUrl?: string
  status: 'Draft' | 'Ongoing' | 'Complete'
  // Story-specific — the chapter text captured in the Story editor.
  chapterTitle?: string
  chapterBody?: string
  chapters?: { number: number; title: string; body: string; authorNote?: string }[]
  contentWarnings?: string[]
  authorNote?: string
  comicReadingDirection?: 'vertical' | 'page' | 'rtl'
  comicReaderBackground?: 'dark' | 'light' | 'paper'
  comicPageSpacing?: 'none' | 'small' | 'large'
  comicPages?: ComicPage[]
  createdAt: number
  // Set when a Work is published out of the collaboration workspace —
  // the joint credit described in the project plan ("Publish as joint
  // Work"). Undefined for solo works.
  coCreatorId?: string
  coCreatorRole?: 'writer' | 'artist'
}

export type ComicPage = {
  id?: string
  imageId: string
  imageUrl: string
  altText: string
  transcript: string
}

export type CommunityPostType =
  | 'update'
  | 'recommendation'
  | 'work-in-progress'
  | 'collaborator'
  | 'feedback'
  | 'poll'
  | 'random'

export type Post = {
  id: string
  authorId?: string
  authorName?: string
  authorUsername?: string
  authorAvatarUrl?: string | null
  authorRole: 'writer' | 'artist'
  type?: CommunityPostType
  content: string
  imageUrl?: string
  imageUrls?: string[]
  tags?: string[]
  lookingFor?: string[]
  createdAt: number
  likes: number
  likedByMe: boolean
  commentsCount?: number
}

export type CommunityComment = {
  id: string
  postId: string
  authorId: string
  authorName: string
  authorUsername?: string
  authorAvatarUrl?: string | null
  parentCommentId?: string | null
  likes?: number
  dislikes?: number
  myReaction?: 'like' | 'dislike' | null
  content: string
  createdAt: number
}

export type CommunityAuthor = {
  id: string
  displayName: string
  username: string
  avatarUrl?: string | null
  roles: Badge[]
}

export const badgeLabels: Record<Badge, string> = { reader: 'Reader', writer: 'Writer', artist: 'Artist' }