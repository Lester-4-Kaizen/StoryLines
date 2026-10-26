'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { ChevronDown, Compass, Ellipsis, Heart, House, Inbox, Library, LogOut, Moon, PenLine, Search, Settings, Sun, Trophy, UsersRound, UserRound, X } from 'lucide-react'
import { ProfileAvatar } from '@/components/shared/profile-avatar'
import { getSupabaseClient } from '@/lib/supabase'
import { getFollowedUpdateSummary } from '@/lib/followed-update-summary'
import type { Badge, Route } from '@/lib/types'

// Detects a click/tap outside the returned ref and calls onOutside. Used
// instead of the old invisible-full-screen-button trick — that pattern
// stacked above the rest of the header (the header has its own z-index via
// `sticky` + `z-30`, so a `fixed inset-0` child inside it ends up covering
// everything, including sibling buttons like Log in/Sign up, swallowing
// the very next tap instead of reaching whatever it was aimed at).
function useClickOutside<T extends HTMLElement>(onOutside: () => void, active: boolean) {
  const ref = useRef<T>(null)
  useEffect(() => {
    if (!active) return
    const handler = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside()
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('touchstart', handler)
    }
  }, [active, onOutside])
  return ref
}

function NavItem({
  label,
  active,
  locked,
  icon,
  onClick,
}: {
  label: string
  active?: boolean
  locked?: boolean
  icon?: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-2 text-[11px] font-bold tracking-[0.04em] transition ${
        active ? 'bg-primary-foreground text-primary shadow-sm' : 'text-primary-foreground hover:bg-primary-foreground/10'
      }`}
    >
      {icon && <span className="[&>svg]:size-3.5">{icon}</span>}
      {label}
      {locked && <span className="ml-0.5 text-[10px] opacity-60">•</span>}
    </button>
  )
}

// Used for CREATE and COLLABORATE. Unlike Webnovel, where the creator side
// lives on an entirely separate site, this stays a dropdown right off the
// main nav — clicking it either opens a quick menu of where to go (if
// you're eligible) or triggers the same login/upgrade gate as before (if
// you're not). `onBlocked` reuses the existing create()/requireAuth logic
// rather than duplicating it.
function NavMenu({
  label,
  locked,
  active,
  allowOpen,
  onBlocked,
  items,
}: {
  label: string
  locked: boolean
  active: boolean
  allowOpen: boolean
  onBlocked: () => void
  items: { label: string; href: string }[]
}) {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false), open)

  const trigger = () => {
    if (!allowOpen) {
      onBlocked()
      return
    }
    setOpen((v) => !v)
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={trigger}
        className={`flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-2 text-[11px] font-bold tracking-[0.04em] transition ${
          active ? 'bg-primary-foreground text-primary shadow-sm' : 'text-primary-foreground hover:bg-primary-foreground/10'
        }`}
      >
        {label}
        {locked && <span className="ml-0.5 text-[10px] opacity-60">•</span>}
      </button>
      {open && (
        <div className="absolute left-0 z-20 mt-2 w-48 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-card p-1 shadow-lg">
          {items.map((menuItem) => (
            <button
              key={menuItem.href}
              onClick={() => {
                setOpen(false)
                router.push(menuItem.href)
              }}
              className="block w-full rounded-md px-3 py-2 text-left text-xs font-bold text-foreground hover:bg-muted"
            >
              {menuItem.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Matches the convention on Wattpad/Webnovel/NovelFull: signed-out visitors
// get separate Log in / Sign up links; once signed in, the avatar opens an
// account menu for profile, role, theme, settings, and sign-out controls.
function AccountMenu({
  go,
  logout,
  userId,
  themeMode,
  setThemeMode,
  badges,
  role,
  changeRole,
  onOpenChange,
}: {
  go: (route: Route) => void
  logout: () => void
  userId: string | null
  themeMode: 'light' | 'dark'
  setThemeMode: (mode: 'light' | 'dark') => void
  badges: Badge[]
  role: Badge
  changeRole: (role: Badge) => Promise<void>
  onOpenChange: (open: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState('Your profile')
  const [username, setUsername] = useState('')
  const [isStaff, setIsStaff] = useState(false)
  const router = useRouter()
  const [roleSaving, setRoleSaving] = useState(false)
  const [roleError, setRoleError] = useState<string | null>(null)
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false), open)

  useEffect(() => {
    onOpenChange(open)
  }, [onOpenChange, open])

  useEffect(() => {
    if (!userId) {
      setAvatarUrl(null)
      setDisplayName('Your profile')
      setUsername('')
      return
    }
    let active = true
    void (async () => {
      const { data, error } = await getSupabaseClient()
        .from('profiles')
        .select('avatar_path, display_name, username')
        .eq('id', userId)
        .maybeSingle()
      if (error) throw error
      if (active) {
        setAvatarUrl(data?.avatar_path
          ? getSupabaseClient().storage.from('avatars').getPublicUrl(data.avatar_path).data.publicUrl
          : null)
        setDisplayName(data?.display_name || 'Your profile')
        setUsername(data?.username || '')
      }
    })().catch((error: unknown) => console.error('Could not load your profile photo in the header', error))
    const onAvatarUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ userId: string; avatarUrl: string | null }>).detail
      if (detail?.userId === userId) setAvatarUrl(detail.avatarUrl)
    }
    window.addEventListener('storylines:profile-avatar-updated', onAvatarUpdated)
    return () => {
      active = false
      window.removeEventListener('storylines:profile-avatar-updated', onAvatarUpdated)
    }
  }, [userId])

  useEffect(() => {
    if (!userId) {
      setIsStaff(false)
      return
    }
    let active = true
    void (async () => {
      const { data, error } = await getSupabaseClient().rpc('get_my_moderation_role')
      if (error) throw error
      if (active) setIsStaff(data === 'moderator' || data === 'admin')
    })().catch((error: unknown) => {
      console.error('Could not check staff access for the account menu', error)
    })
    return () => {
      active = false
    }
  }, [userId])

  useEffect(() => {
    if (!open) return
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onEscape)
    return () => document.removeEventListener('keydown', onEscape)
  }, [open])

  const navigate = (route: Route) => {
    setOpen(false)
    go(route)
  }

  const item = (label: string, route: Route, icon: React.ReactNode, className = '') => (
    <button
      onClick={() => {
        navigate(route)
      }}
      className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring ${className}`}
    >
      {icon} <span>{label}</span>
    </button>
  )

  const accountDetails = (
    <div className="flex min-w-0 items-center gap-3 px-4 py-3">
      <ProfileAvatar src={avatarUrl} name={displayName} className="size-11" imageSizes="44px" />
      <div className="min-w-0">
        <p className="truncate text-sm font-bold text-foreground">{displayName}</p>
        {username && <p className="truncate text-xs text-muted-foreground">@{username}</p>}
      </div>
    </div>
  )

  const roleSwitcher = (
    <section className="border-b border-border px-4 py-3" aria-labelledby="posting-as-label">
      <p id="posting-as-label" className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-accent">Posting as</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Posting as">
        {badges.map((badge) => {
          const label = badge === 'artist' ? 'Artist' : badge.charAt(0).toUpperCase() + badge.slice(1)
          return (
            <button
              key={badge}
              type="button"
              onClick={() => {
                if (badge === role || roleSaving) return
                setRoleSaving(true)
                setRoleError(null)
                void changeRole(badge).catch((error: unknown) => {
                  setRoleError(error instanceof Error ? error.message : 'Could not change your posting role.')
                }).finally(() => setRoleSaving(false))
              }}
              disabled={roleSaving}
              aria-pressed={role === badge}
              className={`min-h-9 rounded-full border px-3 text-xs font-bold transition-colors disabled:opacity-60 ${
                role === badge
                  ? 'border-accent bg-accent text-accent-foreground'
                  : 'border-border bg-background text-foreground hover:border-accent'
              }`}
            >
              {label}
            </button>
          )
        })}
      </div>
      {roleError && <p role="alert" className="mt-2 text-xs text-destructive">{roleError}</p>}
    </section>
  )

  const themePicker = (
    <section className="border-b border-border px-4 py-3" aria-labelledby="account-theme-label">
      <p id="account-theme-label" className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-accent">Theme</p>
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Theme">
        <button
          type="button"
          onClick={() => setThemeMode('light')}
          aria-pressed={themeMode === 'light'}
          className={`flex min-h-10 items-center justify-center gap-1.5 rounded-full border text-xs font-bold ${
            themeMode === 'light' ? 'border-accent bg-accent text-accent-foreground' : 'border-border text-foreground hover:bg-muted'
          }`}
        >
          <Sun className="size-3.5" aria-hidden="true" /> Light
        </button>
        <button
          type="button"
          onClick={() => setThemeMode('dark')}
          aria-pressed={themeMode === 'dark'}
          className={`flex min-h-10 items-center justify-center gap-1.5 rounded-full border text-xs font-bold ${
            themeMode === 'dark' ? 'border-accent bg-accent text-accent-foreground' : 'border-border text-foreground hover:bg-muted'
          }`}
        >
          <Moon className="size-3.5" aria-hidden="true" /> Dark
        </button>
      </div>
    </section>
  )

  const logoutButton = (
    <button
      type="button"
      onClick={() => {
        setOpen(false)
        logout()
      }}
      className="flex min-h-11 w-full items-center gap-3 rounded-lg px-4 text-left text-sm font-medium text-destructive hover:bg-destructive/10 focus-visible:outline-2 focus-visible:outline-ring"
    >
      <LogOut className="size-4" /> Log out
    </button>
  )

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded-full p-1.5 hover:bg-primary-foreground/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        aria-label="Account menu"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <ProfileAvatar src={avatarUrl} name={displayName} className="size-9" imageSizes="36px" />
        <ChevronDown className="hidden size-3.5 min-[1200px]:block" />
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Close account menu"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[60] bg-black/45 min-[1200px]:hidden"
          />
          <section
            role="dialog"
            aria-label="Account menu"
            className="fixed inset-x-0 bottom-0 z-[61] max-h-[min(85dvh,42rem)] overflow-y-auto rounded-t-3xl border border-border bg-card pb-[max(1rem,env(safe-area-inset-bottom))] text-card-foreground shadow-2xl min-[1200px]:absolute min-[1200px]:inset-x-auto min-[1200px]:bottom-auto min-[1200px]:right-0 min-[1200px]:top-full min-[1200px]:z-20 min-[1200px]:mt-2 min-[1200px]:max-h-[calc(100dvh-6rem)] min-[1200px]:w-64 min-[1200px]:rounded-2xl min-[1200px]:border min-[1200px]:pb-2"
          >
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-border min-[1200px]:hidden" aria-hidden="true" />
            {accountDetails}
            {roleSwitcher}
            <nav className="space-y-1 border-b border-border p-2" aria-label="Account pages">
              {item('Profile', '/profile', <UserRound className="size-4 text-muted-foreground" />)}
              {isStaff && (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    router.push('/admin')
                  }}
                  className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <Settings className="size-4 text-muted-foreground" /> <span>Moderation</span>
                </button>
              )}
              <div className="min-[1200px]:hidden">
                {item('Library', '/library', <Library className="size-4 text-muted-foreground" />)}
              </div>
              {item('Settings', '/settings', <Settings className="size-4 text-muted-foreground" />)}
            </nav>
            {themePicker}
            <div className="px-2 pt-2">{logoutButton}</div>
          </section>
        </>
      )}
    </div>
  )
}

