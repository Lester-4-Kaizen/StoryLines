'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import {
  Bell,
  BellOff,
  BookOpen,
  Brush,
  Heart,
  MessageCircle,
  Megaphone,
  MessageSquare,
  ShieldAlert,
  UsersRound,
  UserPlus,
} from 'lucide-react'
import { Panel } from '@/components/shared/panel'
import { ProfileAvatar } from '@/components/shared/profile-avatar'
import { useAppState } from '@/lib/app-state'
import { getSupabaseClient } from '@/lib/supabase'

type UpdatesTab = 'authors' | 'activity'
type AuthorFilter = 'all' | 'new-chapters' | 'new-stories' | 'new-comics' | 'announcements' | 'completed'
type ActivityFilter = 'all' | 'likes' | 'comments' | 'follows' | 'collaboration' | 'mentions' | 'moderation'
type ActivityKind = 'follow' | 'post_like' | 'comment' | 'comment_reply' | 'comment_reaction' | 'mention' | 'collaboration_proposal' | 'moderation_outcome'
type UpdateKind = 'new-chapters' | 'new-stories' | 'new-comics' | 'announcements' | 'completed'

type Notification = {
  id: string
  actor_id: string
  kind: ActivityKind
  post_id: string | null
  comment_id: string | null
  proposal_id: string | null
  created_at: string
  read_at: string | null
  actorName: string
  actorUsername: string
  actorAvatarUrl: string | null
  postContent?: string
  commentContent?: string
  proposalTitle?: string
  moderationMessage?: string | null
}

type ActivityEntry = {
  id: string
  kind: ActivityKind
  actorIds: string[]
  actorNames: string[]
  actorAvatarUrl: string | null
  post_id: string | null
  comment_id: string | null
  proposal_id: string | null
  created_at: string
  notificationIds: string[]
  unread: boolean
  postContent?: string
  commentContent?: string
  proposalTitle?: string
  moderationMessage?: string | null
}

type FollowedUpdate = {
  id: string
  key: string
  kind: UpdateKind
  authorId: string
  authorName: string
  authorUsername: string
  authorAvatarUrl: string | null
  workId?: string
  title: string
  detail: string
  body?: string
  coverImageUrl: string | null
  createdAt: string
  chapterNumber?: number
  pageNumber?: number
  seen: boolean
}

type FollowedAuthor = {
  id: string
  displayName: string
  username: string
  avatarUrl: string | null
}

const NOTIFICATION_PAGE_SIZE = 50
const UPDATE_LIMIT = 100

function updateTypeLabel(kind: FollowedUpdate['kind']) {
  if (kind === 'new-chapters') return 'New chapter'
  if (kind === 'new-stories') return 'New story'
  if (kind === 'new-comics') return 'New comic episode'
  if (kind === 'announcements') return 'Announcement'
  if (kind === 'completed') return 'Completed'
  return 'Announcement'
}

function timeAgo(dateValue: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(dateValue).getTime()) / 60_000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return days === 1 ? 'yesterday' : `${days}d ago`
}

function groupAuthorUpdates(updates: FollowedUpdate[]) {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const weekStart = new Date(todayStart)
  weekStart.setDate(weekStart.getDate() - 6)
  return {
    today: updates.filter((update) => new Date(update.createdAt) >= todayStart),
    thisWeek: updates.filter((update) => {
      const date = new Date(update.createdAt)
      return date < todayStart && date >= weekStart
    }),
  }
}

function groupActivity(entries: ActivityEntry[]) {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  return {
    today: entries.filter((entry) => new Date(entry.created_at) >= todayStart),
    earlier: entries.filter((entry) => new Date(entry.created_at) < todayStart),
  }
}

function activityFilterKind(kind: ActivityKind): ActivityFilter {
  if (kind === 'post_like' || kind === 'comment_reaction') return 'likes'
  if (kind === 'comment' || kind === 'comment_reply') return 'comments'
  if (kind === 'follow') return 'follows'
  if (kind === 'collaboration_proposal') return 'collaboration'
  if (kind === 'moderation_outcome') return 'moderation'
  return 'mentions'
}

function activityText(entry: ActivityEntry) {
  if (entry.kind === 'moderation_outcome') return entry.moderationMessage ?? 'The moderation team reviewed a report about your account or content.'
  if (entry.kind === 'follow') return 'followed you.'
  if (entry.kind === 'post_like') {
    const others = entry.actorNames.length - 1
    return others > 0 ? `and ${others} ${others === 1 ? 'other' : 'others'} liked your post.` : 'liked your post.'
  }
  if (entry.kind === 'comment') return 'commented on your post.'
  if (entry.kind === 'comment_reply') return 'replied to your comment.'
  if (entry.kind === 'comment_reaction') return 'reacted to your comment.'
  if (entry.kind === 'mention') return 'mentioned you in a post.'
  return 'sent you a collaboration proposal.'
}

function activityIcon(kind: ActivityKind) {
  if (kind === 'moderation_outcome') return <ShieldAlert className="size-4" />
  if (kind === 'follow') return <UserPlus className="size-4" />
  if (kind === 'post_like' || kind === 'comment_reaction') return <Heart className="size-4" />
  if (kind === 'collaboration_proposal') return <UsersRound className="size-4" />
  if (kind === 'mention') return <MessageSquare className="size-4" />
  return <MessageCircle className="size-4" />
}

function updateHref(update: FollowedUpdate) {
  if (!update.workId) return `/community#post-${update.id}`
  if (update.kind === 'new-chapters' && update.chapterNumber) {
    return `/works/${encodeURIComponent(update.workId)}?chapter=${update.chapterNumber}`
  }
  if (update.kind === 'new-comics' && update.pageNumber) {
    return `/works/${encodeURIComponent(update.workId)}?page=${update.pageNumber}`
  }
  return `/works/${encodeURIComponent(update.workId)}`
}

