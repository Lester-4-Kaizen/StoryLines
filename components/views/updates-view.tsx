'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Bell, Heart, UserPlus } from 'lucide-react'
import { CommunityView } from '@/components/views/community-view'
import { Panel } from '@/components/shared/panel'
import { ProfileAvatar } from '@/components/shared/profile-avatar'
import { useAppState } from '@/lib/app-state'
import { getSupabaseClient } from '@/lib/supabase'

type UpdatesTab = 'feed' | 'notifications'
type Notification = {
  id: string
  actor_id: string
  kind: 'follow' | 'post_like' | 'comment' | 'comment_reply' | 'comment_reaction'
  post_id: string | null
  created_at: string
  read_at: string | null
  actorName: string
  actorUsername: string
  actorAvatarUrl: string | null
}
const NOTIFICATION_PAGE_SIZE = 50

function notificationText(kind: Notification['kind']) {
  if (kind === 'follow') return 'followed you'
  if (kind === 'post_like') return 'liked your post'
  if (kind === 'comment') return 'commented on your post'
  if (kind === 'comment_reply') return 'replied to your comment'
  return 'reacted to your comment'
}

function notificationIcon(kind: Notification['kind']) {
  if (kind === 'follow') return <UserPlus className="size-4" />
  if (kind === 'post_like' || kind === 'comment_reaction') return <Heart className="size-4" />
  return <Bell className="size-4" />
}