function unreadCountErrorMessage(error: unknown) {
  const readField = (field: string) => (
    typeof error === 'object' && error !== null && field in error
      ? String(Reflect.get(error, field))
      : ''
  )
  const code = readField('code')
  const message = readField('message')

  if (message.toLowerCase().includes('refresh token') || code === 'refresh_token_not_found' || code === 'PGRST301') {
    return 'Your Supabase session has expired. Sign out and sign in again to reload unread counts.'
  }
  if (code === '42703' || code === 'PGRST204' || code === 'PGRST205') {
    return 'Unread counts need the latest Supabase migrations. Apply the messaging, updates, chat-customization, and read-permissions migrations, then retry.'
  }
  if (code === '42501') {
    return 'Supabase denied access to unread counts or chat preferences. Apply the latest messaging, updates, chat-customization, and read-permissions migrations, then reload.'
  }
  return message || 'Could not load unread updates.'
}

function logUnreadCountError(context: string, error: unknown) {
  const readField = (field: string) => (
    typeof error === 'object' && error !== null && field in error
      ? Reflect.get(error, field)
      : undefined
  )
  const cause = readField('cause')
  const readCauseField = (field: string) => (
    typeof cause === 'object' && cause !== null && field in cause
      ? Reflect.get(cause, field)
      : undefined
  )
  const causeProperties = typeof cause === 'object' && cause !== null
    ? Object.fromEntries(Object.getOwnPropertyNames(cause).map((field) => {
      const value = Reflect.get(cause, field)
      return [field, value === null || ['string', 'number', 'boolean'].includes(typeof value) ? value : String(value)]
    }))
    : String(cause ?? '')
  const diagnostic = {
    query: readField('query'),
    code: readField('code') ?? readCauseField('code'),
    message: readField('message') || readCauseField('message') || String(cause ?? error),
    details: readField('details') ?? readCauseField('details'),
    hint: readField('hint') ?? readCauseField('hint'),
    status: readField('status') ?? readCauseField('status'),
    cause: causeProperties,
  }
  console.error(`${context}: ${JSON.stringify(diagnostic)}`)
}