export function UpdatesView() {
  const router = useRouter()
  const { isLoggedIn, currentUserId, requireAuth } = useAppState()
  const [tab, setTab] = useState<UpdatesTab>('authors')
  const [authorFilter, setAuthorFilter] = useState<AuthorFilter>('all')
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all')
  const [authorUpdates, setAuthorUpdates] = useState<FollowedUpdate[]>([])
  const [followedAuthors, setFollowedAuthors] = useState<FollowedAuthor[]>([])
  const [mutedAuthorIds, setMutedAuthorIds] = useState<Set<string>>(new Set())
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set())
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0)
  const [hasMoreNotifications, setHasMoreNotifications] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [activityLoading, setActivityLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadVersion, setReloadVersion] = useState(0)

  useEffect(() => {
    if (!currentUserId) {
      setAuthorUpdates([])
      setFollowedAuthors([])
      setMutedAuthorIds(new Set())
      setLoading(false)
      return
    }
    let active = true
    setLoading(true)
    setError(null)
    void (async () => {
      const supabase = getSupabaseClient()
      const { data: follows, error: followsError } = await supabase
        .from('community_follows')
        .select('creator_id')
        .eq('follower_id', currentUserId)
      if (followsError) throw followsError
      const authorIds = (follows ?? []).map((follow) => follow.creator_id)
      if (!authorIds.length) {
        if (active) {
          setAuthorUpdates([])
          setFollowedAuthors([])
          setMutedAuthorIds(new Set())
        }
        return
      }
      const [profilesResult, worksResult, mutesResult, readsResult] = await Promise.all([
        supabase.from('profiles').select('id, display_name, username, avatar_path').in('id', authorIds),
        supabase
          .from('creator_works')
          .select('id, author_id, title, type, status, synopsis, cover_image_url, created_at, updated_at')
          .in('author_id', authorIds)
          .neq('status', 'Draft')
          .order('updated_at', { ascending: false })
          .limit(UPDATE_LIMIT),
        supabase.from('community_update_author_mutes').select('author_id').eq('user_id', currentUserId),
        supabase.from('community_followed_update_reads').select('update_key').eq('user_id', currentUserId).limit(1000),
      ])
      if (profilesResult.error) throw profilesResult.error
      if (worksResult.error) throw worksResult.error
      if (mutesResult.error) throw mutesResult.error
      if (readsResult.error) throw readsResult.error
      const profileById = new Map((profilesResult.data ?? []).map((profile) => [profile.id, {
        id: profile.id,
        displayName: profile.display_name,
        username: profile.username,
        avatarUrl: profile.avatar_path
          ? supabase.storage.from('avatars').getPublicUrl(profile.avatar_path).data.publicUrl
          : null,
      } satisfies FollowedAuthor]))
      const workRows = worksResult.data ?? []
      const workIds = workRows.map((work) => work.id)
      const [chaptersResult, pagesResult, announcementsResult] = await Promise.all([
        workIds.length
          ? supabase.from('creator_work_chapters')
            .select('id, work_id, chapter_number, title, updated_at')
            .in('work_id', workIds)
            .eq('is_published', true)
            .order('updated_at', { ascending: false })
            .limit(UPDATE_LIMIT)
          : Promise.resolve({ data: [], error: null }),
        workIds.length
          ? supabase.from('creator_comic_pages')
            .select('id, work_id, page_number, updated_at')
            .in('work_id', workIds)
            .eq('is_published', true)
            .order('updated_at', { ascending: false })
            .limit(UPDATE_LIMIT)
          : Promise.resolve({ data: [], error: null }),
        supabase.from('community_posts')
          .select('id, author_id, content, created_at')
          .in('author_id', authorIds)
          .eq('type', 'update')
          .order('created_at', { ascending: false })
          .limit(UPDATE_LIMIT),
      ])
      if (chaptersResult.error) throw chaptersResult.error
      if (pagesResult.error) throw pagesResult.error
      if (announcementsResult.error) throw announcementsResult.error
      if (!active) return

      const readKeys = new Set((readsResult.data ?? []).map((row) => row.update_key))
      const muteIds = new Set((mutesResult.data ?? []).map((row) => row.author_id))
      const updates: FollowedUpdate[] = []
      const addUpdate = (update: Omit<FollowedUpdate, 'seen' | 'authorName' | 'authorUsername' | 'authorAvatarUrl'>) => {
        const author = profileById.get(update.authorId)
        if (!author) return
        updates.push({
          ...update,
          authorName: author.displayName,
          authorUsername: author.username,
          authorAvatarUrl: author.avatarUrl,
          seen: readKeys.has(update.key),
        })
      }
      const publishedChapterCounts = new Map<string, number>()
      for (const chapter of chaptersResult.data ?? []) {
        publishedChapterCounts.set(chapter.work_id, (publishedChapterCounts.get(chapter.work_id) ?? 0) + 1)
      }
      const latestChapterByWork = new Map<string, (typeof chaptersResult.data)[number]>()
      for (const chapter of chaptersResult.data ?? []) {
        if (!latestChapterByWork.has(chapter.work_id)) latestChapterByWork.set(chapter.work_id, chapter)
      }
      const latestPageByWork = new Map<string, (typeof pagesResult.data)[number]>()
      for (const page of pagesResult.data ?? []) {
        if (!latestPageByWork.has(page.work_id)) latestPageByWork.set(page.work_id, page)
      }
      for (const work of workRows) {
        if (work.type === 'story') {
          if (work.status === 'Complete') {
            addUpdate({
              id: `complete-${work.id}`,
              key: `complete:${work.id}`,
              kind: 'completed',
              authorId: work.author_id,
              workId: work.id,
              title: work.title,
              detail: `Completed · ${publishedChapterCounts.get(work.id) ?? 0} chapters`,
              coverImageUrl: work.cover_image_url,
              createdAt: work.updated_at,
            })
          } else {
            addUpdate({
              id: `story-${work.id}`,
              key: `story:${work.id}`,
              kind: 'new-stories',
              authorId: work.author_id,
              workId: work.id,
              title: work.title,
              detail: work.synopsis || 'A new story from an author you follow.',
              coverImageUrl: work.cover_image_url,
              createdAt: work.created_at,
            })
          }
          const chapter = latestChapterByWork.get(work.id)
          if (chapter) {
            addUpdate({
              id: `chapter-${chapter.id}`,
              key: `chapter:${chapter.id}`,
              kind: 'new-chapters',
              authorId: work.author_id,
              workId: work.id,
              title: work.title,
              detail: `Chapter ${chapter.chapter_number}${chapter.title ? `: ${chapter.title}` : ''}`,
              coverImageUrl: work.cover_image_url,
              createdAt: chapter.updated_at,
              chapterNumber: chapter.chapter_number,
            })
          }
        } else if (work.type === 'comic') {
          const page = latestPageByWork.get(work.id)
          if (page) {
            addUpdate({
              id: `comic-${page.id}`,
              key: `comic:${page.id}`,
              kind: 'new-comics',
              authorId: work.author_id,
              workId: work.id,
              title: work.title,
              detail: `Latest episode · Page ${page.page_number}`,
              coverImageUrl: work.cover_image_url,
              createdAt: page.updated_at,
              pageNumber: page.page_number,
            })
          } else {
            addUpdate({
              id: `comic-${work.id}`,
              key: `comic:${work.id}`,
              kind: 'new-comics',
              authorId: work.author_id,
              workId: work.id,
              title: work.title,
              detail: 'A new comic from an author you follow.',
              coverImageUrl: work.cover_image_url,
              createdAt: work.updated_at,
            })
          }
        }
      }
      for (const announcement of announcementsResult.data ?? []) {
        addUpdate({
          id: `announcement-${announcement.id}`,
          key: `announcement:${announcement.id}`,
          kind: 'announcements',
          authorId: announcement.author_id,
          title: 'Author announcement',
          detail: 'Shared an announcement',
          body: announcement.content,
          coverImageUrl: null,
          createdAt: announcement.created_at,
        })
      }
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
      setAuthorUpdates(updates
        .filter((update) => new Date(update.createdAt).getTime() >= weekAgo && !muteIds.has(update.authorId))
        .sort((first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime()))
      setFollowedAuthors(Array.from(profileById.values()).sort((a, b) => a.displayName.localeCompare(b.displayName)))
      setMutedAuthorIds(muteIds)
    })().catch((loadError: unknown) => {
      if (active) setError(loadError instanceof Error ? loadError.message : 'Could not load updates from authors you follow.')
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => {
      active = false
    }
  }, [currentUserId, reloadVersion])

  useEffect(() => {
    if (!currentUserId) {
      setNotifications([])
      setFollowingIds(new Set())
      setUnreadNotificationCount(0)
      setHasMoreNotifications(false)
      setActivityLoading(false)
      return
    }
    let active = true
    setActivityLoading(true)
    setError(null)
    void (async () => {
      const supabase = getSupabaseClient()
      const [notificationsResult, unreadCountResult, followingResult] = await Promise.all([
        supabase.from('user_notifications')
          .select('id, actor_id, kind, post_id, comment_id, proposal_id, moderation_message, created_at, read_at')
          .eq('recipient_id', currentUserId)
          .neq('kind', 'message')
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(NOTIFICATION_PAGE_SIZE),
        supabase.from('user_notifications')
          .select('id', { count: 'exact', head: true })
          .eq('recipient_id', currentUserId)
          .neq('kind', 'message')
          .is('read_at', null),
        supabase.from('community_follows').select('creator_id').eq('follower_id', currentUserId),
      ])
      if (notificationsResult.error) throw notificationsResult.error
      if (unreadCountResult.error) throw unreadCountResult.error
      if (followingResult.error) throw followingResult.error
      const rows = (notificationsResult.data ?? []).filter((row): row is typeof row & { kind: ActivityKind } => (
        ['follow', 'post_like', 'comment', 'comment_reply', 'comment_reaction', 'mention', 'collaboration_proposal', 'moderation_outcome'].includes(row.kind)
      ))
      const actorIds = Array.from(new Set(rows.map((row) => row.actor_id)))
      const postIds = Array.from(new Set(rows.map((row) => row.post_id).filter((id): id is string => Boolean(id))))
      const commentIds = Array.from(new Set(rows.map((row) => row.comment_id).filter((id): id is string => Boolean(id))))
      const proposalIds = Array.from(new Set(rows.map((row) => row.proposal_id).filter((id): id is string => Boolean(id))))
      const [profilesResult, postsResult, commentsResult, proposalsResult] = await Promise.all([
        actorIds.length ? supabase.from('profiles').select('id, display_name, username, avatar_path').in('id', actorIds) : Promise.resolve({ data: [], error: null }),
        postIds.length ? supabase.from('community_posts').select('id, content').in('id', postIds) : Promise.resolve({ data: [], error: null }),
        commentIds.length ? supabase.from('community_post_comments').select('id, content').in('id', commentIds) : Promise.resolve({ data: [], error: null }),
        proposalIds.length ? supabase.from('collaboration_requests').select('id, title').in('id', proposalIds) : Promise.resolve({ data: [], error: null }),
      ])
      if (profilesResult.error) throw profilesResult.error
      if (postsResult.error) throw postsResult.error
      if (commentsResult.error) throw commentsResult.error
      if (proposalsResult.error) throw proposalsResult.error
      if (!active) return
      const profilesById = new Map((profilesResult.data ?? []).map((profile) => [profile.id, profile]))
      const postsById = new Map((postsResult.data ?? []).map((post) => [post.id, post.content]))
      const commentsById = new Map((commentsResult.data ?? []).map((comment) => [comment.id, comment.content]))
      const proposalsById = new Map((proposalsResult.data ?? []).map((proposal) => [proposal.id, proposal.title]))
      setNotifications(rows.map((row) => {
        const actor = profilesById.get(row.actor_id)
        return {
          id: row.id,
          actor_id: row.actor_id,
          kind: row.kind,
          post_id: row.post_id,
          comment_id: row.comment_id,
          proposal_id: row.proposal_id,
          created_at: row.created_at,
          read_at: row.read_at,
          actorName: actor?.display_name ?? 'StoryLines member',
          actorUsername: actor?.username ?? '',
          actorAvatarUrl: actor?.avatar_path
            ? supabase.storage.from('avatars').getPublicUrl(actor.avatar_path).data.publicUrl
            : null,
          postContent: row.post_id ? postsById.get(row.post_id) : undefined,
          commentContent: row.comment_id ? commentsById.get(row.comment_id) : undefined,
          proposalTitle: row.proposal_id ? proposalsById.get(row.proposal_id) : undefined,
          moderationMessage: row.moderation_message,
        }
      }))
      setFollowingIds(new Set((followingResult.data ?? []).map((follow) => follow.creator_id)))
      setUnreadNotificationCount(unreadCountResult.count ?? 0)
      setHasMoreNotifications((notificationsResult.data?.length ?? 0) === NOTIFICATION_PAGE_SIZE)
    })().catch((loadError: unknown) => {
      if (active) setError(loadError instanceof Error ? loadError.message : 'Could not load your activity.')
    }).finally(() => {
      if (active) setActivityLoading(false)
    })
    return () => {
      active = false
    }
  }, [currentUserId, reloadVersion])

  useEffect(() => {
    const markEveryUpdateRead = () => {
      const now = new Date().toISOString()
      setAuthorUpdates((current) => current.map((update) => ({ ...update, seen: true })))
      setNotifications((current) => current.map((notification) => ({
        ...notification,
        read_at: notification.read_at ?? now,
      })))
      setUnreadNotificationCount(0)
    }
    window.addEventListener('storylines:all-notifications-read', markEveryUpdateRead)
    return () => window.removeEventListener('storylines:all-notifications-read', markEveryUpdateRead)
  }, [])

  const visibleUpdates = useMemo(() => authorFilter === 'all'
    ? authorUpdates
    : authorUpdates.filter((update) => update.kind === authorFilter), [authorFilter, authorUpdates])

  const activityEntries = useMemo(() => {
    const entries: ActivityEntry[] = []
    const likesByPost = new Map<string, ActivityEntry>()
    for (const notification of notifications) {
      if (notification.kind === 'post_like' && notification.post_id) {
        const existing = likesByPost.get(notification.post_id)
        if (existing) {
          existing.actorIds.push(notification.actor_id)
          existing.actorNames.push(notification.actorName)
          existing.notificationIds.push(notification.id)
          existing.unread ||= !notification.read_at
          if (new Date(notification.created_at) > new Date(existing.created_at)) existing.created_at = notification.created_at
        } else {
          const entry: ActivityEntry = {
            id: notification.id,
            kind: notification.kind,
            actorIds: [notification.actor_id],
            actorNames: [notification.actorName],
            actorAvatarUrl: notification.actorAvatarUrl,
            post_id: notification.post_id,
            comment_id: notification.comment_id,
            proposal_id: notification.proposal_id,
            created_at: notification.created_at,
            notificationIds: [notification.id],
            unread: !notification.read_at,
            postContent: notification.postContent,
            commentContent: notification.commentContent,
            proposalTitle: notification.proposalTitle,
              moderationMessage: notification.moderationMessage,
          }
          likesByPost.set(notification.post_id, entry)
          entries.push(entry)
        }
      } else {
        entries.push({
          id: notification.id,
          kind: notification.kind,
          actorIds: [notification.actor_id],
          actorNames: [notification.actorName],
          actorAvatarUrl: notification.actorAvatarUrl,
          post_id: notification.post_id,
          comment_id: notification.comment_id,
          proposal_id: notification.proposal_id,
          created_at: notification.created_at,
          notificationIds: [notification.id],
          unread: !notification.read_at,
          postContent: notification.postContent,
          commentContent: notification.commentContent,
          proposalTitle: notification.proposalTitle,
          moderationMessage: notification.moderationMessage,
        })
      }
    }
    return entries
      .filter((entry) => activityFilter === 'all' || activityFilterKind(entry.kind) === activityFilter)
      .sort((first, second) => new Date(second.created_at).getTime() - new Date(first.created_at).getTime())
  }, [activityFilter, notifications])

  const groupedUpdates = useMemo(() => groupAuthorUpdates(visibleUpdates), [visibleUpdates])
  const groupedActivity = useMemo(() => groupActivity(activityEntries), [activityEntries])
  const unreadUpdates = authorUpdates.filter((update) => !update.seen)

  const markUpdatesSeen = async () => {
    if (!currentUserId || !unreadUpdates.length || saving) return
    setSaving(true)
    setError(null)
    try {
      const now = new Date().toISOString()
      const rows = unreadUpdates.map((update) => ({ user_id: currentUserId, update_key: update.key, seen_at: now }))
      const { error: updateError } = await getSupabaseClient()
        .from('community_followed_update_reads')
        .upsert(rows, { onConflict: 'user_id,update_key' })
      if (updateError) throw updateError
      setAuthorUpdates((current) => current.map((update) => ({ ...update, seen: true })))
    } catch (markError) {
      setError(markError instanceof Error ? markError.message : 'Could not mark updates as seen.')
    } finally {
      setSaving(false)
    }
  }

  const toggleAuthorMute = async (authorId: string) => {
    if (!currentUserId || saving) return
    const isMuted = mutedAuthorIds.has(authorId)
    setSaving(true)
    setError(null)
    try {
      const supabase = getSupabaseClient()
      const result = isMuted
        ? await supabase.from('community_update_author_mutes').delete().eq('user_id', currentUserId).eq('author_id', authorId)
        : await supabase.from('community_update_author_mutes').insert({ user_id: currentUserId, author_id: authorId })
      if (result.error) throw result.error
      setMutedAuthorIds((current) => {
        const next = new Set(current)
        if (isMuted) next.delete(authorId)
        else next.add(authorId)
        return next
      })
      if (!isMuted) setAuthorUpdates((current) => current.filter((update) => update.authorId !== authorId))
      else setReloadVersion((version) => version + 1)
    } catch (muteError) {
      setError(muteError instanceof Error ? muteError.message : 'Could not update this author’s mute setting.')
    } finally {
      setSaving(false)
    }
  }

  const markAllActivityRead = async () => {
    if (!currentUserId || !unreadNotificationCount || saving) return
    setSaving(true)
    setError(null)
    try {
      const now = new Date().toISOString()
      const { error: updateError } = await getSupabaseClient()
        .from('user_notifications')
        .update({ read_at: now })
        .eq('recipient_id', currentUserId)
        .neq('kind', 'message')
        .is('read_at', null)
      if (updateError) throw updateError
      setNotifications((current) => current.map((notification) => ({ ...notification, read_at: notification.read_at ?? now })))
      setUnreadNotificationCount(0)
      window.dispatchEvent(new Event('storylines:notifications-updated'))
    } catch (markError) {
      setError(markError instanceof Error ? markError.message : 'Could not mark activity as read.')
    } finally {
      setSaving(false)
    }
  }

  const markEntryRead = async (entry: ActivityEntry) => {
    const unreadIds = entry.notificationIds.filter((id) => notifications.some((notification) => notification.id === id && !notification.read_at))
    if (!currentUserId || !unreadIds.length) return
    const now = new Date().toISOString()
    const { error: updateError } = await getSupabaseClient()
      .from('user_notifications')
      .update({ read_at: now })
      .in('id', unreadIds)
      .eq('recipient_id', currentUserId)
    if (updateError) {
      setError(updateError.message)
      return
    }
    setNotifications((current) => current.map((notification) => unreadIds.includes(notification.id)
      ? { ...notification, read_at: now }
      : notification))
    setUnreadNotificationCount((count) => Math.max(0, count - unreadIds.length))
    window.dispatchEvent(new Event('storylines:notifications-updated'))
  }

  const openEntry = async (entry: ActivityEntry) => {
    await markEntryRead(entry)
    if (entry.kind === 'moderation_outcome') return
    if (entry.kind === 'follow' || entry.kind === 'post_like') {
      router.push(entry.kind === 'follow'
        ? `/profile/${encodeURIComponent(entry.actorIds[0])}`
        : `/community#post-${entry.post_id}`)
    } else if (entry.kind === 'collaboration_proposal') {
      router.push('/collaborate?tab=pending')
    } else if (entry.post_id) {
      router.push(`/community#post-${entry.post_id}`)
    }
  }

  const followBack = async (entry: ActivityEntry) => {
    const actorId = entry.actorIds[0]
    if (!currentUserId || followingIds.has(actorId)) return
    try {
      const { error: followError } = await getSupabaseClient()
        .from('community_follows')
        .insert({ follower_id: currentUserId, creator_id: actorId })
      if (followError) throw followError
      setFollowingIds((current) => new Set(current).add(actorId))
      await markEntryRead(entry)
    } catch (followError) {
      setError(followError instanceof Error ? followError.message : 'Could not follow this person back.')
    }
  }

  const loadMoreNotifications = async () => {
    const cursor = notifications.at(-1)
    if (!currentUserId || !cursor || loadingMore || !hasMoreNotifications) return
    setLoadingMore(true)
    setError(null)
    try {
      const supabase = getSupabaseClient()
      const { data, error: loadError } = await supabase.from('user_notifications')
        .select('id, actor_id, kind, post_id, comment_id, proposal_id, moderation_message, created_at, read_at')
        .eq('recipient_id', currentUserId)
        .neq('kind', 'message')
        .or(`created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(NOTIFICATION_PAGE_SIZE)
      if (loadError) throw loadError
      const rows = (data ?? []).filter((row): row is typeof row & { kind: ActivityKind } => (
        ['follow', 'post_like', 'comment', 'comment_reply', 'comment_reaction', 'mention', 'collaboration_proposal', 'moderation_outcome'].includes(row.kind)
      ))
      const actorIds = Array.from(new Set(rows.map((row) => row.actor_id)))
      const postIds = Array.from(new Set(rows.map((row) => row.post_id).filter((id): id is string => Boolean(id))))
      const commentIds = Array.from(new Set(rows.map((row) => row.comment_id).filter((id): id is string => Boolean(id))))
      const proposalIds = Array.from(new Set(rows.map((row) => row.proposal_id).filter((id): id is string => Boolean(id))))
      const [profilesResult, postsResult, commentsResult, proposalsResult] = await Promise.all([
        actorIds.length ? supabase.from('profiles').select('id, display_name, username, avatar_path').in('id', actorIds) : Promise.resolve({ data: [], error: null }),
        postIds.length ? supabase.from('community_posts').select('id, content').in('id', postIds) : Promise.resolve({ data: [], error: null }),
        commentIds.length ? supabase.from('community_post_comments').select('id, content').in('id', commentIds) : Promise.resolve({ data: [], error: null }),
        proposalIds.length ? supabase.from('collaboration_requests').select('id, title').in('id', proposalIds) : Promise.resolve({ data: [], error: null }),
      ])
      if (profilesResult.error) throw profilesResult.error
      if (postsResult.error) throw postsResult.error
      if (commentsResult.error) throw commentsResult.error
      if (proposalsResult.error) throw proposalsResult.error
      const profilesById = new Map((profilesResult.data ?? []).map((profile) => [profile.id, profile]))
      const postsById = new Map((postsResult.data ?? []).map((post) => [post.id, post.content]))
      const commentsById = new Map((commentsResult.data ?? []).map((comment) => [comment.id, comment.content]))
      const proposalsById = new Map((proposalsResult.data ?? []).map((proposal) => [proposal.id, proposal.title]))
      setNotifications((current) => [...current, ...rows.map((row) => {
        const actor = profilesById.get(row.actor_id)
        return {
          id: row.id,
          actor_id: row.actor_id,
          kind: row.kind,
          post_id: row.post_id,
          comment_id: row.comment_id,
          proposal_id: row.proposal_id,
          created_at: row.created_at,
          read_at: row.read_at,
          actorName: actor?.display_name ?? 'StoryLines member',
          actorUsername: actor?.username ?? '',
          actorAvatarUrl: actor?.avatar_path ? supabase.storage.from('avatars').getPublicUrl(actor.avatar_path).data.publicUrl : null,
          postContent: row.post_id ? postsById.get(row.post_id) : undefined,
          commentContent: row.comment_id ? commentsById.get(row.comment_id) : undefined,
          proposalTitle: row.proposal_id ? proposalsById.get(row.proposal_id) : undefined,
          moderationMessage: row.moderation_message,
        }
      })])
      setHasMoreNotifications((data?.length ?? 0) === NOTIFICATION_PAGE_SIZE)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load earlier activity.')
    } finally {
      setLoadingMore(false)
    }
  }

  const filteredFollowingAuthors = followedAuthors.filter((author) => !mutedAuthorIds.has(author.id))

  return (
    <div className="mx-auto w-full max-w-7xl">
      <header className="mb-5">
        <span className="eyebrow">Your StoryLines</span>
        <h1 className="mt-1 font-serif text-3xl font-bold">Updates</h1>
        <p className="mt-1 text-sm text-muted-foreground">Bagong balita mula sa mga author na sinusundan mo.</p>
      </header>

      <div className="mb-5 flex gap-6 border-b border-border" role="tablist" aria-label="Updates">
        <button type="button" role="tab" aria-selected={tab === 'authors'} onClick={() => setTab('authors')} className={`min-h-12 border-b-2 px-1 text-sm font-bold ${tab === 'authors' ? 'border-accent text-foreground' : 'border-transparent text-muted-foreground'}`}>
          From authors you follow{unreadUpdates.length ? ` · ${unreadUpdates.length}` : ''}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'activity'} onClick={() => setTab('activity')} className={`relative min-h-12 border-b-2 px-1 text-sm font-bold ${tab === 'activity' ? 'border-accent text-foreground' : 'border-transparent text-muted-foreground'}`}>
          Activity{unreadNotificationCount ? ` · ${unreadNotificationCount}` : ''}
        </button>
      </div>

      {error && (
        <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-card p-4">
          <p className="min-w-0 flex-1 text-sm text-destructive">{error}</p>
          <button type="button" onClick={() => setReloadVersion((version) => version + 1)} className="min-h-10 text-sm font-bold text-accent">Try again</button>
        </div>
      )}

      {tab === 'authors' ? (
        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-[minmax(0,1fr)_17rem]">
          <section aria-label="Updates from authors you follow" className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2" aria-label="Filter author updates">
                {([
                  ['all', 'All'],
                  ['new-chapters', 'New chapters'],
                  ['new-stories', 'New stories'],
                  ['new-comics', 'New comics'],
                  ['announcements', 'Announcements'],
                  ['completed', 'Completed stories'],
                ] as const).map(([value, label]) => (
                  <button key={value} type="button" aria-pressed={authorFilter === value} onClick={() => setAuthorFilter(value)} className={`min-h-9 rounded-full border px-3 text-xs font-bold ${authorFilter === value ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground hover:border-accent'}`}>
                    {label}
                  </button>
                ))}
              </div>
              <button type="button" disabled={!unreadUpdates.length || saving} onClick={() => void markUpdatesSeen()} className="min-h-9 rounded-full border border-border px-3 text-xs font-bold hover:bg-muted disabled:opacity-50">
                {saving ? 'Saving…' : 'Mark all as seen'}
              </button>
            </div>
            {loading ? (
              <div className="space-y-3" aria-busy="true" aria-label="Loading author updates">
                {[0, 1, 2].map((item) => <div key={item} className="h-32 animate-pulse rounded-2xl bg-secondary/50" />)}
              </div>
            ) : !isLoggedIn ? (
              <Panel className="py-12 text-center">
                <BookOpen className="mx-auto size-8 text-accent" />
                <h2 className="mt-3 font-serif text-xl font-bold">Sign in to see author updates</h2>
                <Link href="/login?next=%2Fupdates" className="mt-4 inline-flex min-h-10 items-center rounded-full bg-accent px-4 text-sm font-bold text-accent-foreground">Log in</Link>
              </Panel>
            ) : visibleUpdates.length ? (
              <>
                {groupedUpdates.today.length > 0 && (
                  <section aria-label="Today">
                    <h2 className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Today</h2>
                    <ul className="space-y-2">
                      {groupedUpdates.today.map((update) => <AuthorUpdateCard key={update.id} update={update} onOpen={() => {
                        if (!update.seen) {
                          void getSupabaseClient().from('community_followed_update_reads')
                            .upsert({ user_id: currentUserId!, update_key: update.key, seen_at: new Date().toISOString() }, { onConflict: 'user_id,update_key' })
                            .then(({ error: readError }) => {
                              if (readError) setError(readError.message)
                              else setAuthorUpdates((current) => current.map((item) => item.id === update.id ? { ...item, seen: true } : item))
                            })
                        }
                      }} />)}
                    </ul>
                  </section>
                )}
                {groupedUpdates.thisWeek.length > 0 && (
                  <section className="mt-4" aria-label="This week">
                    <h2 className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">This week</h2>
                    <ul className="space-y-2">
                      {groupedUpdates.thisWeek.map((update) => <AuthorUpdateCard key={update.id} update={update} onOpen={() => {
                        if (!update.seen) {
                          void getSupabaseClient().from('community_followed_update_reads')
                            .upsert({ user_id: currentUserId!, update_key: update.key, seen_at: new Date().toISOString() }, { onConflict: 'user_id,update_key' })
                            .then(({ error: readError }) => {
                              if (readError) setError(readError.message)
                              else setAuthorUpdates((current) => current.map((item) => item.id === update.id ? { ...item, seen: true } : item))
                            })
                        }
                      }} />)}
                    </ul>
                  </section>
                )}
              </>
            ) : (
              <Panel className="px-5 py-12 text-center">
                <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-secondary text-accent"><BookOpen className="size-5" /></span>
                <h2 className="mt-4 font-serif text-xl font-bold">Walang laman? Follow some authors.</h2>
                <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">New chapters and episodes from authors you follow will show up here.</p>
                <Link href="/browse?tab=Authors" className="mt-4 inline-flex min-h-10 items-center rounded-full bg-accent px-4 text-sm font-bold text-accent-foreground">Find authors</Link>
              </Panel>
            )}
          </section>

          <aside className="hidden space-y-4 md:block" aria-label="Authors you follow">
            <Panel>
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Following · {filteredFollowingAuthors.length}</h2>
                <Link href="/browse?tab=Authors" className="text-xs font-bold text-accent hover:underline">See all</Link>
              </div>
              {filteredFollowingAuthors.length ? (
                <ul className="mt-3 space-y-2">
                  {filteredFollowingAuthors.slice(0, 8).map((author) => (
                    <li key={author.id} className="flex min-w-0 items-center gap-2">
                      <Link href={`/profile/${encodeURIComponent(author.id)}`} className="flex min-w-0 flex-1 items-center gap-2">
                        <ProfileAvatar src={author.avatarUrl} name={author.displayName} className="size-8" imageSizes="32px" />
                        <span className="min-w-0 truncate text-xs font-semibold">{author.displayName}</span>
                      </Link>
                      <button type="button" onClick={() => void toggleAuthorMute(author.id)} disabled={saving} aria-label={`Mute updates from ${author.displayName}`} title="Mute author updates" className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50">
                        <BellOff className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-xs leading-5 text-muted-foreground">{followedAuthors.length ? 'All followed authors are muted.' : 'Authors you follow will appear here.'}</p>
              )}
              {mutedAuthorIds.size > 0 && (
                <details className="mt-3 border-t border-border pt-3">
                  <summary className="cursor-pointer text-xs font-bold text-accent">Muted authors · {mutedAuthorIds.size}</summary>
                  <ul className="mt-2 space-y-2">
                    {followedAuthors.filter((author) => mutedAuthorIds.has(author.id)).map((author) => (
                      <li key={author.id} className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-xs">{author.displayName}</span>
                        <button type="button" onClick={() => void toggleAuthorMute(author.id)} disabled={saving} className="min-h-8 rounded-full border border-border px-2 text-[10px] font-bold">Unmute</button>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </Panel>
          </aside>
        </div>
      ) : (
        <Panel className="max-w-4xl p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4 sm:px-6">
            <div>
              <h2 className="font-serif text-xl font-bold">Activity on your work</h2>
              <p className="mt-1 text-sm text-muted-foreground">Likes, comments, follows, mentions, moderation decisions and collaboration proposals.</p>
            </div>
            <button type="button" disabled={!unreadNotificationCount || saving} onClick={() => void markAllActivityRead()} className="min-h-10 rounded-full border border-border px-4 text-xs font-bold hover:bg-muted disabled:opacity-50">
              {saving ? 'Saving…' : 'Mark all read'}
            </button>
          </div>
          <div className="flex flex-wrap gap-2 px-4 pt-3 sm:px-6" aria-label="Filter activity">
            {([
              ['all', 'All'],
              ['likes', 'Likes'],
              ['comments', 'Comments'],
              ['follows', 'Follows'],
              ['collaboration', 'Collaboration'],
              ['mentions', 'Mentions'],
              ['moderation', 'Moderation'],
            ] as const).map(([value, label]) => (
              <button key={value} type="button" aria-pressed={activityFilter === value} onClick={() => setActivityFilter(value)} className={`min-h-9 rounded-full border px-3 text-xs font-bold ${activityFilter === value ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground hover:border-accent'}`}>
                {label}
              </button>
            ))}
          </div>
          {activityLoading ? (
            <div className="space-y-3 p-4" aria-busy="true" aria-label="Loading activity">{[0, 1, 2].map((item) => <div key={item} className="h-16 animate-pulse rounded-xl bg-secondary/60" />)}</div>
          ) : !isLoggedIn ? (
            <div className="px-5 py-14 text-center">
              <Bell className="mx-auto size-7 text-accent" />
              <h3 className="mt-3 font-serif text-lg font-bold">Sign in to see your activity</h3>
              <Link href="/login?next=%2Fupdates" className="mt-4 inline-flex min-h-10 items-center rounded-full bg-accent px-4 text-sm font-bold text-accent-foreground">Log in</Link>
            </div>
          ) : activityEntries.length ? (
            <div className="px-4 pb-4 pt-3 sm:px-6">
              {groupedActivity.today.length > 0 && <ActivityGroup title="Today" entries={groupedActivity.today} notifications={notifications} followingIds={followingIds} onOpen={openEntry} onFollowBack={followBack} />}
              {groupedActivity.earlier.length > 0 && <ActivityGroup title="Earlier" entries={groupedActivity.earlier} notifications={notifications} followingIds={followingIds} onOpen={openEntry} onFollowBack={followBack} />}
              {hasMoreNotifications && (
                <button type="button" onClick={() => void loadMoreNotifications()} disabled={loadingMore} className="mx-auto mt-4 flex min-h-10 items-center rounded-full border border-border px-4 text-xs font-bold hover:bg-muted disabled:opacity-50">
                  {loadingMore ? 'Loading…' : 'Load earlier'}
                </button>
              )}
            </div>
          ) : (
            <div className="px-5 py-16 text-center">
              <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-secondary text-accent"><Bell className="size-5" /></span>
              <h3 className="mt-4 font-serif text-xl font-bold">No activity yet</h3>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">Likes, comments, follows, mentions, and collaboration proposals will appear here.</p>
              <Link href="/browse?tab=Authors" className="mt-4 inline-flex min-h-10 items-center rounded-full bg-accent px-4 text-sm font-bold text-accent-foreground">Find authors</Link>
            </div>
          )}
        </Panel>
      )}
    </div>
  )
}

function AuthorUpdateCard({ update, onOpen }: { update: FollowedUpdate; onOpen: () => void }) {
  const Icon = update.kind === 'new-comics' ? Brush : update.kind === 'announcements' ? Megaphone : BookOpen
  return (
    <li className={`rounded-2xl border border-border bg-card p-3 sm:p-4 ${update.seen ? '' : 'ring-1 ring-accent/10'}`}>
      <div className="flex items-start gap-2">
        {!update.seen && <span className="mt-2 size-2 shrink-0 rounded-full bg-accent" aria-label="Unread" />}
        <Link href={`/profile/${encodeURIComponent(update.authorId)}`} className="flex min-w-0 flex-1 items-center gap-2">
          <ProfileAvatar src={update.authorAvatarUrl} name={update.authorName} className="size-9" imageSizes="36px" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs leading-5"><strong>{update.authorName}</strong> {update.kind === 'new-chapters' ? 'posted a new chapter' : update.kind === 'new-comics' ? 'published a new episode' : update.kind === 'new-stories' ? 'started a new story' : update.kind === 'announcements' ? 'shared an announcement' : 'finished their story'}</span>
            <time className="block text-[10px] text-muted-foreground" dateTime={update.createdAt}>{timeAgo(update.createdAt)}</time>
          </span>
        </Link>
        {!update.seen && <Bell className="mt-1 size-4 shrink-0 text-accent" aria-label="New update" />}
      </div>
      {update.body ? (
        <p className="mt-3 whitespace-pre-wrap break-words text-xs leading-5">{update.body}</p>
      ) : (
        <div className="mt-3 flex items-center gap-3 rounded-xl bg-secondary/60 p-2">
          <span className="relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-accent/15 text-accent">
            {update.coverImageUrl
              ? <Image src={update.coverImageUrl} alt="" fill sizes="56px" className="object-cover" unoptimized />
              : <Icon className="size-6" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="inline-flex rounded-full bg-background px-2 py-1 text-[9px] font-bold">{updateTypeLabel(update.kind)}</span>
            <span className="mt-1 block truncate text-xs font-bold">{update.title}{update.kind === 'new-chapters' ? ` · ${update.detail}` : ''}</span>
            <span className="mt-1 block truncate text-[10px] text-muted-foreground">{update.kind === 'new-chapters' ? 'Opening lines of the chapter' : update.detail}</span>
          </span>
          <Link href={updateHref(update)} onClick={onOpen} className="inline-flex min-h-9 shrink-0 items-center rounded-full bg-accent px-3 text-[10px] font-bold text-accent-foreground hover:brightness-95">
            {update.kind === 'new-chapters' ? 'Read chapter' : update.kind === 'new-comics' ? 'Read episode' : update.kind === 'new-stories' ? 'Start reading' : 'Read from start'}
          </Link>
        </div>
      )}
    </li>
  )
}

function ActivityGroup({
  title,
  entries,
  notifications,
  followingIds,
  onOpen,
  onFollowBack,
}: {
  title: string
  entries: ActivityEntry[]
  notifications: Notification[]
  followingIds: Set<string>
  onOpen: (entry: ActivityEntry) => Promise<void>
  onFollowBack: (entry: ActivityEntry) => Promise<void>
}) {
  return (
    <section className="mb-4" aria-label={title}>
      <h3 className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{title}</h3>
      <ul className="divide-y divide-border">
        {entries.map((entry) => {
          const actorNotification = notifications.find((notification) => notification.id === entry.notificationIds[0])
          const snippet = entry.commentContent || entry.postContent
          return (
            <li key={entry.id} className={`flex min-h-16 items-center gap-3 px-2 py-3 sm:px-3 ${entry.unread ? 'bg-accent/5' : ''}`}>
              {entry.unread
                ? <span className="size-2 shrink-0 rounded-full bg-accent" aria-label="Unread" />
                : <span className="size-2 shrink-0" aria-hidden="true" />}
              <button type="button" onClick={() => void onOpen(entry)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                {entry.kind === 'moderation_outcome' ? (
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-accent">{activityIcon(entry.kind)}</span>
                ) : entry.kind === 'post_like' && entry.actorNames.length > 1 ? (
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-accent"><Heart className="size-4" /></span>
                ) : (
                  <ProfileAvatar src={entry.actorAvatarUrl} name={entry.actorNames[0]} className="size-10" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-xs leading-5">
                    {entry.kind === 'moderation_outcome' ? activityText(entry) : <><strong>{entry.actorNames[0]}</strong> {activityText(entry)}</>}
                  </span>
                  {(snippet || entry.proposalTitle) && <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{entry.proposalTitle ?? snippet}</span>}
                  <time className="block text-[10px] text-muted-foreground" dateTime={entry.created_at}>{timeAgo(entry.created_at)}</time>
                </span>
              </button>
              {entry.kind === 'comment' && entry.post_id && (
                <button type="button" onClick={() => void onOpen(entry)} className="min-h-9 shrink-0 rounded-full border border-border px-3 text-[10px] font-bold hover:border-accent">Reply</button>
              )}
              {entry.kind === 'follow' && !followingIds.has(entry.actorIds[0]) && (
                <button type="button" onClick={() => void onFollowBack(entry)} className="min-h-9 shrink-0 rounded-full border border-border px-3 text-[10px] font-bold hover:border-accent">Follow back</button>
              )}
              {(entry.kind === 'mention' || entry.kind === 'collaboration_proposal' || entry.kind === 'comment_reply') && (
                <button type="button" onClick={() => void onOpen(entry)} className="min-h-9 shrink-0 rounded-full border border-border px-3 text-[10px] font-bold hover:border-accent">View</button>
              )}
              {actorNotification?.actorUsername && <span className="sr-only">@{actorNotification.actorUsername}</span>}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
