export type Badge = 'reader' | 'writer' | 'artist'

export type Route =
  | '/'
  | '/community'
  | '/browse'
  | '/ranking'
  | '/library'
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
  type: 'story' | 'comic'
  authorId: string
  synopsis?: string
  genre?: string
  language?: string
  rating?: string
  status: 'Draft' | 'Ongoing' | 'Complete'
  // Story-specific — the chapter text captured in the Story editor.
  chapterTitle?: string
  chapterBody?: string
  // Comic-specific — how many pages were selected. There's no real file
  // storage yet, so actual page images aren't persisted, just the count.
  pageCount?: number
  createdAt: number
  // Set when a Work is published out of the collaboration workspace —
  // the joint credit described in the project plan ("Publish as joint
  // Work"). Undefined for solo works.
  coCreatorId?: string
  coCreatorRole?: 'writer' | 'artist'
}

export type CommunityPostType =
  | 'update'
  | 'recommendation'
  | 'work-in-progress'
  | 'collaborator'
  | 'feedback'
  | 'poll'

export type Post = {
  id: string
  authorName?: string
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
}

export const badgeLabels: Record<Badge, string> = { reader: 'Reader', writer: 'Writer', artist: 'Artist' }