function unreadCountQueryError(
  query: string,
  error: { message: string; code: string; details: string; hint: string; status?: number },
) {
  const message = error.message
    || (error.status === 403
      ? `Supabase denied access to ${query}. Apply the latest messaging and unread-count database migrations, then verify the signed-in user's RLS permissions.`
      : `Supabase request failed for ${query}.`)
  return Object.assign(new Error(message), {
    query,
    code: error.code,
    details: error.details,
    hint: error.hint,
    cause: error,
  })
}

function InboxMenu({ userId, active }: { userId: string | null; active: boolean }) {
  const [open, setOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [unreadMessageCount, setUnreadMessageCount] = useState(0)
  const [latestMessagePreview, setLatestMessagePreview] = useState('No conversations yet')
  const [latestUpdatePreview, setLatestUpdatePreview] = useState('No updates yet')
  const [unreadFollowedUpdateKeys, setUnreadFollowedUpdateKeys] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const totalUnreadCount = unreadCount + unreadMessageCount
  const triggerRef = useRef<HTMLButtonElement>(null)
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false), open)

  const refreshUnreadCount = useCallback(async () => {
    if (!userId) {
      setUnreadCount(0)
      setUnreadMessageCount(0)
      setLatestMessagePreview('No conversations yet')
      setLatestUpdatePreview('No updates yet')
      setUnreadFollowedUpdateKeys([])
      return
    }
    const supabase = getSupabaseClient()
    const [mutedConversationsResult] = await Promise.all([
      supabase
        .from('community_conversation_mutes')
        .select('partner_id, expires_at')
        .eq('user_id', userId),
    ])
    if (mutedConversationsResult.error) throw unreadCountQueryError('community_conversation_mutes', mutedConversationsResult.error)
    const mutedPartnerIds = (mutedConversationsResult.data ?? [])
      .filter((mute) => !mute.expires_at || new Date(mute.expires_at).getTime() > Date.now())
      .map((mute) => mute.partner_id)
    let messagesQuery = supabase
      .from('community_direct_messages')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_id', userId)
      .eq('is_deleted', false)
      .is('read_at', null)
    if (mutedPartnerIds.length) {
      messagesQuery = messagesQuery.not('sender_id', 'in', `(${mutedPartnerIds.join(',')})`)
    }
    const [updatesResult, messagesResult, latestMessageResult, latestUpdateResult, followedUpdateSummary] = await Promise.all([
      supabase
        .from('user_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_id', userId)
        .neq('kind', 'message')
        .is('read_at', null),
      messagesQuery,
      supabase
        .from('community_direct_messages')
        .select('sender_id, content, work_id')
        .eq('is_deleted', false)
        .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('user_notifications')
        .select('actor_id, kind, post_id, comment_id, chapter_comment_id, work_discussion_comment_id, proposal_id, moderation_message')
        .eq('recipient_id', userId)
        .neq('kind', 'message')
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(1)
        .maybeSingle(),
      getFollowedUpdateSummary(userId),
    ])
    if (updatesResult.error) throw unreadCountQueryError('user_notifications', updatesResult.error)
    if (messagesResult.error) throw unreadCountQueryError('community_direct_messages', messagesResult.error)
    if (latestMessageResult.error) throw unreadCountQueryError('community_direct_messages', latestMessageResult.error)
    if (latestUpdateResult.error) throw unreadCountQueryError('user_notifications', latestUpdateResult.error)

    const actorIds = [
      latestMessageResult.data
        ? latestMessageResult.data.sender_id === userId ? null : latestMessageResult.data.sender_id
        : null,
      latestUpdateResult.data?.actor_id ?? null,
    ].filter((id): id is string => Boolean(id))
    const { data: profiles, error: profilesError } = actorIds.length
      ? await supabase.from('profiles').select('id, display_name').in('id', [...new Set(actorIds)])
      : { data: [], error: null }
    if (profilesError) throw unreadCountQueryError('profiles', profilesError)
    const profileNames = new Map((profiles ?? []).map((profile) => [profile.id, profile.display_name]))

    if (latestMessageResult.data) {
      const message = latestMessageResult.data
      const sender = message.sender_id === userId ? 'You' : profileNames.get(message.sender_id) ?? 'StoryLines member'
      const content = message.work_id ? 'Shared a work' : message.content
      setLatestMessagePreview(`${sender}: ${content}`)
    } else {
      setLatestMessagePreview('No conversations yet')
    }
    let activityPreview: string | null = null
    if (latestUpdateResult.data) {
      const update = latestUpdateResult.data
      const actor = profileNames.get(update.actor_id) ?? 'Someone'
      const activity = update.kind === 'moderation_outcome' ? update.moderation_message ?? 'The moderation team reviewed a report.'
        : update.kind === 'follow' ? 'followed you'
        : update.kind === 'post_like' ? 'liked your post'
          : update.kind === 'comment' ? 'commented on your post'
            : update.kind === 'comment_reply' ? 'replied to your comment'
              : update.kind === 'chapter_comment' ? 'commented on your chapter discussion'
                : update.kind === 'chapter_comment_reply' ? 'replied to your chapter discussion'
                  : update.kind === 'work_comment' ? 'commented on your story discussion'
                    : update.kind === 'work_comment_reply' ? 'replied to your story discussion'
            : update.kind === 'comment_reaction' ? 'reacted to your comment'
              : update.kind === 'mention' && (update.chapter_comment_id || update.work_discussion_comment_id) ? 'mentioned you in a discussion'
                : update.kind === 'mention' ? 'mentioned you'
                : 'sent a collaboration proposal'
      activityPreview = update.kind === 'moderation_outcome' ? activity : `${actor} ${activity}`
    }
    setLatestUpdatePreview(activityPreview ?? followedUpdateSummary.latestPreview ?? 'No updates yet')
    setUnreadFollowedUpdateKeys(followedUpdateSummary.unreadKeys)
    setUnreadCount((updatesResult.count ?? 0) + followedUpdateSummary.unreadKeys.length)
    setUnreadMessageCount(messagesResult.count ?? 0)
    setError(null)
  }, [userId])

  const markAllAsRead = async () => {
    if (!userId || totalUnreadCount === 0) return
    setError(null)
    const now = new Date().toISOString()
    const supabase = getSupabaseClient()
    const followedUpdateReceipts = unreadFollowedUpdateKeys.map((updateKey) => ({
      user_id: userId,
      update_key: updateKey,
      seen_at: now,
    }))
    const [messagesResult, updatesResult, followedUpdatesResult] = await Promise.all([
      supabase.from('community_direct_messages')
        .update({ read_at: now })
        .eq('recipient_id', userId)
        .eq('is_deleted', false)
        .is('read_at', null),
      supabase.from('user_notifications')
        .update({ read_at: now })
        .eq('recipient_id', userId)
        .neq('kind', 'message')
        .is('read_at', null),
      followedUpdateReceipts.length
        ? supabase.from('community_followed_update_reads')
          .upsert(followedUpdateReceipts, { onConflict: 'user_id,update_key' })
        : Promise.resolve({ error: null }),
    ])
    if (messagesResult.error) throw unreadCountQueryError('community_direct_messages', messagesResult.error)
    if (updatesResult.error) throw unreadCountQueryError('user_notifications', updatesResult.error)
    if (followedUpdatesResult.error) throw unreadCountQueryError('community_followed_update_reads', followedUpdatesResult.error)
    setUnreadMessageCount(0)
    setUnreadCount(0)
    setUnreadFollowedUpdateKeys([])
    window.dispatchEvent(new Event('storylines:messages-updated'))
    window.dispatchEvent(new Event('storylines:notifications-updated'))
    window.dispatchEvent(new Event('storylines:all-notifications-read'))
  }

  useEffect(() => {
    let mounted = true
    const loadUnreadCount = () => {
      void refreshUnreadCount().catch((loadError: unknown) => {
        if (!mounted) return
        setError(unreadCountErrorMessage(loadError))
        logUnreadCountError('Could not load unread updates in the header', loadError)
      })
    }
    loadUnreadCount()
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') loadUnreadCount()
    }
    const refreshInterval = window.setInterval(() => {
      if (document.visibilityState === 'visible') loadUnreadCount()
    }, 30_000)
    window.addEventListener('storylines:notifications-updated', loadUnreadCount)
    window.addEventListener('storylines:messages-updated', loadUnreadCount)
    window.addEventListener('focus', loadUnreadCount)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      mounted = false
      window.clearInterval(refreshInterval)
      window.removeEventListener('storylines:notifications-updated', loadUnreadCount)
      window.removeEventListener('storylines:messages-updated', loadUnreadCount)
      window.removeEventListener('focus', loadUnreadCount)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [active, refreshUnreadCount])

  return (
    <div ref={ref} className="relative" onKeyDown={(event) => {
      if (event.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`relative flex size-10 items-center justify-center rounded-md bg-primary-foreground/10 text-primary-foreground transition-colors hover:bg-primary-foreground/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${active ? 'ring-1 ring-primary-foreground/25' : ''}`}
        aria-label={totalUnreadCount > 0
          ? `Open My Messages and Updates, ${totalUnreadCount} unread`
          : 'Open My Messages and Updates'}
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls="header-inbox-menu"
      >
        <Inbox className="size-5" />
        {totalUnreadCount > 0 && (
          <span className="absolute right-1 top-1 size-2.5 rounded-full border-2 border-primary bg-destructive" aria-hidden="true" />
        )}
      </button>
      {open && (
        <nav id="header-inbox-menu" aria-label="Inbox and updates" className="fixed inset-x-0 top-[4.5rem] z-40 overflow-hidden border-b border-border bg-card text-card-foreground shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96 sm:rounded-xl sm:border">
          <Link
            href="/messages"
            onClick={() => setOpen(false)}
            className="flex min-h-[4.5rem] items-center gap-3 border-b border-border px-4 py-3 hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground"><Inbox className="size-5" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold">My Messages</span>
              <span className="block truncate text-xs text-muted-foreground">{latestMessagePreview}</span>
            </span>
            {unreadMessageCount > 0 && (
              <span className="flex min-w-7 shrink-0 items-center justify-center rounded-full bg-destructive px-2 py-1 text-xs font-extrabold text-destructive-foreground" aria-label={`${unreadMessageCount} new messages`}>
                {unreadMessageCount > 99 ? '99+' : unreadMessageCount}
              </span>
            )}
          </Link>
          <Link
            href="/updates"
            onClick={() => setOpen(false)}
            className="flex min-h-[4.5rem] items-center gap-3 border-b border-border px-4 py-3 hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-secondary-foreground"><Heart className="size-5" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold">Updates</span>
              <span className="block truncate text-xs text-muted-foreground">{latestUpdatePreview}</span>
            </span>
            {unreadCount > 0 && (
              <span className="flex min-w-7 shrink-0 items-center justify-center rounded-full bg-destructive px-2 py-1 text-xs font-extrabold text-destructive-foreground" aria-label={`${unreadCount} new updates`}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </Link>
          <button
            type="button"
            onClick={() => void markAllAsRead().catch((markError: unknown) => {
              setError(unreadCountErrorMessage(markError))
              logUnreadCountError('Could not mark inbox and updates as read', markError)
            })}
            disabled={totalUnreadCount === 0}
            className="min-h-11 w-full px-4 text-center text-sm font-bold text-accent hover:bg-muted disabled:cursor-default disabled:opacity-50"
          >
            Mark all as read
          </button>
          {error && (
            <div className="border-t border-border px-3 py-2">
              <p role="alert" className="text-xs text-destructive">{error}</p>
              <button type="button" onClick={() => void refreshUnreadCount().catch((retryError: unknown) => {
                setError(unreadCountErrorMessage(retryError))
                logUnreadCountError('Could not refresh unread updates in the header', retryError)
              })} className="mt-1 min-h-8 text-xs font-bold text-accent">Try again</button>
            </div>
          )}
        </nav>
      )}
    </div>
  )
}

function HeaderSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const router = useRouter()
  const ref = useClickOutside<HTMLDivElement>(() => close(), open)

  function close() {
    setOpen(false)
    setQuery('')
  }

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const search = query.trim()
    router.push(search ? `/browse?search=${encodeURIComponent(search)}` : '/browse')
    close()
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex size-11 items-center justify-center rounded-full hover:bg-primary-foreground/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        aria-label={open ? 'Isara ang paghahanap' : 'Search'}
        aria-expanded={open}
        aria-controls="header-search-panel"
      >
        {open ? <X className="size-5" /> : <Search className="size-5" />}
      </button>
      {open && (
        <div id="header-search-panel" className="absolute right-0 top-full z-30 mt-2 w-[min(24rem,calc(100vw-1.5rem))] rounded-xl border border-border bg-card p-3 text-foreground shadow-xl max-[600px]:fixed max-[600px]:inset-x-3 max-[600px]:top-18 max-[600px]:mt-0 max-[600px]:w-auto">
          <form onSubmit={submitSearch} role="search" className="flex min-h-12 items-center gap-2 rounded-lg border border-input bg-background px-3 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
            <Search className="size-4 shrink-0" />
            <input
              autoFocus
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Hanap pamagat, genre, o keyword..."
              aria-label="Maghanap ayon sa pamagat, genre, o keyword"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <button type="submit" className="flex min-h-10 shrink-0 items-center rounded-md bg-accent px-3 text-xs font-bold text-accent-foreground hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              Hanapin
            </button>
          </form>
          <p className="px-1 pt-2 text-xs leading-5 text-muted-foreground">
            Maghanap sa pamagat, genre, at description ng mga nailathalang gawa.
          </p>
        </div>
      )}
    </div>
  )
}

export function SiteHeader({
  route,
  creator,
  isLoggedIn,
  currentUserId,
  badges,
  role,
  changeRole,
  themeMode,
  setThemeMode,
  go,
  create,
  requireAuth,
  logout,
}: {
  route: Route
  creator: boolean
  isLoggedIn: boolean
  currentUserId: string | null
  badges: Badge[]
  role: Badge
  changeRole: (role: Badge) => Promise<void>
  themeMode: 'light' | 'dark'
  setThemeMode: (mode: 'light' | 'dark') => void
  go: (route: Route) => void
  create: () => void
  requireAuth: (next: Route) => void
  logout: () => void
}) {
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)

  useEffect(() => {
    setMobileMoreOpen(false)
  }, [route])

  return (
    <header className={`sticky top-0 ${accountMenuOpen ? 'z-[60]' : 'z-30'} border-b border-border/70 bg-primary text-primary-foreground shadow-[0_3px_0_rgba(68,45,31,0.12)]`}>
      <div className="mx-auto flex h-18 max-w-7xl items-center gap-4 px-4 sm:gap-6 sm:px-6">
        <button onClick={() => go('/')} className="flex shrink-0 items-center gap-2" aria-label="StoryLines home">
          <span className="brand-mark">
            <Image
              src="/storylines-logo.png"
              alt=""
              aria-hidden="true"
              width={40}
              height={40}
              className="size-full object-contain dark:hidden"
            />
            <Image
              src="/storylines-logo-dark.png"
              alt=""
              aria-hidden="true"
              width={40}
              height={40}
              className="hidden size-full object-contain dark:block"
            />
          </span>
          <span className="font-serif text-xl font-bold tracking-tight">StoryLines</span>
        </button>

        <nav className="hidden flex-1 items-center gap-2 min-[1200px]:flex" aria-label="Main navigation">
          <NavItem label="HOME" active={route === '/'} onClick={() => go('/')} />
          <NavItem label="COMMUNITY" active={route === '/community'} onClick={() => go('/community')} />
          <NavItem label="BROWSE" active={route === '/browse'} onClick={() => go('/browse')} />
          <NavItem label="LIBRARY" active={route === '/library'} onClick={() => go('/library')} />
          <NavItem label="RANKING" active={route === '/ranking'} onClick={() => go('/ranking')} />
          <NavMenu
            label="CREATE"
            locked={!isLoggedIn || !creator}
            active={route.startsWith('/create')}
            allowOpen={isLoggedIn && creator}
            onBlocked={create}
            items={[
              { label: 'Dashboard', href: '/create' },
              { label: 'New work', href: '/create/works/new' },
              { label: 'My works', href: '/create/works' },
              { label: 'Portfolio', href: '/create/portfolio' },
              { label: 'Analytics', href: '/create/works/analytics' },
            ]}
          />
          <NavMenu
            label="COLLABORATE"
            locked={!isLoggedIn}
            active={route === '/collaborate'}
            allowOpen={isLoggedIn}
            onBlocked={() => requireAuth('/collaborate')}
            items={[
              { label: 'Find collaborators', href: '/collaborate?tab=find' },
              { label: 'Active', href: '/collaborate?tab=active' },
              { label: 'Pending', href: '/collaborate?tab=pending' },
              { label: 'Past', href: '/collaborate?tab=past' },
            ]}
          />
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
          <HeaderSearch />
          {!isLoggedIn && (
            <div className="hidden shrink-0 items-center gap-2 sm:flex">
              <Link href={{ pathname: '/login', query: { next: route } }} className="flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-bold hover:bg-primary-foreground/10">
                Log in
              </Link>
              <Link
                href={{ pathname: '/signup', query: { next: route } }}
                className="flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full border border-primary-foreground/25 px-4 py-1.5 text-sm font-bold hover:bg-primary-foreground/10"
              >
                Sign up
              </Link>
            </div>
          )}
          {isLoggedIn && (
            <InboxMenu userId={currentUserId} active={route === '/messages' || route === '/updates'} />
          )}
          {isLoggedIn && <AccountMenu go={go} logout={logout} userId={currentUserId} badges={badges} role={role} changeRole={changeRole} onOpenChange={setAccountMenuOpen} themeMode={themeMode} setThemeMode={setThemeMode} />}
        </div>
      </div>

      {mobileMoreOpen && (
        <div className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-2 z-51 w-52 overflow-hidden rounded-xl border border-border bg-card p-1 shadow-xl min-[1200px]:hidden" role="menu" aria-label="More navigation">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMobileMoreOpen(false)
              go('/ranking')
            }}
            className="flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-sm font-bold text-foreground hover:bg-muted"
          >
            <Trophy className="size-4 text-accent" aria-hidden="true" /> Ranking
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setMobileMoreOpen(false)
              if (isLoggedIn) go('/collaborate')
              else requireAuth('/collaborate')
            }}
            className="flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-sm font-bold text-foreground hover:bg-muted"
          >
            <UsersRound className="size-4 text-accent" aria-hidden="true" /> Collaborate
          </button>
        </div>
      )}

      <nav className="mobile-bottom-nav fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t border-border bg-card px-1 pb-[env(safe-area-inset-bottom)] pt-1 shadow-[0_-8px_24px_rgba(15,10,8,.12)] min-[1200px]:hidden" aria-label="Mobile primary navigation">
        {[
          { label: 'Home', route: '/' as Route, icon: House },
          { label: 'Browse', route: '/browse' as Route, icon: Compass },
          { label: 'Create', route: '/create' as Route, icon: PenLine },
          { label: 'Community', route: '/community' as Route, icon: UsersRound },
          { label: 'More', route: null, icon: Ellipsis },
        ].map((item) => {
          const active = item.route === null
            ? route === '/ranking' || route === '/collaborate'
            : item.route === '/' ? route === '/' : route.startsWith(item.route)
          const Icon = item.icon
          return (
            <button
              key={item.route}
              type="button"
              onClick={() => {
                if (item.route === null) setMobileMoreOpen((open) => !open)
                else if (item.route === '/create') create()
                else go(item.route)
              }}
              className="mobile-bottom-nav-item relative flex min-h-17 min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[10px] font-bold transition-colors hover:bg-muted"
              aria-current={active ? 'page' : undefined}
              aria-expanded={item.route === null ? mobileMoreOpen : undefined}
              aria-haspopup={item.route === null ? 'menu' : undefined}
            >
              {active && <span className="absolute top-0 h-0.5 w-7 rounded-full bg-accent" />}
              <Icon className={`size-5 ${active ? 'text-accent' : ''}`} aria-hidden="true" />
              <span className="max-w-full truncate">{item.label}</span>
            </button>
          )
        })}
      </nav>
    </header>
  )
}