export function UpdatesView() {
  const router = useRouter()
  const { creator, isLoggedIn, role, requireAuth, currentUserId } = useAppState()
  const [tab, setTab] = useState<UpdatesTab>('feed')
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [hasMoreNotifications, setHasMoreNotifications] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadVersion, setReloadVersion] = useState(0)

  useEffect(() => {
    if (!currentUserId) {
      setNotifications([])
      setLoading(false)
      return
    }
    let active = true
    setLoading(true)
    setError(null)
    void (async () => {
      const supabase = getSupabaseClient()
      const { data, error: loadError } = await supabase
        .from('user_notifications')
        .select('id, actor_id, kind, post_id, created_at, read_at')
        .eq('recipient_id', currentUserId)
        .neq('kind', 'message')
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(NOTIFICATION_PAGE_SIZE)
      if (loadError) throw loadError
      const actorIds = Array.from(new Set((data ?? []).map((row) => row.actor_id)))
      const { data: profiles, error: profilesError } = actorIds.length
        ? await supabase.from('profiles').select('id, display_name, username, avatar_path').in('id', actorIds)
        : { data: [], error: null }
      if (profilesError) throw profilesError
      const profilesById = new Map((profiles ?? []).map((profile) => [profile.id, profile]))
      if (!active) return
      setHasMoreNotifications((data?.length ?? 0) === NOTIFICATION_PAGE_SIZE)
      setNotifications((data ?? []).map((row) => {
        const actor = profilesById.get(row.actor_id)
        return {
          id: row.id,
          actor_id: row.actor_id,
          kind: row.kind,
          post_id: row.post_id,
          created_at: row.created_at,
          read_at: row.read_at,
          actorName: actor?.display_name ?? 'StoryLines member',
          actorUsername: actor?.username ?? '',
          actorAvatarUrl: actor?.avatar_path
            ? supabase.storage.from('avatars').getPublicUrl(actor.avatar_path).data.publicUrl
            : null,
        }
      }))
    })().catch((loadError: unknown) => {
      if (active) setError(loadError instanceof Error ? loadError.message : 'Could not load your notifications.')
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => {
      active = false
    }
  }, [currentUserId, reloadVersion])

  const loadMoreNotifications = async () => {
    const cursor = notifications.at(-1)
    if (!currentUserId || !cursor || loadingMore || !hasMoreNotifications) return
    setLoadingMore(true)
    setError(null)
    try {
      const supabase = getSupabaseClient()
      const { data, error: loadError } = await supabase
        .from('user_notifications')
        .select('id, actor_id, kind, post_id, created_at, read_at')
        .eq('recipient_id', currentUserId)
        .neq('kind', 'message')
        .or(`created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(NOTIFICATION_PAGE_SIZE)
      if (loadError) throw loadError
      const actorIds = Array.from(new Set((data ?? []).map((row) => row.actor_id)))
      const { data: profiles, error: profilesError } = actorIds.length
        ? await supabase.from('profiles').select('id, display_name, username, avatar_path').in('id', actorIds)
        : { data: [], error: null }
      if (profilesError) throw profilesError
      const profilesById = new Map((profiles ?? []).map((profile) => [profile.id, profile]))
      setNotifications((current) => [...current, ...(data ?? []).map((row) => {
        const actor = profilesById.get(row.actor_id)
        return {
          id: row.id,
          actor_id: row.actor_id,
          kind: row.kind,
          post_id: row.post_id,
          created_at: row.created_at,
          read_at: row.read_at,
          actorName: actor?.display_name ?? 'StoryLines member',
          actorUsername: actor?.username ?? '',
          actorAvatarUrl: actor?.avatar_path
            ? supabase.storage.from('avatars').getPublicUrl(actor.avatar_path).data.publicUrl
            : null,
        }
      })])
      setHasMoreNotifications((data?.length ?? 0) === NOTIFICATION_PAGE_SIZE)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load more notifications.')
    } finally {
      setLoadingMore(false)
    }
  }

  const openNotification = async (notification: Notification) => {
    if (!notification.read_at && currentUserId) {
      const now = new Date().toISOString()
      const { error: updateError } = await getSupabaseClient()
        .from('user_notifications')
        .update({ read_at: now })
        .eq('id', notification.id)
        .eq('recipient_id', currentUserId)
      if (updateError) {
        setError(updateError.message)
        return
      }
      setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, read_at: now } : item))
      window.dispatchEvent(new Event('storylines:notifications-updated'))
    }
    if (notification.kind === 'follow') {
      router.push(`/profile/${encodeURIComponent(notification.actor_id)}`)
    } else if (notification.post_id) {
      router.push(`/community#post-${notification.post_id}`)
    }
  }

  const markAllRead = async () => {
    if (!currentUserId) return
    const now = new Date().toISOString()
    const { error: updateError } = await getSupabaseClient()
      .from('user_notifications')
      .update({ read_at: now })
      .eq('recipient_id', currentUserId)
      .neq('kind', 'message')
      .is('read_at', null)
    if (updateError) {
      setError(updateError.message)
      return
    }
    setNotifications((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? now })))
    window.dispatchEvent(new Event('storylines:notifications-updated'))
  }

  const unreadCount = notifications.filter((notification) => !notification.read_at).length

  return (
    <div className="mx-auto w-full max-w-7xl">
      <header className="mb-5">
        <span className="eyebrow">Your StoryLines</span>
        <h1 className="mt-1 font-serif text-3xl font-bold">Updates</h1>
      </header>
      <div className="mb-5 flex gap-6 border-b border-border" role="tablist" aria-label="Updates">
        <button type="button" role="tab" aria-selected={tab === 'feed'} onClick={() => setTab('feed')} className={`min-h-12 border-b-2 px-1 text-sm font-bold ${tab === 'feed' ? 'border-accent text-foreground' : 'border-transparent text-muted-foreground'}`}>Social Feed</button>
        <button type="button" role="tab" aria-selected={tab === 'notifications'} onClick={() => setTab('notifications')} className={`min-h-12 border-b-2 px-1 text-sm font-bold ${tab === 'notifications' ? 'border-accent text-foreground' : 'border-transparent text-muted-foreground'}`}>Notifications{unreadCount > 0 ? ` (${unreadCount})` : ''}</button>
      </div>
      {tab === 'feed' ? (
        <CommunityView creator={creator} isLoggedIn={isLoggedIn} role={role} onUnlock={() => requireAuth('/updates')} initialTab="following" updatesMode />
      ) : (
        <Panel className="p-0">
          <div className="flex items-center justify-between gap-3 border-b border-border p-4 sm:px-6">
            <div>
              <h2 className="font-serif text-xl font-bold">Notifications</h2>
              <p className="mt-1 text-sm text-muted-foreground">Updates from people in your StoryLines community.</p>
            </div>
            <button type="button" disabled={!unreadCount} onClick={() => void markAllRead()} className="min-h-11 shrink-0 rounded-full border border-border px-4 text-xs font-bold hover:bg-muted disabled:opacity-50">Mark all read</button>
          </div>
          {error && <div className="m-4 rounded-xl border border-destructive/30 p-4"><p role="alert" className="text-sm text-destructive">{error}</p><button type="button" onClick={() => setReloadVersion((value) => value + 1)} className="mt-2 min-h-11 text-sm font-bold text-accent">Try again</button></div>}
          {loading ? (
            <div className="space-y-3 p-4" aria-busy="true" aria-label="Loading notifications">{[0, 1, 2].map((item) => <div key={item} className="h-16 animate-pulse rounded-xl bg-secondary/60" />)}</div>
          ) : notifications.length ? (
            <ul className="divide-y divide-border">
              {notifications.map((notification) => (
                <li key={notification.id}>
                  <button type="button" onClick={() => void openNotification(notification)} className={`flex min-h-20 w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/60 sm:px-6 ${notification.read_at ? '' : 'bg-accent/5'}`}>
                    <ProfileAvatar src={notification.actorAvatarUrl} name={notification.actorName} className="size-11" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm leading-5"><strong>{notification.actorName}</strong> {notificationText(notification.kind)}.</span>
                      <time className="mt-1 block text-xs text-muted-foreground" dateTime={notification.created_at}>{new Date(notification.created_at).toLocaleString()}</time>
                    </span>
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-accent" aria-hidden="true">{notificationIcon(notification.kind)}</span>
                    {!notification.read_at && <span className="size-2.5 shrink-0 rounded-full bg-accent" aria-label="Unread" />}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-5 py-16 text-center">
              <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-secondary text-accent"><Bell className="size-5" /></span>
              <h2 className="mt-4 font-serif text-xl font-bold">No notifications yet</h2>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">Follows, post reactions, and comments appear here. New direct messages have their own unread count in your Inbox.</p>
              <Link href="/browse" className="mt-4 inline-flex min-h-11 items-center rounded-full bg-accent px-5 text-sm font-bold text-accent-foreground">Find creators</Link>
            </div>
          )}
          {!loading && notifications.length > 0 && hasMoreNotifications && (
            <div className="border-t border-border p-3">
              <button type="button" onClick={() => void loadMoreNotifications()} disabled={loadingMore} className="min-h-11 w-full rounded-lg text-sm font-bold text-accent hover:bg-muted disabled:opacity-50">
                {loadingMore ? 'Loading…' : 'Load more notifications'}
              </button>
            </div>
          )}
        </Panel>
      )}
    </div>
  )
}
