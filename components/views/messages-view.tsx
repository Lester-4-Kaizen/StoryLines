'use client'

import Image from 'next/image'
import { Fragment, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowLeft,
  Check,
  ChevronDown,
  CornerUpLeft,
  Copy,
  FileText,
  Info,
  Archive,
  Ban,
  BellOff,
  BookOpen,
  Flag,
  Inbox,
  MailOpen,
  MessageCircle,
  MoreVertical,
  Pin,
  Palette,
  PenLine,
  Shield,
  Search,
  Send,
  ShieldCheck,
  Smile,
  Trash2,
  UserRound,
  UsersRound,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { ProfileAvatar } from '@/components/shared/profile-avatar'
import { useAppState } from '@/lib/app-state'
import { getSupabaseClient } from '@/lib/supabase'
import { useWorks } from '@/lib/works-store'

type Message = {
  id: string
  sender_id: string
  recipient_id: string
  content: string
  is_deleted: boolean
  created_at: string
  read_at: string | null
  reply_to_message_id: string | null
  work_id: string | null
  reactions?: MessageReactionView[]
  replyPreview?: Pick<Message, 'id' | 'sender_id' | 'content' | 'is_deleted'>
  sharedWork?: { id: string; title: string; type: 'story' | 'comic'; cover_image_url: string | null }
}
type MessageReaction = { message_id: string; user_id: string; reaction: string }
type MessageReactionView = { emoji: string; count: number; reactedByMe: boolean }
type Person = { id: string; name: string; username: string; avatarUrl: string | null }
type FollowedPerson = Person & { role: string }
type MessageFilter = 'all' | 'unread' | 'archived' | 'requests' | 'restricted'
type ConversationStatus = 'active' | 'archived' | 'deleted'
type ConversationState = { status: ConversationStatus; updated_at: string }
type ConversationStateResult = { partner_id: string; status: ConversationStatus; updated_at: string }
type MessageRequest = { id: string; sender_id: string; recipient_id: string; content: string; created_at: string }
type AccountControl = { account_id: string; status: 'restricted' | 'blocked'; created_at: string }
type MessageAccess = { can_send_direct: boolean; can_send_request: boolean; request_pending: boolean; account_blocked: boolean }
type Confirmation = { kind: 'conversation'; partnerId: string; status: ConversationStatus } | { kind: 'account'; accountId: string; status: 'restricted' | 'blocked' }
type BubbleColor = 'espresso' | 'rust' | 'chestnut' | 'amber' | 'sage' | 'blue' | 'plum' | 'pink'
type ChatBackground = 'paper' | 'sepia' | 'night' | 'plain'
type ChatTextSize = 'small' | 'medium' | 'large'
type MuteDuration = 'off' | '1h' | '8h' | '1d' | '1w' | 'always'
type ConversationPreferences = {
  bubble_color: BubbleColor
  chat_background: ChatBackground
  nickname_self: string
  nickname_partner: string
  quick_reaction: typeof MESSAGE_REACTIONS[number]
  pinned: boolean
}
type GlobalChatPreferences = {
  text_size: ChatTextSize
  message_sound: boolean
  reduce_motion: boolean
  high_contrast: boolean
}
type ConversationMute = { partner_id: string; expires_at: string | null }
type SharedConversationPreferenceRow = {
  user_low_id: string
  user_high_id: string
  bubble_color: BubbleColor
  chat_background: ChatBackground
  nickname_low: string
  nickname_high: string
  quick_reaction: ConversationPreferences['quick_reaction']
}
type ConversationUpdate = {
  actor_id: string | null
  preference_key: 'bubble_color' | 'chat_background' | 'nickname' | 'quick_reaction'
  preference_value: string
  created_at: string
}
const MESSAGE_PAGE_SIZE = 100
const MESSAGE_REACTIONS = ['❤️', '😂', '😮', '😢', '👍', '🔥'] as const
const EmojiPicker = dynamic(() => import('emoji-picker-react'), { ssr: false })
const DEFAULT_CONVERSATION_PREFERENCES: ConversationPreferences = {
  bubble_color: 'espresso',
  chat_background: 'paper',
  nickname_self: '',
  nickname_partner: '',
  quick_reaction: '❤️',
  pinned: false,
}
const DEFAULT_GLOBAL_CHAT_PREFERENCES: GlobalChatPreferences = {
  text_size: 'medium',
  message_sound: true,
  reduce_motion: false,
  high_contrast: false,
}
const BUBBLE_COLORS: { value: BubbleColor; label: string; background: string; foreground: string }[] = [
  { value: 'espresso', label: 'Espresso', background: '#3b2116', foreground: '#fff8ed' },
  { value: 'rust', label: 'Rust', background: '#a94327', foreground: '#fff8ed' },
  { value: 'chestnut', label: 'Chestnut', background: '#7b3d27', foreground: '#fff8ed' },
  { value: 'amber', label: 'Amber', background: '#cf7c2c', foreground: '#21170e' },
  { value: 'sage', label: 'Sage', background: '#597649', foreground: '#ffffff' },
  { value: 'blue', label: 'Blue', background: '#385b78', foreground: '#ffffff' },
  { value: 'plum', label: 'Plum', background: '#725078', foreground: '#ffffff' },
  { value: 'pink', label: 'Pink', background: '#b83269', foreground: '#ffffff' },
]
const CHAT_BACKGROUNDS: { value: ChatBackground; label: string; background: string; foreground: string }[] = [
  { value: 'paper', label: 'Paper', background: '#f8f2e8', foreground: '#352015' },
  { value: 'sepia', label: 'Sepia', background: '#efe0c2', foreground: '#3b2a1c' },
  { value: 'night', label: 'Night', background: '#161b22', foreground: '#f0f2f5' },
  { value: 'plain', label: 'Plain', background: 'var(--background)', foreground: 'var(--foreground)' },
]
const CHAT_TEXT_SIZES: { value: ChatTextSize; label: string; className: string }[] = [
  { value: 'small', label: 'Small', className: 'text-xs leading-5' },
  { value: 'medium', label: 'Medium', className: 'text-sm leading-6' },
  { value: 'large', label: 'Large', className: 'text-base leading-7' },
]
let messageAudioContext: AudioContext | null = null

function playMessageNotificationSound() {
  if (typeof window === 'undefined' || !window.AudioContext) return
  messageAudioContext ??= new window.AudioContext()
  const audioContext = messageAudioContext
  void audioContext.resume().then(() => {
    const oscillator = audioContext.createOscillator()
    const volume = audioContext.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.value = 740
    volume.gain.setValueAtTime(0.0001, audioContext.currentTime)
    volume.gain.exponentialRampToValueAtTime(0.08, audioContext.currentTime + 0.02)
    volume.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.16)
    oscillator.connect(volume)
    volume.connect(audioContext.destination)
    oscillator.start()
    oscillator.stop(audioContext.currentTime + 0.17)
  }).catch((soundError: unknown) => {
    console.error('Could not play the message notification sound', soundError)
  })
}

function conversationParticipants(firstId: string, secondId: string) {
  return firstId < secondId
    ? { lowId: firstId, highId: secondId }
    : { lowId: secondId, highId: firstId }
}

function applySharedConversationPreference(
  current: ConversationPreferences,
  row: SharedConversationPreferenceRow,
  currentUserId: string,
  partnerId: string,
): ConversationPreferences {
  const userIsLow = currentUserId === row.user_low_id
  const partnerIsLow = partnerId === row.user_low_id
  return {
    ...current,
    bubble_color: row.bubble_color,
    chat_background: row.chat_background,
    nickname_self: userIsLow ? row.nickname_low : row.nickname_high,
    nickname_partner: partnerIsLow ? row.nickname_low : row.nickname_high,
    quick_reaction: row.quick_reaction,
  }
}

function unlockMessageNotificationSound() {
  if (typeof window === 'undefined' || !window.AudioContext) return
  messageAudioContext ??= new window.AudioContext()
  void messageAudioContext.resume().catch((soundError: unknown) => {
    console.error('Could not enable the message notification sound', soundError)
  })
}

function isMuteActive(expiresAt: string | null | undefined) {
  return expiresAt === null || (typeof expiresAt === 'string' && new Date(expiresAt).getTime() > Date.now())
}

function isMuteDuration(value: string): value is MuteDuration {
  return ['off', '1h', '8h', '1d', '1w', 'always'].includes(value)
}

function messageDateLabel(date: Date) {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const dayDifference = Math.round((todayStart.getTime() - dateStart.getTime()) / 86_400_000)
  if (dayDifference === 0) return 'Today'
  if (dayDifference === 1) return 'Yesterday'
  return date.toLocaleDateString([], {
    month: 'long',
    day: 'numeric',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  })
}

function conversationTimeLabel(value: string) {
  const date = new Date(value)
  const now = new Date()
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: '2-digit' })
}

function sameMessageDay(first: Date, second: Date) {
  return first.getFullYear() === second.getFullYear()
    && first.getMonth() === second.getMonth()
    && first.getDate() === second.getDate()
}

function isConversationStateResult(value: unknown): value is ConversationStateResult {
  if (typeof value !== 'object' || value === null) return false
  const result = value as Record<string, unknown>
  return typeof result.partner_id === 'string'
    && (result.status === 'active' || result.status === 'archived' || result.status === 'deleted')
    && typeof result.updated_at === 'string'
}

function isMessageAccess(value: unknown): value is MessageAccess {
  if (typeof value !== 'object' || value === null) return false
  const result = value as Record<string, unknown>
  return typeof result.can_send_direct === 'boolean'
    && typeof result.can_send_request === 'boolean'
    && typeof result.request_pending === 'boolean'
    && typeof result.account_blocked === 'boolean'
}

function isMessageRow(value: unknown): value is Message {
  if (typeof value !== 'object' || value === null) return false
  const row = value as Record<string, unknown>
  return typeof row.id === 'string'
    && typeof row.sender_id === 'string'
    && typeof row.recipient_id === 'string'
    && typeof row.content === 'string'
    && typeof row.created_at === 'string'
    && typeof row.is_deleted === 'boolean'
    && (typeof row.read_at === 'string' || row.read_at === null)
    && (typeof row.reply_to_message_id === 'string' || row.reply_to_message_id === null)
    && (typeof row.work_id === 'string' || row.work_id === null)
}

function describeMessageError(error: unknown, fallback: string) {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    if (error.code === '42P01') {
      return 'Messaging features are not installed. Apply the latest migration 20261026000200_message_work_sharing_mutes_and_reports.sql in Supabase.'
    }
    if (error.code === 'PGRST202') {
      return 'A messaging database function is missing. Apply migrations 20261025000400 through 20261025000900, 20261025001200_chapter_discussions_chat_unsend_and_reader_position.sql, and 20261027000600_blocked_account_visibility_and_shared_chat_customization.sql in Supabase.'
    }
    if (error.code === '42501') {
      return 'Supabase denied this message action. Apply migrations 20261025000400 through 20261025000800, then sign in again.'
    }
    if (error.code === '42P17') {
      return 'The direct-message database policy is recursive. Apply migration 20261025000300 in Supabase to fix it.'
    }
    if (error.code === '42703' || error.code === 'PGRST204') {
      return 'The chat database is missing the latest message fields or customization settings. Apply migrations 20261026000200 and 20261026000400 in Supabase.'
    }
    if (error.code === 'PGRST205') {
      return 'Chat customization or account blocking is not installed. Apply migrations 20261026000400_chat_customization_preferences.sql and 20261027000600_blocked_account_visibility_and_shared_chat_customization.sql in Supabase.'
    }
  }
  if (typeof error === 'object' && error !== null) {
    const diagnostic = error as { code?: unknown; details?: unknown; hint?: unknown; message?: unknown; status?: unknown }
    const message = typeof diagnostic.message === 'string' ? diagnostic.message : fallback
    const metadata = [
      typeof diagnostic.code === 'string' ? `code: ${diagnostic.code}` : null,
      typeof diagnostic.status === 'number' ? `HTTP ${diagnostic.status}` : null,
      typeof diagnostic.details === 'string' ? diagnostic.details : null,
      typeof diagnostic.hint === 'string' ? diagnostic.hint : null,
    ].filter(Boolean)
    return metadata.length ? `${message} (${metadata.join(' · ')})` : message
  }
  return error instanceof Error ? error.message : fallback
}

export function MessagesView() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const requestedUserId = searchParams.get('user')
  const targetUserId = requestedUserId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestedUserId)
    ? requestedUserId
    : null
  const { currentUserId } = useAppState()
  const { works } = useWorks()
  const [messages, setMessages] = useState<Message[]>([])
  const [people, setPeople] = useState<Map<string, Person>>(new Map())
  const [followedPeople, setFollowedPeople] = useState<FollowedPerson[]>([])
  const peopleRef = useRef(people)
  peopleRef.current = people
  const [conversationStates, setConversationStates] = useState<Map<string, ConversationState>>(new Map())
  const [messageRequests, setMessageRequests] = useState<MessageRequest[]>([])
  const [accountControls, setAccountControls] = useState<AccountControl[]>([])
  const [mutedConversations, setMutedConversations] = useState<Map<string, string | null>>(new Map())
  const [conversationPreferences, setConversationPreferences] = useState<Map<string, ConversationPreferences>>(new Map())
  const conversationPreferencesRef = useRef(conversationPreferences)
  conversationPreferencesRef.current = conversationPreferences
  const [latestConversationUpdate, setLatestConversationUpdate] = useState<ConversationUpdate | null>(null)
  const mutedConversationsRef = useRef(mutedConversations)
  mutedConversationsRef.current = mutedConversations
  const [globalChatPreferences, setGlobalChatPreferences] = useState<GlobalChatPreferences>(DEFAULT_GLOBAL_CHAT_PREFERENCES)
  const globalChatPreferencesRef = useRef(globalChatPreferences)
  globalChatPreferencesRef.current = globalChatPreferences
  const [partnerOnline, setPartnerOnline] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(targetUserId)
  const [filter, setFilter] = useState<MessageFilter>('all')
  const [inboxSearchQuery, setInboxSearchQuery] = useState('')
  const [newMessageOpen, setNewMessageOpen] = useState(false)
  const [newMessageSearch, setNewMessageSearch] = useState('')
  const [conversationMenuFor, setConversationMenuFor] = useState<string | null>(null)
  const [updatingConversation, setUpdatingConversation] = useState<string | null>(null)
  const [savingChatPreferences, setSavingChatPreferences] = useState(false)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [shareWorkOpen, setShareWorkOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [reportReason, setReportReason] = useState<'harassment' | 'spam' | 'inappropriate' | 'other'>('other')
  const [reportDetails, setReportDetails] = useState('')
  const [reporting, setReporting] = useState(false)
  const [messageAccess, setMessageAccess] = useState<MessageAccess | null>(null)
  const [messageAccessLoading, setMessageAccessLoading] = useState(false)
  const [requestActionLoading, setRequestActionLoading] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false)
  const [replyingTo, setReplyingTo] = useState<Message | null>(null)
  const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(null)
  const [messageMenuFor, setMessageMenuFor] = useState<string | null>(null)
  const [activeMessageActionsFor, setActiveMessageActionsFor] = useState<string | null>(null)
  const [infoPanelOpen, setInfoPanelOpen] = useState(false)
  const [infoSection, setInfoSection] = useState<'chat' | 'customize' | 'privacy' | 'shared' | null>('privacy')
  const [conversationSearchOpen, setConversationSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [hasMoreMessages, setHasMoreMessages] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [inboxCursor, setInboxCursor] = useState<Pick<Message, 'created_at' | 'id'> | null>(null)
  const [nicknameDraftSelf, setNicknameDraftSelf] = useState('')
  const [nicknameDraftPartner, setNicknameDraftPartner] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [reloadVersion, setReloadVersion] = useState(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const activeMessageRef = useRef<HTMLDivElement>(null)
  const conversationMenuRef = useRef<HTMLLIElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressTriggeredRef = useRef(false)

  useEffect(() => {
    const refreshExpiredMutes = () => {
      const current = mutedConversationsRef.current
      const next = new Map([...current].filter(([, expiresAt]) => isMuteActive(expiresAt)))
      if (next.size === current.size) return
      setMutedConversations(next)
      window.dispatchEvent(new Event('storylines:messages-updated'))
    }
    const interval = window.setInterval(refreshExpiredMutes, 30_000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => () => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current)
  }, [])

  useEffect(() => {
    const closeTransientMenus = (event: PointerEvent) => {
      const target = event.target as Node
      if (!activeMessageRef.current?.contains(target)) {
        setActiveMessageActionsFor(null)
        setReactionPickerFor(null)
        setMessageMenuFor(null)
      }
      if (!conversationMenuRef.current?.contains(target)) setConversationMenuFor(null)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setActiveMessageActionsFor(null)
      setReactionPickerFor(null)
      setMessageMenuFor(null)
      setConversationMenuFor(null)
      setConfirmation(null)
      setNewMessageOpen(false)
      setInfoPanelOpen(false)
    }
    document.addEventListener('pointerdown', closeTransientMenus)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeTransientMenus)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [])

  const hydrateMessages = async (rows: Message[]) => {
    if (!rows.length) return []
    const supabase = getSupabaseClient()
    const messageIds = rows.map((message) => message.id)
    const replyIds = Array.from(new Set(rows.map((message) => message.reply_to_message_id).filter((id): id is string => Boolean(id))))
    const workIds = Array.from(new Set(rows.map((message) => message.work_id).filter((id): id is string => Boolean(id))))
    const [reactionsResult, repliesResult, worksResult] = await Promise.all([
      supabase
        .from('community_message_reactions')
        .select('message_id, user_id, reaction')
        .in('message_id', messageIds),
      replyIds.length
        ? supabase.from('community_direct_messages').select('id, sender_id, content, is_deleted').in('id', replyIds)
        : Promise.resolve({ data: [], error: null }),
      workIds.length
        ? supabase.from('creator_works').select('id, title, type, cover_image_url').in('id', workIds)
        : Promise.resolve({ data: [], error: null }),
    ])
    if (reactionsResult.error) throw reactionsResult.error
    if (repliesResult.error) throw repliesResult.error
    if (worksResult.error) throw worksResult.error
    const reactionsByMessage = new Map<string, MessageReaction[]>()
    for (const reaction of reactionsResult.data ?? []) {
      const reactions = reactionsByMessage.get(reaction.message_id) ?? []
      reactions.push(reaction)
      reactionsByMessage.set(reaction.message_id, reactions)
    }
    const replyById = new Map((repliesResult.data ?? []).map((reply) => [reply.id, reply]))
    const workById = new Map((worksResult.data ?? [])
      .filter((work): work is typeof work & { type: 'story' | 'comic' } => work.type === 'story' || work.type === 'comic')
      .map((work) => [work.id, work]))
    return rows.map((message) => {
      const reactionCounts = new Map<string, { count: number; reactedByMe: boolean }>()
      for (const reaction of reactionsByMessage.get(message.id) ?? []) {
        const current = reactionCounts.get(reaction.reaction) ?? { count: 0, reactedByMe: false }
        reactionCounts.set(reaction.reaction, {
          count: current.count + 1,
          reactedByMe: current.reactedByMe || reaction.user_id === currentUserId,
        })
      }
      return {
        ...message,
        reactions: [...reactionCounts].map(([emoji, value]) => ({ emoji, ...value })),
        replyPreview: message.reply_to_message_id
          ? replyById.get(message.reply_to_message_id)
          : undefined,
        sharedWork: message.work_id ? workById.get(message.work_id) : undefined,
      }
    })
  }

  useEffect(() => {
    setSelectedUserId(targetUserId)
  }, [targetUserId])

  useEffect(() => {
    if (!currentUserId) {
      setFollowedPeople([])
      return
    }
    let active = true
    void (async () => {
      const supabase = getSupabaseClient()
      const { data: follows, error: followsError } = await supabase
        .from('community_follows')
        .select('creator_id')
        .eq('follower_id', currentUserId)
      if (followsError) throw followsError
      const creatorIds = (follows ?? []).map((follow) => follow.creator_id)
      if (!creatorIds.length) {
        if (active) setFollowedPeople([])
        return
      }
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, display_name, username, avatar_path, roles')
        .in('id', creatorIds)
      if (profilesError) throw profilesError
      if (!active) return
      setFollowedPeople((profiles ?? []).map((profile) => ({
        id: profile.id,
        name: profile.display_name,
        username: profile.username,
        avatarUrl: profile.avatar_path
          ? supabase.storage.from('avatars').getPublicUrl(profile.avatar_path).data.publicUrl
          : null,
        role: profile.roles.includes('writer') ? 'Writer' : profile.roles.includes('artist') ? 'Artist' : 'Creator',
      })))
    })().catch((loadError: unknown) => {
      if (active) setError(describeMessageError(loadError, 'Could not load people you follow.'))
    })
    return () => {
      active = false
    }
  }, [currentUserId])

  useEffect(() => {
    if (!currentUserId) {
      setMessages([])
      setPeople(new Map())
      setConversationStates(new Map())
      setMessageRequests([])
      setAccountControls([])
      setMutedConversations(new Map())
      setConversationPreferences(new Map())
      setGlobalChatPreferences(DEFAULT_GLOBAL_CHAT_PREFERENCES)
      globalChatPreferencesRef.current = DEFAULT_GLOBAL_CHAT_PREFERENCES
      setInboxCursor(null)
      setHasMoreMessages(false)
      setLoading(false)
      return
    }
    let active = true
    setLoading(true)
    setError(null)
    void (async () => {
      const supabase = getSupabaseClient()
      const inboxPromise = supabase
          .from('community_direct_messages')
          .select('id, sender_id, recipient_id, content, is_deleted, created_at, read_at, reply_to_message_id, work_id')
          .or(`sender_id.eq.${currentUserId},recipient_id.eq.${currentUserId}`)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(MESSAGE_PAGE_SIZE)
      const conversationStatesPromise = supabase
        .from('community_conversation_states')
        .select('partner_id, status, updated_at')
        .eq('user_id', currentUserId)
      const messageRequestsPromise = supabase
        .from('community_message_requests')
        .select('id, sender_id, recipient_id, content, created_at')
        .or(`sender_id.eq.${currentUserId},recipient_id.eq.${currentUserId}`)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
      const accountControlsPromise = supabase
        .from('community_message_account_controls')
        .select('account_id, status, created_at')
        .eq('owner_id', currentUserId)
      const mutedConversationsPromise = supabase
        .from('community_conversation_mutes')
        .select('partner_id, expires_at')
        .eq('user_id', currentUserId)
      const conversationPreferencesPromise = supabase
        .from('community_conversation_preferences')
        .select('partner_id, bubble_color, chat_background, nickname_self, nickname_partner, quick_reaction, pinned')
        .eq('user_id', currentUserId)
      const sharedConversationPreferencesPromise = supabase
        .from('community_shared_conversation_preferences')
        .select('user_low_id, user_high_id, bubble_color, chat_background, nickname_low, nickname_high, quick_reaction')
        .or(`user_low_id.eq.${currentUserId},user_high_id.eq.${currentUserId}`)
      const globalChatPreferencesPromise = supabase
        .from('community_chat_preferences')
        .select('text_size, message_sound, reduce_motion, high_contrast')
        .eq('user_id', currentUserId)
        .maybeSingle()
      const selectedThreadPromise = targetUserId
        ? supabase
          .from('community_direct_messages')
          .select('id, sender_id, recipient_id, content, is_deleted, created_at, read_at, reply_to_message_id, work_id')
          .or(`and(sender_id.eq.${currentUserId},recipient_id.eq.${targetUserId}),and(sender_id.eq.${targetUserId},recipient_id.eq.${currentUserId})`)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(MESSAGE_PAGE_SIZE)
        : Promise.resolve({ data: [], error: null })
      const [inboxResult, selectedThreadResult, conversationStatesResult, messageRequestsResult, accountControlsResult, mutedConversationsResult, conversationPreferencesResult, sharedConversationPreferencesResult, globalChatPreferencesResult] = await Promise.all([
        inboxPromise,
        selectedThreadPromise,
        conversationStatesPromise,
        messageRequestsPromise,
        accountControlsPromise,
        mutedConversationsPromise,
        conversationPreferencesPromise,
        sharedConversationPreferencesPromise,
        globalChatPreferencesPromise,
      ])
      const loadedMessages = new Map(
        [...(inboxResult.data ?? []), ...(selectedThreadResult.data ?? [])].map((message) => [message.id, message]),
      )
      const data = [...loadedMessages.values()]
      const nextConversationStates = new Map((conversationStatesResult.data ?? []).map((state) => [
        state.partner_id,
        { status: state.status as ConversationStatus, updated_at: state.updated_at },
      ]))
      const visibleData = data.filter((message) => {
        const partnerId = message.sender_id === currentUserId ? message.recipient_id : message.sender_id
        const state = nextConversationStates.get(partnerId)
        return state?.status !== 'deleted' || new Date(message.created_at) > new Date(state.updated_at)
      })
      const partnerIds = Array.from(new Set([
        ...visibleData.map((message) => (
        message.sender_id === currentUserId ? message.recipient_id : message.sender_id
        )),
        ...(messageRequestsResult.data ?? []).flatMap((request) => [request.sender_id, request.recipient_id]),
        ...(accountControlsResult.data ?? []).map((control) => control.account_id),
      ]))
      if (targetUserId) partnerIds.push(targetUserId)
      partnerIds.push(currentUserId)
      const uniquePartnerIds = Array.from(new Set(partnerIds))
      const { data: profiles, error: profilesError } = uniquePartnerIds.length
        ? await supabase.from('profiles').select('id, display_name, username, avatar_path').in('id', uniquePartnerIds)
        : { data: [], error: null }
      if (profilesError) throw profilesError
      if (!active) return
      setPeople((current) => {
        const next = new Map(current)
        for (const profile of profiles ?? []) {
          next.set(profile.id, {
            id: profile.id,
            name: profile.display_name,
            username: profile.username,
            avatarUrl: profile.avatar_path
              ? supabase.storage.from('avatars').getPublicUrl(profile.avatar_path).data.publicUrl
              : null,
          })
        }
        return next
      })
      if (inboxResult.error) throw inboxResult.error
      if (selectedThreadResult.error) throw selectedThreadResult.error
      if (conversationStatesResult.error) throw conversationStatesResult.error
      if (messageRequestsResult.error) throw messageRequestsResult.error
      if (accountControlsResult.error) throw accountControlsResult.error
      if (mutedConversationsResult.error) throw mutedConversationsResult.error
      if (conversationPreferencesResult.error) throw conversationPreferencesResult.error
      if (sharedConversationPreferencesResult.error) throw sharedConversationPreferencesResult.error
      if (globalChatPreferencesResult.error) throw globalChatPreferencesResult.error
      const hydratedMessages = await hydrateMessages(visibleData)
      if (!active) return
      setMessages(hydratedMessages.sort((a, b) => (
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        || a.id.localeCompare(b.id)
      )))
      setHasMoreMessages((inboxResult.data?.length ?? 0) === MESSAGE_PAGE_SIZE)
      const lastInboxMessage = inboxResult.data?.at(-1)
      setInboxCursor(lastInboxMessage
        ? { created_at: lastInboxMessage.created_at, id: lastInboxMessage.id }
        : null)
      setConversationStates(nextConversationStates)
      setMessageRequests(messageRequestsResult.data ?? [])
      setAccountControls((accountControlsResult.data ?? []).map((control) => ({
        ...control,
        status: control.status as AccountControl['status'],
      })))
      setMutedConversations(new Map((mutedConversationsResult.data ?? [])
        .filter((mute) => !mute.expires_at || new Date(mute.expires_at).getTime() > Date.now())
        .map((mute) => [mute.partner_id, mute.expires_at])))
      const loadedConversationPreferences = new Map<string, ConversationPreferences>()
      for (const preferences of conversationPreferencesResult.data ?? []) {
        loadedConversationPreferences.set(preferences.partner_id, {
          ...DEFAULT_CONVERSATION_PREFERENCES,
          pinned: preferences.pinned,
        })
      }
      for (const row of sharedConversationPreferencesResult.data ?? []) {
        const partnerId = row.user_low_id === currentUserId ? row.user_high_id : row.user_low_id
        const previous = loadedConversationPreferences.get(partnerId) ?? DEFAULT_CONVERSATION_PREFERENCES
        loadedConversationPreferences.set(partnerId, applySharedConversationPreference(
          previous,
          row as SharedConversationPreferenceRow,
          currentUserId,
          partnerId,
        ))
      }
      setConversationPreferences(loadedConversationPreferences)
      const loadedGlobalPreferences = globalChatPreferencesResult.data
        ? {
          text_size: globalChatPreferencesResult.data.text_size as ChatTextSize,
          message_sound: globalChatPreferencesResult.data.message_sound,
          reduce_motion: globalChatPreferencesResult.data.reduce_motion,
          high_contrast: globalChatPreferencesResult.data.high_contrast,
        }
        : DEFAULT_GLOBAL_CHAT_PREFERENCES
      globalChatPreferencesRef.current = loadedGlobalPreferences
      setGlobalChatPreferences(loadedGlobalPreferences)
    })().catch((loadError: unknown) => {
      if (active) setError(describeMessageError(loadError, 'Could not load your messages.'))
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => {
      active = false
    }
  }, [currentUserId, router, targetUserId, reloadVersion])

  useEffect(() => {
    if (!currentUserId || !selectedUserId) {
      setLatestConversationUpdate(null)
      return
    }
    let active = true
    const supabase = getSupabaseClient()
    const { lowId, highId } = conversationParticipants(currentUserId, selectedUserId)
    const refreshSharedConversation = async () => {
      const [preferencesResult, updateResult] = await Promise.all([
        supabase
          .from('community_shared_conversation_preferences')
          .select('user_low_id, user_high_id, bubble_color, chat_background, nickname_low, nickname_high, quick_reaction')
          .eq('user_low_id', lowId)
          .eq('user_high_id', highId)
          .maybeSingle(),
        supabase
          .from('community_conversation_updates')
          .select('actor_id, preference_key, preference_value, created_at')
          .eq('user_low_id', lowId)
          .eq('user_high_id', highId)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])
      if (preferencesResult.error) throw preferencesResult.error
      if (updateResult.error) throw updateResult.error
      if (!active) return

      setConversationPreferences((current) => {
        const existing = current.get(selectedUserId) ?? DEFAULT_CONVERSATION_PREFERENCES
        const next = new Map(current)
        next.set(selectedUserId, preferencesResult.data
          ? applySharedConversationPreference(
            existing,
            preferencesResult.data as SharedConversationPreferenceRow,
            currentUserId,
            selectedUserId,
          )
          : {
            ...existing,
            bubble_color: DEFAULT_CONVERSATION_PREFERENCES.bubble_color,
            chat_background: DEFAULT_CONVERSATION_PREFERENCES.chat_background,
            nickname_self: '',
            nickname_partner: '',
            quick_reaction: DEFAULT_CONVERSATION_PREFERENCES.quick_reaction,
          })
        return next
      })
      setLatestConversationUpdate(updateResult.data as ConversationUpdate | null)
    }

    void refreshSharedConversation().catch((refreshError: unknown) => {
      if (active) setError(describeMessageError(refreshError, 'Could not refresh shared chat settings.'))
    })
    const intervalId = window.setInterval(() => {
      void refreshSharedConversation().catch((refreshError: unknown) => {
        if (active) setError(describeMessageError(refreshError, 'Could not refresh shared chat settings.'))
      })
    }, 5000)
    const refreshOnFocus = () => {
      void refreshSharedConversation().catch((refreshError: unknown) => {
        if (active) setError(describeMessageError(refreshError, 'Could not refresh shared chat settings.'))
      })
    }
    window.addEventListener('focus', refreshOnFocus)
    return () => {
      active = false
      window.clearInterval(intervalId)
      window.removeEventListener('focus', refreshOnFocus)
    }
  }, [currentUserId, reloadVersion, selectedUserId])

  useEffect(() => {
    if (!currentUserId) return
    let active = true
    const supabase = getSupabaseClient()
    const channel = supabase
      .channel(`community-direct-messages:${currentUserId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'community_direct_messages',
      }, (payload) => {
        const rawMessage = payload.eventType === 'DELETE' ? payload.old : payload.new
        if (!isMessageRow(rawMessage)) return
        if (rawMessage.sender_id !== currentUserId && rawMessage.recipient_id !== currentUserId) return
        if (payload.eventType === 'UPDATE') {
          setMessages((current) => current.map((message) => message.id === rawMessage.id
            ? { ...message, ...rawMessage }
            : message))
          return
        }
        if (payload.eventType !== 'INSERT') return
        void (async () => {
          const [hydratedMessages] = await Promise.all([hydrateMessages([rawMessage])])
          if (!active) return
          const partnerId = rawMessage.sender_id === currentUserId ? rawMessage.recipient_id : rawMessage.sender_id
          const muteExpiry = mutedConversationsRef.current.get(partnerId)
          if (
            rawMessage.sender_id !== currentUserId
            && !isMuteActive(muteExpiry)
            && globalChatPreferencesRef.current.message_sound
          ) playMessageNotificationSound()
          if (!peopleRef.current.has(partnerId)) {
            const { data: profile, error: profileError } = await supabase
              .from('profiles')
              .select('id, display_name, username, avatar_path')
              .eq('id', partnerId)
              .maybeSingle()
            if (profileError) throw profileError
            if (profile) {
              setPeople((current) => new Map(current).set(profile.id, {
                id: profile.id,
                name: profile.display_name,
                username: profile.username,
                avatarUrl: profile.avatar_path
                  ? supabase.storage.from('avatars').getPublicUrl(profile.avatar_path).data.publicUrl
                  : null,
              }))
            }
          }
          setMessages((current) => {
            if (current.some((message) => message.id === rawMessage.id)) return current
            return [...current, ...hydratedMessages].sort((a, b) => (
              new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
              || a.id.localeCompare(b.id)
            ))
          })
          window.dispatchEvent(new Event('storylines:messages-updated'))
        })().catch((realtimeError: unknown) => {
          if (active) setError(describeMessageError(realtimeError, 'Could not update the conversation in real time.'))
        })
      })
      .subscribe((subscriptionStatus, subscriptionError) => {
        if (active && subscriptionStatus === 'CHANNEL_ERROR') {
          setError(describeMessageError(subscriptionError, 'Could not connect to live messages.'))
        }
      })
    return () => {
      active = false
      void supabase.removeChannel(channel)
    }
  }, [currentUserId])

  const loadOlderMessages = async () => {
    const cursor = inboxCursor
    if (!cursor || loadingOlder || !hasMoreMessages) return
    setLoadingOlder(true)
    setError(null)
    try {
      const supabase = getSupabaseClient()
      const { data, error: olderError } = await supabase
        .from('community_direct_messages')
        .select('id, sender_id, recipient_id, content, is_deleted, created_at, read_at, reply_to_message_id, work_id')
        .or(`and(sender_id.eq.${currentUserId},created_at.lt.${cursor.created_at}),and(recipient_id.eq.${currentUserId},created_at.lt.${cursor.created_at}),and(sender_id.eq.${currentUserId},created_at.eq.${cursor.created_at},id.lt.${cursor.id}),and(recipient_id.eq.${currentUserId},created_at.eq.${cursor.created_at},id.lt.${cursor.id})`)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(MESSAGE_PAGE_SIZE)
      if (olderError) throw olderError
      const olderMessages = await hydrateMessages((data ?? []).slice().reverse())
      const knownPeople = new Set(people.keys())
      const newPartnerIds = Array.from(new Set(olderMessages.map((message) => (
        message.sender_id === currentUserId ? message.recipient_id : message.sender_id
      )))).filter((id) => !knownPeople.has(id))
      if (newPartnerIds.length) {
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, display_name, username, avatar_path')
          .in('id', newPartnerIds)
        if (profilesError) throw profilesError
        setPeople((current) => {
          const next = new Map(current)
          for (const profile of profiles ?? []) {
            next.set(profile.id, {
              id: profile.id,
              name: profile.display_name,
              username: profile.username,
              avatarUrl: profile.avatar_path
                ? supabase.storage.from('avatars').getPublicUrl(profile.avatar_path).data.publicUrl
                : null,
            })
          }
          return next
        })
      }
      setMessages((current) => {
        const combined = new Map([...olderMessages, ...current].map((message) => [message.id, message]))
        return [...combined.values()].sort((a, b) => (
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          || a.id.localeCompare(b.id)
        ))
      })
      setHasMoreMessages((data?.length ?? 0) === MESSAGE_PAGE_SIZE)
      const lastOlderMessage = data?.at(-1)
      setInboxCursor(lastOlderMessage
        ? { created_at: lastOlderMessage.created_at, id: lastOlderMessage.id }
        : null)
    } catch (olderError) {
      setError(describeMessageError(olderError, 'Could not load older messages.'))
    } finally {
      setLoadingOlder(false)
    }
  }

  const conversations = useMemo(() => {
    const latestByPartner = new Map<string, Message>()
    for (const message of messages) {
      const partnerId = message.sender_id === currentUserId ? message.recipient_id : message.sender_id
      const latest = latestByPartner.get(partnerId)
      if (!latest || new Date(message.created_at).getTime() > new Date(latest.created_at).getTime()) latestByPartner.set(partnerId, message)
    }
    return [...latestByPartner.entries()]
      .map(([partnerId, latest]) => ({
        partnerId,
        latest,
        unread: messages.filter((message) => message.sender_id === partnerId && message.recipient_id === currentUserId && !message.read_at).length,
        state: conversationStates.get(partnerId),
        pinned: conversationPreferences.get(partnerId)?.pinned ?? false,
      }))
      .map((conversation) => ({
        ...conversation,
        status: conversation.state && new Date(conversation.latest.created_at) <= new Date(conversation.state.updated_at)
          ? conversation.state.status
          : 'active' as ConversationStatus,
      }))
      .filter((conversation) => filter === 'archived'
        ? conversation.status === 'archived'
        : conversation.status === 'active' && (filter === 'all' || conversation.unread > 0))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned)
        || new Date(b.latest.created_at).getTime() - new Date(a.latest.created_at).getTime())
  }, [conversationPreferences, conversationStates, currentUserId, filter, messages])
  const filteredConversations = useMemo(() => {
    const query = inboxSearchQuery.trim().toLocaleLowerCase()
    if (!query) return conversations
    return conversations.filter((conversation) => {
      const person = people.get(conversation.partnerId)
      return person && `${person.name} ${person.username} ${conversation.latest.content}`.toLocaleLowerCase().includes(query)
    })
  }, [conversations, inboxSearchQuery, people])
  const filteredFollowedPeople = followedPeople
    .filter((person) => {
      if (person.id === currentUserId) return false
      const query = newMessageSearch.trim().toLocaleLowerCase()
      return !query || `${person.name} ${person.username}`.toLocaleLowerCase().includes(query)
    })
    .slice(0, 8)

  const visibleMessages = useMemo(() => messages.filter((message) => {
    const partnerId = message.sender_id === currentUserId ? message.recipient_id : message.sender_id
    const state = conversationStates.get(partnerId)
    return state?.status !== 'deleted' || new Date(message.created_at) > new Date(state.updated_at)
  }), [conversationStates, currentUserId, messages])

  const threadMessages = useMemo(() => selectedUserId
    ? visibleMessages.filter((message) => (
      (message.sender_id === currentUserId && message.recipient_id === selectedUserId)
      || (message.sender_id === selectedUserId && message.recipient_id === currentUserId)
    ))
    : [], [currentUserId, selectedUserId, visibleMessages])
  const displayedThreadMessages = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase()
    return query
      ? threadMessages.filter((message) => message.content.toLocaleLowerCase().includes(query))
      : threadMessages
  }, [searchQuery, threadMessages])
  const selectedPerson = selectedUserId ? people.get(selectedUserId) : undefined
  const selectedChatPreferences = selectedUserId
    ? conversationPreferences.get(selectedUserId) ?? DEFAULT_CONVERSATION_PREFERENCES
    : DEFAULT_CONVERSATION_PREFERENCES
  const selectedConversationStatus = conversations.find((conversation) => conversation.partnerId === selectedUserId)?.status ?? 'active'
  const selectedMuteExpiry = selectedUserId ? mutedConversations.get(selectedUserId) : undefined
  const selectedMuteDuration: MuteDuration = selectedMuteExpiry === undefined
    ? 'off'
    : selectedMuteExpiry === null
      ? 'always'
      : (() => {
        const remaining = new Date(selectedMuteExpiry).getTime() - Date.now()
        if (remaining <= 60 * 60 * 1000 * 1.1) return '1h'
        if (remaining <= 8 * 60 * 60 * 1000 * 1.1) return '8h'
        if (remaining <= 24 * 60 * 60 * 1000 * 1.1) return '1d'
        return '1w'
      })()
  const selectedChatBackground = CHAT_BACKGROUNDS.find((background) => background.value === selectedChatPreferences.chat_background)
    ?? CHAT_BACKGROUNDS[0]
  const selectedBubbleColor = BUBBLE_COLORS.find((color) => color.value === selectedChatPreferences.bubble_color)
    ?? BUBBLE_COLORS[0]
  const selectedPartnerName = selectedChatPreferences.nickname_partner.trim() || selectedPerson?.name || 'StoryLines member'
  const selectedSelfName = selectedChatPreferences.nickname_self.trim() || 'You'
  const latestUpdateActor = latestConversationUpdate?.actor_id === currentUserId
    ? 'You'
    : latestConversationUpdate?.actor_id
      ? people.get(latestConversationUpdate.actor_id)?.name ?? 'A participant'
      : 'A participant'
  const latestUpdateDescription = latestConversationUpdate?.preference_key === 'chat_background'
    ? `changed the theme to ${CHAT_BACKGROUNDS.find((item) => item.value === latestConversationUpdate.preference_value)?.label ?? latestConversationUpdate.preference_value}`
    : latestConversationUpdate?.preference_key === 'bubble_color'
      ? `changed the bubble color to ${BUBBLE_COLORS.find((item) => item.value === latestConversationUpdate.preference_value)?.label ?? latestConversationUpdate.preference_value}`
      : latestConversationUpdate?.preference_key === 'nickname'
        ? `updated a shared nickname${latestConversationUpdate.preference_value ? ` to ${latestConversationUpdate.preference_value}` : ''}`
        : latestConversationUpdate?.preference_key === 'quick_reaction'
          ? `changed the quick reaction to ${latestConversationUpdate.preference_value}`
          : ''
  const textSizeClass = CHAT_TEXT_SIZES.find((size) => size.value === globalChatPreferences.text_size)?.className
    ?? CHAT_TEXT_SIZES[1].className
  const selectedPendingRequest = selectedUserId
    ? messageRequests.find((request) => (
      (request.sender_id === currentUserId && request.recipient_id === selectedUserId)
      || (request.recipient_id === currentUserId && request.sender_id === selectedUserId)
    ))
    : undefined
  const selectedAccountControl = selectedUserId
    ? accountControls.find((control) => control.account_id === selectedUserId)
    : undefined
  const visibleMessageRequests = messageRequests.filter((request) => (
    request.recipient_id === currentUserId
    && !accountControls.some((control) => control.account_id === request.sender_id && control.status === 'restricted')
  ))
  const unreadMessageCount = messages.filter((message) => (
    message.sender_id !== currentUserId && message.recipient_id === currentUserId && !message.read_at
  )).length
  const restrictedIncomingRequests = messageRequests.filter((request) => (
    request.recipient_id === currentUserId
    && accountControls.some((control) => control.account_id === request.sender_id && control.status === 'restricted')
  ))

  useEffect(() => {
    setNicknameDraftSelf(selectedChatPreferences.nickname_self)
    setNicknameDraftPartner(selectedChatPreferences.nickname_partner)
  }, [selectedUserId, selectedChatPreferences.nickname_self, selectedChatPreferences.nickname_partner])

  useEffect(() => {
    if (!currentUserId || !selectedUserId) {
      setMessageAccess(null)
      setMessageAccessLoading(false)
      setPartnerOnline(false)
      return
    }
    let active = true
    setMessageAccess(null)
    setMessageAccessLoading(true)
    void (async () => {
      const { data, error: accessError } = await getSupabaseClient()
        .rpc('get_community_message_access', { p_partner_id: selectedUserId })
      if (accessError) throw accessError
      const access = Array.isArray(data) ? data[0] : data
      if (!isMessageAccess(access)) throw new Error('Supabase returned an invalid message access response.')
      if (active) setMessageAccess(access)
    })().catch((accessError: unknown) => {
      if (active) setError(describeMessageError(accessError, 'Could not check message permissions.'))
    }).finally(() => {
      if (active) setMessageAccessLoading(false)
    })
    return () => {
      active = false
    }
  }, [currentUserId, reloadVersion, selectedUserId])

  useEffect(() => {
    if (!currentUserId || !selectedUserId) {
      setPartnerOnline(false)
      return
    }
    const supabase = getSupabaseClient()
    const pair = [currentUserId, selectedUserId].sort().join(':')
    const channel = supabase.channel(`community-message-presence:${pair}`, {
      config: { presence: { key: currentUserId } },
    })
    channel.on('presence', { event: 'sync' }, () => {
      setPartnerOnline(Boolean(channel.presenceState()[selectedUserId]?.length))
    })
    channel.subscribe((status, presenceError) => {
      if (status === 'SUBSCRIBED') {
        void channel.track({ user_id: currentUserId, online_at: new Date().toISOString() })
          .catch((trackError: unknown) => console.error('Could not publish chat presence', trackError))
      } else if (status === 'CHANNEL_ERROR') {
        setPartnerOnline(false)
        console.error('Could not subscribe to chat presence', presenceError)
      }
    })
    return () => {
      setPartnerOnline(false)
      void supabase.removeChannel(channel)
    }
  }, [currentUserId, selectedUserId])

  useEffect(() => {
    if (!currentUserId || !selectedUserId) return
    const unreadIds = threadMessages.filter((message) => message.recipient_id === currentUserId && !message.read_at).map((message) => message.id)
    if (!unreadIds.length) return
    const readAt = new Date().toISOString()
    void (async () => {
      const { error: updateError } = await getSupabaseClient().from('community_direct_messages')
        .update({ read_at: readAt })
        .in('id', unreadIds)
        .eq('recipient_id', currentUserId)
      if (updateError) throw updateError
      setMessages((current) => current.map((message) => unreadIds.includes(message.id) ? { ...message, read_at: readAt } : message))
      window.dispatchEvent(new Event('storylines:messages-updated'))
    })().catch((updateError: unknown) => {
      setError(describeMessageError(updateError, 'Could not mark messages as read.'))
    })
  }, [currentUserId, selectedUserId, threadMessages])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: globalChatPreferences.reduce_motion ? 'auto' : 'smooth',
      block: 'end',
    })
  }, [globalChatPreferences.reduce_motion, threadMessages.length, selectedUserId])

  const insertEmoji = (emoji: string) => {
    const textarea = composerRef.current
    const start = textarea?.selectionStart ?? draft.length
    const end = textarea?.selectionEnd ?? draft.length
    const nextDraft = `${draft.slice(0, start)}${emoji}${draft.slice(end)}`
    setDraft(nextDraft)
    setEmojiPickerOpen(false)
    requestAnimationFrame(() => {
      textarea?.focus()
      textarea?.setSelectionRange(start + emoji.length, start + emoji.length)
    })
  }

  const startMessageLongPress = (messageId: string) => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current)
    longPressTriggeredRef.current = false
    longPressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true
      setActiveMessageActionsFor(messageId)
      setReactionPickerFor(messageId)
    }, 500)
  }

  const cancelMessageLongPress = () => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current)
    longPressTimerRef.current = null
  }

  const unsendMessage = async (message: Message) => {
    setError(null)
    try {
      const { error: unsendError } = await getSupabaseClient()
        .rpc('unsend_community_direct_message', { p_message_id: message.id })
      if (unsendError) throw unsendError
      setMessages((current) => current.map((item) => {
        if (item.id === message.id) {
          return { ...item, content: 'This message was deleted', is_deleted: true, reactions: [] }
        }
        if (item.replyPreview?.id === message.id) {
          return {
            ...item,
            replyPreview: { ...item.replyPreview, content: 'This message was deleted', is_deleted: true },
          }
        }
        return item
      }))
      setMessageMenuFor(null)
      setActiveMessageActionsFor(null)
      setReactionPickerFor(null)
    } catch (unsendError) {
      setError(describeMessageError(unsendError, 'Could not unsend this message.'))
    }
  }

  const toggleInfoSection = (section: typeof infoSection) => {
    setInfoSection((current) => current === section ? null : section)
  }

  const saveConversationPreference = async <K extends keyof ConversationPreferences>(
    partnerId: string,
    key: K,
    value: ConversationPreferences[K],
  ) => {
    if (!currentUserId) return
    const previous = conversationPreferencesRef.current.get(partnerId) ?? DEFAULT_CONVERSATION_PREFERENCES
    const next = { ...previous, [key]: value }
    conversationPreferencesRef.current = new Map(conversationPreferencesRef.current).set(partnerId, next)
    setConversationPreferences(conversationPreferencesRef.current)
    setSavingChatPreferences(true)
    setError(null)
    try {
      const supabase = getSupabaseClient()
      const saveResult = key === 'pinned'
        ? await supabase
          .from('community_conversation_preferences')
          .upsert({
            user_id: currentUserId,
            partner_id: partnerId,
            pinned: value,
          }, { onConflict: 'user_id,partner_id' })
        : await supabase.rpc('set_community_shared_conversation_preference', {
          p_partner_id: partnerId,
          p_key: key,
          p_value: String(value),
        })
      const saveError = saveResult.error
      if (saveError) throw saveError
      if (key !== 'pinned' && previous[key] !== value && selectedUserId === partnerId) {
        setLatestConversationUpdate({
          actor_id: currentUserId,
          preference_key: key === 'nickname_self' || key === 'nickname_partner' ? 'nickname' : key,
          preference_value: String(value),
          created_at: new Date().toISOString(),
        })
      }
      setStatusMessage('Chat settings saved.')
    } catch (saveError) {
      if (conversationPreferencesRef.current.get(partnerId) === next) {
        conversationPreferencesRef.current = new Map(conversationPreferencesRef.current).set(partnerId, previous)
        setConversationPreferences(conversationPreferencesRef.current)
      }
      setError(describeMessageError(saveError, 'Could not save chat customization.'))
    } finally {
      setSavingChatPreferences(false)
    }
  }

  const saveGlobalChatPreference = async <K extends keyof GlobalChatPreferences>(
    key: K,
    value: GlobalChatPreferences[K],
  ) => {
    if (!currentUserId) return
    const previous = globalChatPreferencesRef.current
    const next = { ...previous, [key]: value }
    globalChatPreferencesRef.current = next
    setGlobalChatPreferences(next)
    setSavingChatPreferences(true)
    setError(null)
    try {
      const { error: saveError } = await getSupabaseClient()
        .from('community_chat_preferences')
        .upsert({ user_id: currentUserId, ...next }, { onConflict: 'user_id' })
      if (saveError) throw saveError
      setStatusMessage('Chat settings saved.')
    } catch (saveError) {
      if (globalChatPreferencesRef.current === next) {
        globalChatPreferencesRef.current = previous
        setGlobalChatPreferences(previous)
      }
      setError(describeMessageError(saveError, 'Could not save chat accessibility preferences.'))
    } finally {
      setSavingChatPreferences(false)
    }
  }

  const setConversationMuteDuration = async (partnerId: string, duration: MuteDuration) => {
    if (!currentUserId) return
    setUpdatingConversation(partnerId)
    setError(null)
    try {
      const supabase = getSupabaseClient()
      if (duration === 'off') {
        const { error: deleteError } = await supabase.from('community_conversation_mutes')
          .delete()
          .eq('user_id', currentUserId)
          .eq('partner_id', partnerId)
        if (deleteError) throw deleteError
        setMutedConversations((current) => {
          const next = new Map(current)
          next.delete(partnerId)
          return next
        })
        setStatusMessage('Notifications are on for this conversation.')
        window.dispatchEvent(new Event('storylines:messages-updated'))
        return
      }
      const durationMilliseconds: Partial<Record<MuteDuration, number>> = {
        '1h': 60 * 60 * 1000,
        '8h': 8 * 60 * 60 * 1000,
        '1d': 24 * 60 * 60 * 1000,
        '1w': 7 * 24 * 60 * 60 * 1000,
      }
      const expiresAt = duration === 'always'
        ? null
        : new Date(Date.now() + durationMilliseconds[duration]!).toISOString()
      const { error: upsertError } = await supabase.from('community_conversation_mutes')
        .upsert({
          user_id: currentUserId,
          partner_id: partnerId,
          expires_at: expiresAt,
        }, { onConflict: 'user_id,partner_id' })
      if (upsertError) throw upsertError
      setMutedConversations((current) => new Map(current).set(partnerId, expiresAt))
      setStatusMessage(duration === 'always'
        ? 'Notifications are muted until you turn them back on.'
        : `Notifications are muted for ${duration === '1h' ? '1 hour' : duration === '8h' ? '8 hours' : duration === '1d' ? '1 day' : '1 week'}.`)
      window.dispatchEvent(new Event('storylines:messages-updated'))
    } catch (muteError) {
      setError(describeMessageError(muteError, 'Could not update notification settings for this conversation.'))
    } finally {
      setUpdatingConversation(null)
    }
  }

  const markConversationUnread = async (partnerId: string) => {
    if (!currentUserId) return
    setUpdatingConversation(partnerId)
    setError(null)
    try {
      const { error: updateError } = await getSupabaseClient().from('community_direct_messages')
        .update({ read_at: null })
        .eq('sender_id', partnerId)
        .eq('recipient_id', currentUserId)
        .eq('is_deleted', false)
      if (updateError) throw updateError
      setMessages((current) => current.map((message) => message.sender_id === partnerId && message.recipient_id === currentUserId
        ? { ...message, read_at: null }
        : message))
      if (selectedUserId === partnerId) {
        setSelectedUserId(null)
        setInfoPanelOpen(false)
        router.replace('/messages', { scroll: false })
      }
      setStatusMessage('Conversation marked as unread.')
      window.dispatchEvent(new Event('storylines:messages-updated'))
    } catch (updateError) {
      setError(describeMessageError(updateError, 'Could not mark this conversation as unread.'))
    } finally {
      setUpdatingConversation(null)
    }
  }

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const content = draft.trim()
    if (!currentUserId || !selectedUserId) return
    if (!content || content.length > 2000) {
      setError('Write a message between 1 and 2,000 characters.')
      return
    }
    if (messageAccessLoading || !messageAccess) return
    if (messageAccess.account_blocked || messageAccess.request_pending) return
    if (!messageAccess.can_send_direct && !messageAccess.can_send_request) {
      setError('You cannot message this account.')
      return
    }
    setSending(true)
    setError(null)
    try {
      if (!messageAccess.can_send_direct) {
        const { data: requestId, error: requestError } = await getSupabaseClient()
          .rpc('submit_community_message_request', {
            p_recipient_id: selectedUserId,
            p_content: content,
          })
        if (requestError) throw requestError
        if (typeof requestId !== 'string') {
          throw new Error('Supabase did not return the submitted message request ID.')
        }
        setMessageRequests((current) => [
          {
            id: requestId,
            sender_id: currentUserId,
            recipient_id: selectedUserId,
            content,
            created_at: new Date().toISOString(),
          },
          ...current.filter((request) => request.id !== requestId),
        ])
        setMessageAccess({
          ...messageAccess,
          can_send_request: false,
          request_pending: true,
        })
        setDraft('')
        setReplyingTo(null)
        return
      }
      const { data, error: sendError } = await getSupabaseClient()
        .from('community_direct_messages')
        .insert({
          sender_id: currentUserId,
          recipient_id: selectedUserId,
          content,
          reply_to_message_id: replyingTo?.id ?? null,
        })
        .select('id, sender_id, recipient_id, content, is_deleted, created_at, read_at, reply_to_message_id, work_id')
        .single()
      if (sendError) throw sendError
      const newMessage: Message = {
        ...data,
        reply_to_message_id: replyingTo?.id ?? null,
        reactions: [],
      }
      setMessages((current) => [...current, newMessage])
      setDraft('')
      setReplyingTo(null)
      if (!selectedPerson) setReloadVersion((version) => version + 1)
    } catch (sendError) {
      setError(describeMessageError(sendError, 'Could not send your message.'))
    } finally {
      setSending(false)
    }
  }

  const handleComposerKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key !== 'Enter'
      || event.shiftKey
      || event.nativeEvent.isComposing
      || event.nativeEvent.keyCode === 229
      || sending
      || !draft.trim()
    ) return
    event.preventDefault()
    event.currentTarget.form?.requestSubmit()
  }

  const respondToMessageRequest = async (request: MessageRequest, action: 'accept' | 'decline') => {
    setRequestActionLoading(request.id)
    setError(null)
    try {
      const { error: responseError } = await getSupabaseClient()
        .rpc('respond_to_community_message_request', {
          p_request_id: request.id,
          p_action: action,
        })
      if (responseError) throw responseError
      setMessageRequests((current) => current.filter((item) => item.id !== request.id))
      if (action === 'accept') {
        setFilter('all')
        setSelectedUserId(request.sender_id)
        router.replace(`/messages?user=${encodeURIComponent(request.sender_id)}`, { scroll: false })
      }
      setReloadVersion((version) => version + 1)
    } catch (responseError) {
      setError(describeMessageError(responseError, `Could not ${action} this message request.`))
    } finally {
      setRequestActionLoading(null)
    }
  }

  const setAccountControl = async (accountId: string, status: 'restricted' | 'blocked' | 'none') => {
    setUpdatingConversation(accountId)
    setError(null)
    try {
      const { error: controlError } = await getSupabaseClient()
        .rpc('set_community_message_account_control', {
          p_account_id: accountId,
          p_status: status,
        })
      if (controlError) throw controlError
      setAccountControls((current) => {
        const withoutAccount = current.filter((control) => control.account_id !== accountId)
        return status === 'none'
          ? withoutAccount
          : [...withoutAccount, { account_id: accountId, status, created_at: new Date().toISOString() }]
      })
      if (status !== 'none') {
        setConversationStates((current) => new Map(current).set(accountId, {
          status: 'deleted',
          updated_at: new Date().toISOString(),
        }))
        setMessages((current) => current.filter((message) => (
          message.sender_id === currentUserId ? message.recipient_id : message.sender_id
        ) !== accountId))
        if (selectedUserId === accountId) {
          setSelectedUserId(null)
          setInfoPanelOpen(false)
          router.replace('/messages', { scroll: false })
        }
      }
      setInfoSection('privacy')
      setReloadVersion((version) => version + 1)
      if (status === 'blocked') router.replace('/settings/privacy#blocked-accounts')
    } catch (controlError) {
      setError(describeMessageError(controlError, 'Could not update this account control.'))
    } finally {
      setUpdatingConversation(null)
    }
  }

  const toggleConversationMute = () => {
    if (!selectedUserId) return
    void setConversationMuteDuration(selectedUserId, selectedMuteDuration === 'off' ? 'always' : 'off')
  }

  const shareWork = async (work: (typeof works)[number]) => {
    if (!currentUserId || !selectedUserId || work.status === 'Draft' || (work.type !== 'story' && work.type !== 'comic')) return
    setSending(true)
    setError(null)
    try {
      const { data, error: shareError } = await getSupabaseClient()
        .from('community_direct_messages')
        .insert({
          sender_id: currentUserId,
          recipient_id: selectedUserId,
          content: `Shared a work: ${work.title}`,
          work_id: work.id,
        })
        .select('id, sender_id, recipient_id, content, is_deleted, created_at, read_at, reply_to_message_id, work_id')
        .single()
      if (shareError) throw shareError
      const sharedMessage: Message = {
        ...data,
        reactions: [],
        sharedWork: {
          id: work.id,
          title: work.title,
          type: work.type,
          cover_image_url: work.coverImageUrl ?? null,
        },
      }
      setMessages((current) => current.some((message) => message.id === sharedMessage.id)
        ? current
        : [...current, sharedMessage])
      setShareWorkOpen(false)
      setStatusMessage('Work shared in your conversation.')
      window.dispatchEvent(new Event('storylines:messages-updated'))
    } catch (shareError) {
      setError(describeMessageError(shareError, 'Could not share this work.'))
    } finally {
      setSending(false)
    }
  }

  const submitReport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!currentUserId || !selectedUserId) return
    setReporting(true)
    setError(null)
    setStatusMessage(null)
    try {
      const reportedMessage = [...threadMessages].reverse().find((message) => message.sender_id === selectedUserId)
      const { error: reportError } = await getSupabaseClient()
        .from('community_message_reports')
        .insert({
          reporter_id: currentUserId,
          reported_user_id: selectedUserId,
          message_id: reportedMessage?.id ?? null,
          reason: reportReason,
          details: reportDetails.trim(),
        })
      if (reportError) throw reportError
      setReportOpen(false)
      setReportDetails('')
      setReportReason('other')
      setStatusMessage('Report submitted. Thank you for helping keep StoryLines safe.')
    } catch (reportError) {
      setError(describeMessageError(reportError, 'Could not submit this report.'))
    } finally {
      setReporting(false)
    }
  }

  const confirmAction = async () => {
    const pendingConfirmation = confirmation
    if (!pendingConfirmation) return
    setConfirmation(null)
    if (pendingConfirmation.kind === 'conversation') {
      await updateConversationStatus(pendingConfirmation.partnerId, pendingConfirmation.status)
    } else {
      await setAccountControl(pendingConfirmation.accountId, pendingConfirmation.status)
    }
  }

  const reactToMessage = async (message: Message, emoji: string) => {
    if (!currentUserId) return
    const myReaction = message.reactions?.find((reaction) => reaction.reactedByMe)
    const isRemovingReaction = myReaction?.emoji === emoji
    try {
      const supabase = getSupabaseClient()
      const result = isRemovingReaction
        ? await supabase.from('community_message_reactions')
          .delete()
          .eq('message_id', message.id)
          .eq('user_id', currentUserId)
        : myReaction
          ? await supabase.from('community_message_reactions')
            .update({ reaction: emoji })
            .eq('message_id', message.id)
            .eq('user_id', currentUserId)
          : await supabase.from('community_message_reactions')
            .insert({ message_id: message.id, user_id: currentUserId, reaction: emoji })
      if (result.error) throw result.error
      setMessages((current) => current.map((item) => {
        if (item.id !== message.id) return item
        const reactions = new Map((item.reactions ?? []).map((reaction) => [reaction.emoji, { ...reaction }]))
        if (isRemovingReaction && myReaction) {
          const next = reactions.get(emoji)
          if (next) {
            next.count -= 1
            next.reactedByMe = false
            if (next.count <= 0) reactions.delete(emoji)
          }
        } else {
          for (const [key, reaction] of reactions) {
            if (reaction.reactedByMe) {
              reaction.count -= 1
              reaction.reactedByMe = false
              if (reaction.count <= 0) reactions.delete(key)
            }
          }
          const next = reactions.get(emoji) ?? { emoji, count: 0, reactedByMe: false }
          next.count += 1
          next.reactedByMe = true
          reactions.set(emoji, next)
        }
        return { ...item, reactions: [...reactions.values()] }
      }))
      setReactionPickerFor(null)
    } catch (reactionError) {
      setError(describeMessageError(reactionError, 'Could not save this reaction.'))
    }
  }

  const copyMessage = async (message: Message) => {
    try {
      await navigator.clipboard.writeText(message.content)
      setMessageMenuFor(null)
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : 'Could not copy this message.')
    }
  }

  const selectConversation = (userId: string) => {
    setSelectedUserId(userId)
    setConversationMenuFor(null)
    setNewMessageOpen(false)
    setReplyingTo(null)
    router.replace(`/messages?user=${encodeURIComponent(userId)}`, { scroll: false })
  }

  const updateConversationStatus = async (partnerId: string, status: ConversationStatus) => {
    if (!currentUserId || updatingConversation) return
    setUpdatingConversation(partnerId)
    setError(null)
    try {
      const { data, error: updateError } = await getSupabaseClient()
        .rpc('set_community_conversation_state', { p_partner_id: partnerId, p_status: status })
        .single()
      if (updateError) throw updateError
      if (!isConversationStateResult(data)) throw new Error('Supabase returned an invalid conversation state.')
      setConversationStates((current) => new Map(current).set(data.partner_id, {
        status: data.status,
        updated_at: data.updated_at,
      }))
      if (status === 'deleted') {
        setMessages((current) => current.filter((message) => (
          message.sender_id === currentUserId ? message.recipient_id : message.sender_id
        ) !== partnerId))
      }
      setConversationMenuFor(null)
      if (selectedUserId === partnerId && status !== 'active') {
        setSelectedUserId(null)
        setInfoPanelOpen(false)
        router.replace('/messages', { scroll: false })
      }
    } catch (updateError) {
      setError(describeMessageError(updateError, 'Could not update this conversation.'))
    } finally {
      setUpdatingConversation(null)
    }
  }

  return (
    <div className="h-full min-h-0 w-full">
      <div className={`relative grid h-full min-h-0 w-full grid-cols-1 overflow-hidden bg-card md:grid-cols-[18rem_minmax(0,1fr)] ${infoPanelOpen ? 'lg:grid-cols-[18rem_minmax(0,1fr)_20rem]' : ''}`}>
        <aside className={`flex min-h-0 min-w-0 flex-col overflow-y-auto border-border md:border-r ${selectedUserId ? 'hidden md:flex' : ''}`} aria-label="Conversations">
          <div className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 border-b border-border bg-card px-3">
            <Link href="/" className="flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Back to StoryLines">
              <ArrowLeft className="size-5" />
            </Link>
            <div className="min-w-0">
              <p className="eyebrow">Your inbox</p>
              <h1 className="truncate font-serif text-lg font-bold leading-5">My Messages</h1>
            </div>
            <button
              type="button"
              onClick={() => { setNewMessageSearch(''); setNewMessageOpen(true) }}
              className="ml-auto inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-accent px-3.5 text-xs font-bold text-accent-foreground hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <PenLine className="size-4" /> New
            </button>
          </div>
          {(filter === 'all' || filter === 'unread' || filter === 'requests' || filter === 'archived' || filter === 'restricted') && (
            <div className="flex h-13 shrink-0 items-center gap-2 border-b border-border bg-card px-3">
              <label htmlFor="inbox-search" className="sr-only">Search chats</label>
              <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-input bg-background px-3">
                <Search className="size-4 shrink-0 text-muted-foreground" />
                <input
                  id="inbox-search"
                  value={inboxSearchQuery}
                  onChange={(event) => setInboxSearchQuery(event.target.value)}
                  placeholder="Search chats"
                  className="min-h-10 min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
                />
                {inboxSearchQuery && (
                  <button type="button" onClick={() => setInboxSearchQuery('')} className="flex size-8 items-center justify-center rounded-full hover:bg-muted" aria-label="Clear chat search">
                    <X className="size-4" />
                  </button>
                )}
              </div>
              <label htmlFor="message-filter" className="sr-only">Filter messages</label>
              <select
                id="message-filter"
                value={filter}
                onChange={(event) => {
                  const nextFilter = event.target.value
                  if (nextFilter === 'all' || nextFilter === 'unread' || nextFilter === 'requests'
                    || nextFilter === 'archived' || nextFilter === 'restricted') setFilter(nextFilter)
                }}
                className="min-h-10 shrink-0 rounded-full border border-border bg-card px-3 text-xs font-bold text-foreground"
              >
                <option value="all">All</option>
                <option value="unread">Unread ({unreadMessageCount})</option>
                <option value="requests">Requests ({visibleMessageRequests.length})</option>
                <option value="archived">Archived</option>
                <option value="restricted">Restricted</option>
              </select>
            </div>
          )}
          {loading ? (
            <div className="space-y-3 p-4" aria-busy="true" aria-label="Loading messages">{[0, 1, 2].map((item) => <div key={item} className="h-16 animate-pulse rounded-xl bg-secondary/60" />)}</div>
          ) : filter === 'requests' ? (
            visibleMessageRequests.length ? (
              <ul className="divide-y divide-border">
                {visibleMessageRequests.map((request) => {
                  const person = people.get(request.sender_id)
                  if (!person) return null
                  return (
                    <li key={request.id} className="space-y-3 bg-card p-4">
                      <div className="flex items-center gap-3">
                        <ProfileAvatar src={person.avatarUrl} name={person.name} />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold">{person.name}</p>
                          <p className="text-xs text-muted-foreground">@{person.username}</p>
                        </div>
                      </div>
                      <p className="break-words rounded-xl bg-muted px-3 py-2 text-sm leading-5">{request.content}</p>
                      <div className="grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => { setSelectedUserId(request.sender_id); router.replace(`/messages?user=${encodeURIComponent(request.sender_id)}`, { scroll: false }) }} className="inline-flex min-h-11 items-center justify-center rounded-full bg-accent px-3 text-xs font-bold text-accent-foreground">
                          View request
                        </button>
                        <button type="button" onClick={() => void respondToMessageRequest(request, 'decline')} disabled={requestActionLoading === request.id} className="inline-flex min-h-11 items-center justify-center rounded-full border border-border px-3 text-xs font-bold disabled:opacity-50">
                          {requestActionLoading === request.id ? 'Working…' : 'Delete / Reject'}
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <div className="px-5 py-12 text-center"><h2 className="font-serif text-lg font-bold">No message requests</h2><p className="mt-2 text-sm text-muted-foreground">Requests from people you don’t follow will appear here.</p></div>
            )
          ) : filter === 'restricted' ? (
            (() => {
              const controls = accountControls.filter((control) => control.status === 'restricted')
              const restrictedAccounts = new Set(controls.map((control) => control.account_id))
              const incomingRestricted = filter === 'restricted'
                ? restrictedIncomingRequests.filter((request) => !restrictedAccounts.has(request.sender_id))
                : []
              return controls.length || incomingRestricted.length ? (
                <ul className="divide-y divide-border">
                  {controls.map((control) => {
                    const person = people.get(control.account_id)
                    if (!person) return null
                    return (
                      <li key={control.account_id} className="flex min-h-20 items-center gap-3 bg-card px-4 py-3">
                        <ProfileAvatar src={person.avatarUrl} name={person.name} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold">{person.name}</p>
                          <p className="truncate text-xs text-muted-foreground">@{person.username}</p>
                        </div>
                        <button type="button" onClick={() => void setAccountControl(control.account_id, 'none')} disabled={updatingConversation === control.account_id} className="min-h-10 shrink-0 rounded-full border border-border px-3 text-xs font-bold hover:border-accent hover:text-accent disabled:opacity-50">
                          Unrestrict
                        </button>
                      </li>
                    )
                  })}
                  {incomingRestricted.map((request) => {
                    const person = people.get(request.sender_id)
                    if (!person) return null
                    return (
                      <li key={request.id} className="flex min-h-20 items-center gap-3 bg-card px-4 py-3">
                        <ProfileAvatar src={person.avatarUrl} name={person.name} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold">{person.name}</p>
                          <p className="truncate text-xs text-muted-foreground">Hidden message request</p>
                        </div>
                        <button type="button" onClick={() => { setSelectedUserId(request.sender_id); router.replace(`/messages?user=${encodeURIComponent(request.sender_id)}`, { scroll: false }) }} className="min-h-10 shrink-0 rounded-full border border-border px-3 text-xs font-bold hover:border-accent hover:text-accent">
                          View
                        </button>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <div className="px-5 py-12 text-center"><h2 className="font-serif text-lg font-bold">No restricted accounts</h2><p className="mt-2 text-sm text-muted-foreground">Accounts you restrict will appear here.</p></div>
              )
            })()
          ) : filteredConversations.length ? (
            <ul className="divide-y divide-border">
              {filteredConversations.map((conversation) => {
                const person = people.get(conversation.partnerId)
                if (!person) return null
                const chatPreferences = conversationPreferences.get(person.id) ?? DEFAULT_CONVERSATION_PREFERENCES
                const personDisplayName = chatPreferences.nickname_partner.trim() || person.name
                return (
                  <li
                    key={person.id}
                    ref={conversationMenuFor === person.id ? conversationMenuRef : null}
                    onPointerDown={(event) => {
                      if (event.pointerType !== 'touch') return
                      longPressTriggeredRef.current = false
                      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current)
                      longPressTimerRef.current = setTimeout(() => {
                        longPressTriggeredRef.current = true
                        setConversationMenuFor(person.id)
                      }, 500)
                    }}
                    onPointerUp={cancelMessageLongPress}
                    onPointerLeave={cancelMessageLongPress}
                    onPointerCancel={cancelMessageLongPress}
                    onContextMenu={(event) => {
                      event.preventDefault()
                      setConversationMenuFor(person.id)
                    }}
                    className={`group relative flex min-h-16 items-center gap-1 px-3 ${selectedUserId === person.id ? 'bg-secondary' : 'bg-card hover:bg-muted'}`}
                  >
                    <button type="button" onClick={() => {
                      if (longPressTriggeredRef.current) {
                        longPressTriggeredRef.current = false
                        return
                      }
                      selectConversation(person.id)
                    }} className="flex min-h-16 min-w-0 flex-1 items-center gap-3 py-2 text-left">
                      <ProfileAvatar src={person.avatarUrl} name={personDisplayName} />
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-sm ${conversation.unread ? 'font-extrabold' : 'font-bold'}`}>{personDisplayName}</span>
                        <span className={`block truncate text-xs ${conversation.unread ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>{conversation.latest.sender_id === currentUserId ? 'You: ' : ''}{conversation.latest.work_id ? 'Shared a work' : conversation.latest.content}</span>
                      </span>
                      <time dateTime={conversation.latest.created_at} className="shrink-0 text-[10px] text-muted-foreground">{conversationTimeLabel(conversation.latest.created_at)}</time>
                      {isMuteActive(mutedConversations.get(person.id)) && <BellOff className="size-4 shrink-0 text-muted-foreground" aria-label="Muted conversation" />}
                      {conversation.pinned && <Pin className="size-4 shrink-0 text-accent" aria-label="Pinned conversation" />}
                      {conversation.unread > 0 && conversation.status === 'active' && <span className="size-2 shrink-0 rounded-full bg-accent" aria-label={`${conversation.unread} unread messages`} />}
                    </button>
                    <div className="relative shrink-0">
                      <button type="button" onClick={() => setConversationMenuFor((current) => current === person.id ? null : person.id)} disabled={updatingConversation === person.id} className="flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-background focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100" aria-label={`More options for conversation with ${personDisplayName}`} aria-expanded={conversationMenuFor === person.id}>
                        <MoreVertical className="size-5" />
                      </button>
                      {conversationMenuFor === person.id && (
                        <div className="absolute right-0 top-full z-20 mt-1 min-w-64 rounded-xl border border-border bg-card p-2 shadow-lg">
                          {conversation.status === 'archived' ? (
                            <button type="button" onClick={() => void updateConversationStatus(person.id, 'active')} className="flex min-h-12 w-full items-center gap-3 rounded-lg px-4 text-left text-base font-semibold hover:bg-muted">
                              <Archive className="size-5 shrink-0" /> Unarchive conversation
                            </button>
                          ) : (
                            <button type="button" onClick={() => { setConfirmation({ kind: 'conversation', partnerId: person.id, status: 'archived' }); setConversationMenuFor(null) }} className="flex min-h-12 w-full items-center gap-3 rounded-lg px-4 text-left text-base font-semibold hover:bg-muted">
                              <Archive className="size-5 shrink-0" /> Archive conversation
                            </button>
                          )}
                          <button type="button" onClick={() => { void saveConversationPreference(person.id, 'pinned', !conversation.pinned); setConversationMenuFor(null) }} className="flex min-h-12 w-full items-center gap-3 rounded-lg px-4 text-left text-base font-semibold hover:bg-muted">
                            <Pin className="size-5 shrink-0" />{conversation.pinned ? 'Unpin conversation' : 'Pin to top'}
                          </button>
                          <button type="button" onClick={() => { void markConversationUnread(person.id); setConversationMenuFor(null) }} className="flex min-h-12 w-full items-center gap-3 rounded-lg px-4 text-left text-base font-semibold hover:bg-muted">
                            <MailOpen className="size-5 shrink-0" /> Mark as unread
                          </button>
                          {accountControls.some((control) => control.account_id === person.id && control.status === 'restricted') ? (
                            <button type="button" onClick={() => { void setAccountControl(person.id, 'none'); setConversationMenuFor(null) }} disabled={updatingConversation === person.id} className="flex min-h-12 w-full items-center gap-3 rounded-lg px-4 text-left text-base font-semibold hover:bg-muted disabled:opacity-50">
                              <Shield className="size-5 shrink-0" /> Unrestrict account
                            </button>
                          ) : (
                            <button type="button" onClick={() => { void setAccountControl(person.id, 'restricted'); setConversationMenuFor(null) }} disabled={updatingConversation === person.id} className="flex min-h-12 w-full items-center gap-3 rounded-lg px-4 text-left text-base font-semibold hover:bg-muted disabled:opacity-50">
                              <Shield className="size-5 shrink-0" /> Restrict account
                            </button>
                          )}
                          {accountControls.some((control) => control.account_id === person.id && control.status === 'blocked') ? (
                            <button type="button" onClick={() => { void setAccountControl(person.id, 'none'); setConversationMenuFor(null) }} disabled={updatingConversation === person.id} className="flex min-h-12 w-full items-center gap-3 rounded-lg px-4 text-left text-base font-semibold hover:bg-muted disabled:opacity-50">
                              <Ban className="size-5 shrink-0" /> Unblock account
                            </button>
                          ) : (
                            <button type="button" onClick={() => { setConfirmation({ kind: 'account', accountId: person.id, status: 'blocked' }); setConversationMenuFor(null) }} disabled={updatingConversation === person.id} className="flex min-h-12 w-full items-center gap-3 rounded-lg px-4 text-left text-base font-semibold text-destructive hover:bg-muted disabled:opacity-50">
                              <Ban className="size-5 shrink-0" /> Block account
                            </button>
                          )}
                          <button type="button" onClick={() => { setConfirmation({ kind: 'conversation', partnerId: person.id, status: 'deleted' }); setConversationMenuFor(null) }} className="flex min-h-12 w-full items-center gap-3 rounded-lg px-4 text-left text-base font-semibold text-destructive hover:bg-muted">
                            <Trash2 className="size-5 shrink-0" /> Delete conversation
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <div className="px-5 py-12 text-center">
              <h2 className="font-serif text-lg font-bold">{inboxSearchQuery.trim()
                ? 'No chats match your search'
                : filter === 'unread' ? 'No unread messages' : filter === 'archived' ? 'No archived conversations' : 'Your messages will appear here'}</h2>
              {filter === 'all' && !inboxSearchQuery.trim() && <>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">Start a conversation from a creator’s profile to connect with the people behind the stories.</p>
                <button type="button" onClick={() => router.push('/browse')} className="mt-3 min-h-11 rounded-full bg-accent px-4 text-sm font-bold text-accent-foreground">Find creators</button>
              </>}
            </div>
          )}
          {hasMoreMessages && (filter === 'all' || filter === 'unread' || filter === 'archived') && (
            <div className="border-t border-border p-3">
              <button type="button" onClick={() => void loadOlderMessages()} disabled={loadingOlder} className="min-h-11 w-full rounded-lg text-sm font-bold text-accent hover:bg-muted disabled:opacity-50">
                {loadingOlder ? 'Loading older messages…' : 'Load older messages'}
              </button>
            </div>
          )}
        </aside>

        <section className={`flex min-h-0 min-w-0 flex-col ${selectedUserId ? '' : 'hidden md:flex'}`} aria-label="Message conversation">
          {selectedUserId && selectedPerson ? (
            <>
              <header className="flex min-h-16 shrink-0 items-center gap-3 border-b border-border bg-secondary px-4 py-3">
                <button type="button" onClick={() => { setSelectedUserId(null); router.replace('/messages', { scroll: false }) }} className="flex size-11 items-center justify-center rounded-full hover:bg-muted md:hidden" aria-label="Back to messages"><ArrowLeft className="size-5" /></button>
                <Link href={`/profile/${encodeURIComponent(selectedPerson.id)}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left hover:opacity-80" aria-label={`View ${selectedPartnerName}'s profile`}>
                  <ProfileAvatar src={selectedPerson.avatarUrl} name={selectedPartnerName} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold">{selectedPartnerName}</span>
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span>@{selectedPerson.username}</span>
                      <span aria-hidden="true">·</span>
                      <span className="inline-flex items-center gap-1">
                        <span className={`size-1.5 rounded-full ${partnerOnline ? 'bg-green-500' : 'bg-muted-foreground/50'}`} />
                        {partnerOnline ? 'Active now' : 'Offline'}
                      </span>
                    </span>
                    {selectedChatPreferences.nickname_self.trim() && (
                      <span className="block truncate text-[10px] text-muted-foreground">You as {selectedSelfName}</span>
                    )}
                  </span>
                </Link>
                <button type="button" onClick={() => { setConversationSearchOpen((open) => !open); setSearchQuery('') }} className="hidden size-11 shrink-0 items-center justify-center rounded-full text-foreground hover:bg-background/70 lg:inline-flex" aria-label={conversationSearchOpen ? 'Close search' : 'Search conversation'} aria-expanded={conversationSearchOpen}>
                  <Search className="size-5" />
                </button>
                <button type="button" onClick={() => setInfoPanelOpen((open) => !open)} className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-foreground hover:bg-background/70" aria-label={infoPanelOpen ? 'Close conversation info' : 'Open conversation info'} aria-expanded={infoPanelOpen}>
                  {infoPanelOpen ? <X className="size-5" /> : <Info className="size-5" />}
                </button>
              </header>
              {conversationSearchOpen && (
                <div className="border-b border-border bg-secondary px-4 py-2">
                  <label htmlFor="conversation-search" className="sr-only">Search this conversation</label>
                  <div className="flex items-center gap-2 rounded-xl border border-input bg-background px-3">
                    <Search className="size-4 shrink-0 text-muted-foreground" />
                    <input id="conversation-search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search messages" className="min-h-10 min-w-0 flex-1 bg-transparent text-sm outline-none" />
                    <button type="button" onClick={() => { setConversationSearchOpen(false); setSearchQuery('') }} className="flex size-8 items-center justify-center rounded-full hover:bg-muted" aria-label="Close search"><X className="size-4" /></button>
                  </div>
                </div>
              )}
              <div
                className={`chat-message-list min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 sm:p-6 ${globalChatPreferences.reduce_motion ? 'chat-reduce-motion' : ''}`}
                style={{ backgroundColor: selectedChatBackground.background, color: selectedChatBackground.foreground }}
                aria-live="polite"
              >
                {latestConversationUpdate && latestUpdateDescription && (
                  <div className="my-5 flex items-center gap-3" role="status" aria-live="polite">
                    <span className="h-px flex-1 bg-border" />
                    <div className="flex max-w-full items-center gap-3 rounded-2xl border border-border bg-card/80 px-4 py-2.5 shadow-sm">
                      <span className="min-w-0 text-center text-xs leading-5">
                        <span className="font-bold">{latestUpdateActor}</span> {latestUpdateDescription}.
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setInfoSection('customize')
                          setInfoPanelOpen(true)
                        }}
                        className="min-h-9 shrink-0 rounded-full border border-border bg-background px-3 text-xs font-bold hover:border-accent hover:text-accent"
                      >
                        Change
                      </button>
                    </div>
                    <span className="h-px flex-1 bg-border" />
                  </div>
                )}
                {displayedThreadMessages.length ? displayedThreadMessages.map((message, index) => {
                  const isMine = message.sender_id === currentUserId
                  const reply = threadMessages.find((item) => item.id === message.reply_to_message_id) ?? message.replyPreview
                  const sender = isMine ? selectedSelfName : selectedPartnerName
                  const showActions = !message.is_deleted && activeMessageActionsFor === message.id
                  const messageDate = new Date(message.created_at)
                  const previousMessage = index > 0 ? displayedThreadMessages[index - 1] : null
                  const previousMessageDate = previousMessage ? new Date(previousMessage.created_at) : null
                  const startsSenderGroup = !previousMessage
                    || previousMessage.sender_id !== message.sender_id
                    || !sameMessageDay(messageDate, new Date(previousMessage.created_at))
                  return (
                    <Fragment key={message.id}>
                    {(!previousMessageDate || !sameMessageDay(messageDate, previousMessageDate)) && (
                      <div className="my-5 flex items-center gap-3" role="separator" aria-label={messageDateLabel(messageDate)}>
                        <span className="h-px flex-1 bg-border" />
                        <time dateTime={messageDate.toISOString()} className="rounded-full bg-card px-3 py-1 text-xs font-semibold text-muted-foreground">
                          {messageDateLabel(messageDate)}
                        </time>
                        <span className="h-px flex-1 bg-border" />
                      </div>
                    )}
                    <div className={`group flex items-end gap-2 ${isMine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`flex max-w-[min(82%,38rem)] flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                        {startsSenderGroup && (
                          <div className={`mb-1 flex items-center gap-2 px-1 text-[11px] text-muted-foreground ${isMine ? 'justify-end' : ''}`}>
                            {!isMine && <ProfileAvatar src={selectedPerson.avatarUrl} name={selectedPartnerName} className="size-7" imageSizes="28px" />}
                            <time dateTime={message.created_at}>{new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
                            <span>{sender}</span>
                            {isMine && <ProfileAvatar src={people.get(currentUserId ?? '')?.avatarUrl} name={selectedSelfName} className="size-7" imageSizes="28px" />}
                          </div>
                        )}
                        <div ref={showActions || reactionPickerFor === message.id ? activeMessageRef : null} className={`flex items-center gap-1 ${isMine ? 'flex-row-reverse' : ''}`}>
                          <div className="relative max-w-full">
                            <div
                              role={message.is_deleted ? undefined : 'button'}
                              tabIndex={message.is_deleted ? undefined : 0}
                              onPointerDown={message.is_deleted ? undefined : () => startMessageLongPress(message.id)}
                              onPointerUp={message.is_deleted ? undefined : cancelMessageLongPress}
                              onPointerLeave={message.is_deleted ? undefined : cancelMessageLongPress}
                              onPointerCancel={message.is_deleted ? undefined : cancelMessageLongPress}
                              onDoubleClick={() => {
                                if (!message.is_deleted) void reactToMessage(message, selectedChatPreferences.quick_reaction)
                              }}
                              onClick={() => {
                                if (message.is_deleted) return
                                if (longPressTriggeredRef.current) {
                                  longPressTriggeredRef.current = false
                                  return
                                }
                                setActiveMessageActionsFor((current) => current === message.id ? null : message.id)
                              }}
                              onKeyDown={(event) => {
                                if (message.is_deleted) return
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault()
                                  setActiveMessageActionsFor((current) => current === message.id ? null : message.id)
                                }
                              }}
                              aria-label={message.is_deleted ? 'This message was deleted' : 'Message. Tap for actions or press and hold to react.'}
                              className={`w-fit max-w-full overflow-hidden rounded-2xl px-4 py-2.5 shadow-sm ${message.is_deleted ? 'border border-border bg-muted italic text-muted-foreground' : `cursor-pointer focus-visible:outline-2 focus-visible:outline-ring ${isMine ? 'rounded-br-md' : 'rounded-bl-md bg-card text-card-foreground'} ${globalChatPreferences.high_contrast ? 'border-2 border-foreground' : ''}`}`}
                              style={message.is_deleted ? undefined : isMine ? {
                                backgroundColor: selectedBubbleColor.background,
                                color: selectedBubbleColor.foreground,
                              } : undefined}
                            >
                              {reply && (
                                <div
                                  className={`mb-2 border-l-2 pl-2 text-xs ${isMine ? 'border-primary-foreground/50' : 'border-accent text-muted-foreground'}`}
                                  style={isMine ? { color: selectedBubbleColor.foreground, opacity: 0.8 } : undefined}
                                >
                                  <p className="font-semibold">{reply.sender_id === currentUserId ? selectedSelfName : selectedPartnerName}</p>
                                  <p className="line-clamp-2">{reply.is_deleted ? 'This message was deleted' : reply.content}</p>
                                </div>
                              )}
                              <p className={`whitespace-pre-wrap break-words ${message.is_deleted ? 'text-xs' : textSizeClass}`}>{message.is_deleted ? 'This message was deleted' : message.content}</p>
                              {!message.is_deleted && message.sharedWork && (
                                <Link
                                  href={`/works/${encodeURIComponent(message.sharedWork.id)}`}
                                  onClick={(event) => event.stopPropagation()}
                                  className={`mt-3 flex w-full min-w-56 items-center gap-3 overflow-hidden rounded-xl border p-2 text-left transition hover:opacity-90 ${
                                    isMine ? 'border-primary-foreground/20 bg-primary-foreground/10' : 'border-border bg-background'
                                  }`}
                                >
                                  <span className="relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-secondary text-accent">
                                    {message.sharedWork.cover_image_url
                                      ? <Image src={message.sharedWork.cover_image_url} alt="" fill sizes="56px" className="object-cover" unoptimized />
                                      : <BookOpen className="size-6" />}
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="block text-[10px] font-bold uppercase tracking-wide opacity-70">Shared {message.sharedWork.type}</span>
                                    <span className="mt-1 block truncate text-sm font-bold">{message.sharedWork.title}</span>
                                    <span className="mt-1 block text-xs font-semibold text-accent">Open work</span>
                                  </span>
                                </Link>
                              )}
                              {isMine && !message.is_deleted && message.read_at && (
                                <p className="mt-1 flex items-center justify-end gap-1 text-[10px]" style={{ color: selectedBubbleColor.foreground, opacity: 0.75 }}><Check className="size-3" /> Seen</p>
                              )}
                            </div>
                            {!message.is_deleted && reactionPickerFor === message.id && (
                              <div className={`absolute bottom-full z-10 mb-1 flex gap-1 rounded-full border border-border bg-card p-2 shadow-lg ${isMine ? 'right-0' : 'left-0'}`}>
                                {[selectedChatPreferences.quick_reaction, ...MESSAGE_REACTIONS.filter((emoji) => emoji !== selectedChatPreferences.quick_reaction)].map((emoji) => (
                                  <button key={emoji} type="button" onClick={() => void reactToMessage(message, emoji)} className="emoji-glyph flex size-8 items-center justify-center rounded-full text-lg hover:bg-muted" aria-label={`React ${emoji}`}>
                                    {emoji}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className={`flex items-center gap-1 transition-opacity duration-150 ${showActions ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100'}`}>
                            <button type="button" onClick={() => void reactToMessage(message, selectedChatPreferences.quick_reaction)} className="emoji-glyph inline-flex size-8 items-center justify-center rounded-full text-lg hover:bg-muted" aria-label={`React with ${selectedChatPreferences.quick_reaction}`}>
                              {selectedChatPreferences.quick_reaction}
                            </button>
                            <button type="button" onClick={() => setReactionPickerFor((current) => current === message.id ? null : message.id)} className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted" aria-label="Choose a reaction" aria-expanded={reactionPickerFor === message.id}>
                              <Smile className="size-4" />
                            </button>
                            <button type="button" onClick={() => { setReplyingTo(message); setMessageMenuFor(null); setActiveMessageActionsFor(null) }} className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted" aria-label="Reply to message">
                              <CornerUpLeft className="size-4" />
                            </button>
                            <div className="relative">
                              <button type="button" onClick={() => setMessageMenuFor((current) => current === message.id ? null : message.id)} className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted" aria-label="More message actions" aria-expanded={messageMenuFor === message.id}>
                                <MoreVertical className="size-4" />
                              </button>
                              {messageMenuFor === message.id && (
                                <div className={`absolute bottom-full z-10 mb-1 min-w-36 rounded-xl border border-border bg-card p-1 shadow-lg ${isMine ? 'right-0' : 'left-0'}`}>
                                  <button type="button" onClick={() => void copyMessage(message)} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-xs font-semibold hover:bg-muted">
                                    <Copy className="size-4" /> Copy
                                  </button>
                                  {isMine && (
                                    <button type="button" onClick={() => void unsendMessage(message)} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-xs font-semibold text-destructive hover:bg-destructive/10">
                                      <Trash2 className="size-4" /> Unsend
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        {!message.is_deleted && !!message.reactions?.length && (
                          <div className={`relative z-[1] -mt-2 flex flex-wrap gap-1 ${isMine ? 'self-end mr-2 justify-end' : 'self-start ml-2 justify-start'}`}>
                            {message.reactions.map((reaction) => (
                              <button
                                key={reaction.emoji}
                                type="button"
                                onClick={() => void reactToMessage(message, reaction.emoji)}
                                aria-pressed={reaction.reactedByMe}
                                aria-label={`${reaction.emoji}, ${reaction.count} ${reaction.count === 1 ? 'reaction' : 'reactions'}`}
                                className={`emoji-glyph inline-flex min-h-6 items-center gap-1 rounded-full border px-1.5 text-sm leading-none shadow-sm ${
                                  isMine
                                    ? 'border-primary'
                                    : 'border-border bg-card text-card-foreground'
                                } ${reaction.reactedByMe ? 'ring-1 ring-accent' : ''}`}
                                style={isMine ? { backgroundColor: selectedBubbleColor.background, color: selectedBubbleColor.foreground } : undefined}
                              >
                                <span>{reaction.emoji}</span>{reaction.count > 1 && <span className="font-sans text-[10px]">{reaction.count}</span>}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    </Fragment>
                  )
                }) : <p className="mt-10 text-center text-sm text-muted-foreground">{searchQuery ? 'No messages match your search.' : `Start the conversation with ${selectedPartnerName}.`}</p>}
                {selectedPendingRequest && (
                  <div className="mx-auto mt-5 w-full max-w-xl rounded-2xl border border-border bg-card p-4 shadow-sm">
                    <p className="text-xs font-bold uppercase tracking-wide text-accent">
                      {selectedPendingRequest.sender_id === currentUserId ? 'Message request sent' : 'Message request'}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{selectedPendingRequest.content}</p>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      {selectedPendingRequest.sender_id === currentUserId
                        ? `${selectedPartnerName} must accept before you can chat.`
                        : `${selectedPartnerName} can message you normally after you accept.`}
                    </p>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
              {messageAccessLoading ? (
                <div className="border-t border-border bg-card p-4 text-center text-sm text-muted-foreground" aria-live="polite">Checking message permissions…</div>
              ) : !messageAccess ? (
                <div className="border-t border-border bg-card p-4 text-center text-sm text-muted-foreground">Message permissions are unavailable. Try again after the connection is restored.</div>
              ) : messageAccess.account_blocked ? (
                <div className="border-t border-border bg-card p-4 text-center text-sm text-muted-foreground">Messaging is unavailable because one of these accounts has blocked the other.</div>
              ) : selectedPendingRequest && selectedPendingRequest.recipient_id === currentUserId ? (
                <div className="grid grid-cols-2 gap-3 border-t border-border bg-card p-3 sm:p-4">
                  {selectedAccountControl?.status === 'restricted' ? (
                    <button type="button" onClick={() => void setAccountControl(selectedPerson.id, 'none')} disabled={updatingConversation === selectedPerson.id} className="inline-flex min-h-11 items-center justify-center rounded-full bg-accent px-4 text-sm font-bold text-accent-foreground disabled:opacity-50">
                      {updatingConversation === selectedPerson.id ? 'Working…' : 'Unrestrict to accept'}
                    </button>
                  ) : (
                    <button type="button" onClick={() => void respondToMessageRequest(selectedPendingRequest, 'accept')} disabled={requestActionLoading === selectedPendingRequest.id} className="inline-flex min-h-11 items-center justify-center rounded-full bg-accent px-4 text-sm font-bold text-accent-foreground disabled:opacity-50">
                      {requestActionLoading === selectedPendingRequest.id ? 'Working…' : 'Accept'}
                    </button>
                  )}
                  <button type="button" onClick={() => void respondToMessageRequest(selectedPendingRequest, 'decline')} disabled={requestActionLoading === selectedPendingRequest.id} className="inline-flex min-h-11 items-center justify-center rounded-full border border-border px-4 text-sm font-bold disabled:opacity-50">
                    {requestActionLoading === selectedPendingRequest.id ? 'Working…' : 'Delete / Reject'}
                  </button>
                </div>
              ) : selectedPendingRequest || messageAccess.request_pending ? (
                <div className="border-t border-border bg-card p-4 text-center text-sm text-muted-foreground">Your message request is waiting for {selectedPartnerName} to respond.</div>
              ) : !messageAccess.can_send_direct && !messageAccess.can_send_request ? (
                <div className="border-t border-border bg-card p-4 text-center text-sm text-muted-foreground">You can’t message this account right now.</div>
              ) : (
                <form onSubmit={(event) => void sendMessage(event)} className="flex flex-col gap-2 border-t border-border bg-card p-3 sm:p-4">
                  {!messageAccess.can_send_direct && <p className="text-xs text-muted-foreground">They don’t follow you yet. Your first message will be sent as a request.</p>}
                  {replyingTo && messageAccess.can_send_direct && (
                    <div className="flex items-center gap-3 border-l-2 border-accent px-3 py-1 text-xs">
                      <CornerUpLeft className="size-4 shrink-0 text-accent" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">Replying to {replyingTo.sender_id === currentUserId ? selectedSelfName : selectedPartnerName}</span>
                        <span className="block truncate text-muted-foreground">{replyingTo.content}</span>
                      </span>
                      <button type="button" onClick={() => setReplyingTo(null)} className="flex size-9 items-center justify-center rounded-full hover:bg-background/70" aria-label="Cancel reply"><X className="size-4" /></button>
                    </div>
                  )}
                  <div className="flex items-end gap-2">
                    <label htmlFor="message-composer" className="sr-only">{messageAccess.can_send_direct ? 'Write a message' : 'Write a message request'}</label>
                    {messageAccess.can_send_direct && (
                      <button type="button" onClick={() => { setStatusMessage(null); setShareWorkOpen(true) }} className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-accent hover:bg-background/70" aria-label="Share a work">
                        <BookOpen className="size-5" />
                      </button>
                    )}
                    <textarea ref={composerRef} id="message-composer" value={draft} maxLength={2000} onChange={(event) => setDraft(event.target.value)} onKeyDown={handleComposerKeyDown} rows={1} placeholder={messageAccess.can_send_direct ? 'Write a message…' : 'Write a message request…'} className="min-h-11 min-w-0 flex-1 resize-y rounded-2xl border border-input bg-background px-4 py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring" />
                    <div className="relative shrink-0">
                      <button type="button" onClick={() => setEmojiPickerOpen((open) => !open)} className="inline-flex size-11 items-center justify-center rounded-full text-accent hover:bg-background/70" aria-label="Choose an emoji" aria-expanded={emojiPickerOpen}>
                        <Smile className="size-5" />
                      </button>
                      {emojiPickerOpen && (
                        <div className="absolute bottom-full right-0 z-20 mb-2 overflow-hidden rounded-2xl shadow-xl">
                          <EmojiPicker onEmojiClick={(emojiData) => { insertEmoji(emojiData.emoji); setEmojiPickerOpen(false) }} lazyLoadEmojis height={360} width={300} />
                        </div>
                      )}
                    </div>
                    <button type="submit" disabled={sending || !draft.trim()} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50" aria-label={messageAccess.can_send_direct ? 'Send message' : 'Send message request'}>
                      {sending ? <span className="size-4 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" /> : <Send className="size-4" />}
                      <span className="hidden sm:inline">Send</span>
                    </button>
                  </div>
                </form>
              )}
            </>
          ) : (
            <div className="m-auto flex max-h-full w-full max-w-md flex-col items-center overflow-y-auto px-6 py-10 text-center">
              <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-secondary text-accent"><Send className="size-6" /></span>
              <h2 className="mt-4 font-serif text-xl font-bold">Make room for a good conversation</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">Start a conversation with someone you follow.</p>
              <button
                type="button"
                onClick={() => { setNewMessageSearch(''); setNewMessageOpen(true) }}
                className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-accent px-5 text-sm font-bold text-accent-foreground hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <PenLine className="size-4" /> New message
              </button>
              <section className="mt-6 w-full rounded-2xl border border-border bg-card p-4 text-left" aria-labelledby="followed-people-heading">
                <h3 id="followed-people-heading" className="eyebrow">People you follow</h3>
                {followedPeople.length ? (
                  <ul className="mt-2 divide-y divide-border">
                    {followedPeople.slice(0, 5).map((person) => (
                      <li key={person.id} className="flex min-h-14 items-center gap-2 py-1">
                        <ProfileAvatar src={person.avatarUrl} name={person.name} className="size-9" imageSizes="36px" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-bold">{person.name}</span>
                          <span className="block truncate text-[10px] text-muted-foreground">{person.role} · you follow them</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => selectConversation(person.id)}
                          className="min-h-10 shrink-0 rounded-full border border-border px-3 text-xs font-bold hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-ring"
                        >
                          Message
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">Authors you follow will appear here.</p>
                )}
              </section>
            </div>
          )}
        </section>
        {newMessageOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onMouseDown={(event) => {
            if (event.target === event.currentTarget) setNewMessageOpen(false)
          }}>
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="new-message-title"
              className="flex max-h-[min(80dvh,40rem)] w-full flex-col rounded-t-3xl border border-border bg-card text-card-foreground shadow-2xl sm:max-w-lg sm:rounded-2xl"
            >
              <div className="flex min-h-16 items-center justify-between border-b border-border px-5">
                <div>
                  <h2 id="new-message-title" className="font-serif text-xl font-bold">New message</h2>
                  <p className="text-xs text-muted-foreground">Choose someone you follow.</p>
                </div>
                <button type="button" onClick={() => setNewMessageOpen(false)} className="flex size-11 items-center justify-center rounded-full hover:bg-muted" aria-label="Close new message">
                  <X className="size-5" />
                </button>
              </div>
              <div className="border-b border-border p-4">
                <label htmlFor="new-message-search" className="sr-only">Search people you follow</label>
                <div className="flex items-center gap-2 rounded-full border border-input bg-background px-3">
                  <Search className="size-4 text-muted-foreground" />
                  <input
                    id="new-message-search"
                    autoFocus
                    value={newMessageSearch}
                    onChange={(event) => setNewMessageSearch(event.target.value)}
                    placeholder="Search people you follow"
                    className="min-h-11 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  />
                </div>
              </div>
              <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
                {filteredFollowedPeople.map((person) => (
                  <li key={person.id}>
                    <button
                      type="button"
                      onClick={() => selectConversation(person.id)}
                      className="flex min-h-16 w-full items-center gap-3 px-4 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                    >
                      <ProfileAvatar src={person.avatarUrl} name={person.name} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold">{person.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">@{person.username} · {person.role}</span>
                      </span>
                      <MessageCircle className="size-5 text-accent" />
                    </button>
                  </li>
                ))}
                {!filteredFollowedPeople.length && (
                  <li className="px-5 py-10 text-center text-sm text-muted-foreground">
                    {followedPeople.length ? 'No people match your search.' : 'Follow an author to start a new conversation.'}
                  </li>
                )}
              </ul>
            </section>
          </div>
        )}
        {infoPanelOpen && selectedPerson && (
          <>
          <button type="button" onClick={() => setInfoPanelOpen(false)} className="absolute inset-0 z-20 bg-black/30 lg:hidden" aria-label="Close conversation information" />
          <aside className="absolute inset-y-0 right-0 z-30 flex w-full flex-col overflow-y-auto border-l border-border bg-card shadow-xl lg:static lg:z-auto lg:w-auto lg:shadow-none" role="dialog" aria-modal="true" aria-label="Conversation information">
            <div className="flex min-h-14 items-center justify-between border-b border-border px-4">
              <h2 className="text-sm font-bold">Conversation info</h2>
              <button type="button" onClick={() => setInfoPanelOpen(false)} className="flex size-10 items-center justify-center rounded-full hover:bg-background/70" aria-label="Close conversation info"><X className="size-5" /></button>
            </div>
            <div className="flex flex-col items-center px-5 pb-5 pt-6 text-center">
              <ProfileAvatar src={selectedPerson.avatarUrl} name={selectedPartnerName} className="size-20" imageSizes="80px" />
              <h3 className="mt-3 text-lg font-bold">{selectedPartnerName}</h3>
              <p className="text-sm text-muted-foreground">@{selectedPerson.username}</p>
              <div className="mt-4 flex w-full justify-center gap-3">
                <Link href={`/profile/${encodeURIComponent(selectedPerson.id)}`} className="flex min-w-20 flex-col items-center gap-1 rounded-xl px-4 py-2 text-xs font-semibold hover:bg-background/70">
                  <span className="flex size-10 items-center justify-center rounded-full bg-secondary"><UserRound className="size-5" /></span>
                  Profile
                </Link>
                <button type="button" onClick={() => { setConversationSearchOpen(true); setInfoPanelOpen(false) }} className="flex min-w-20 flex-col items-center gap-1 rounded-xl px-4 py-2 text-xs font-semibold hover:bg-background/70">
                  <span className="flex size-10 items-center justify-center rounded-full bg-secondary"><Search className="size-5" /></span>
                  Search
                </button>
                <Link href="/collaborate?tab=find" className="flex min-w-20 flex-col items-center gap-1 rounded-xl px-4 py-2 text-xs font-semibold hover:bg-background/70">
                  <span className="flex size-10 items-center justify-center rounded-full bg-secondary"><UsersRound className="size-5" /></span>
                  Collaborate
                </Link>
              </div>
              <span className="mt-3 rounded-full bg-secondary px-3 py-1.5 text-xs font-semibold text-secondary-foreground">
                {threadMessages.filter((message) => message.work_id).length} shared {threadMessages.filter((message) => message.work_id).length === 1 ? 'work' : 'works'}
              </span>
            </div>
            <div className="space-y-1 border-t border-border px-4 py-3">
              <button type="button" onClick={() => toggleInfoSection('chat')} className="flex min-h-11 w-full items-center justify-between text-left text-sm font-bold" aria-expanded={infoSection === 'chat'}>
                Chat info <ChevronDown className={`size-4 transition-transform ${infoSection === 'chat' ? 'rotate-180' : ''}`} />
              </button>
              {infoSection === 'chat' && (
                <div className="space-y-3 pb-3 text-sm">
                  <p className="flex items-center gap-3 text-muted-foreground"><Info className="size-4 shrink-0" />Conversation with @{selectedPerson.username}</p>
                  <p className="flex items-center gap-3 text-muted-foreground"><FileText className="size-4 shrink-0" />{threadMessages.length} {threadMessages.length === 1 ? 'message' : 'messages'}</p>
                  <button type="button" onClick={() => toggleInfoSection('shared')} className="flex w-full items-center gap-3 text-left text-muted-foreground hover:text-foreground">
                    <BookOpen className="size-4 shrink-0" />{threadMessages.filter((message) => message.work_id).length} shared works
                  </button>
                </div>
              )}
              {infoSection === 'shared' && (
                <div className="space-y-2 pb-3">
                  {threadMessages.filter((message) => message.sharedWork).map((message) => (
                    <Link key={message.id} href={`/works/${encodeURIComponent(message.sharedWork!.id)}`} className="flex items-center gap-3 rounded-xl p-2 hover:bg-background/70">
                      <span className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-secondary text-accent">
                        {message.sharedWork?.cover_image_url
                          ? <Image src={message.sharedWork.cover_image_url} alt="" fill sizes="48px" className="object-cover" unoptimized />
                          : <BookOpen className="size-5" />}
                      </span>
                      <span className="min-w-0"><span className="block truncate text-sm font-bold">{message.sharedWork?.title}</span><span className="text-xs capitalize text-muted-foreground">{message.sharedWork?.type}</span></span>
                    </Link>
                  ))}
                  {!threadMessages.some((message) => message.sharedWork) && <p className="text-sm text-muted-foreground">Shared works will appear here.</p>}
                </div>
              )}
              <button type="button" onClick={() => toggleInfoSection('customize')} className="flex min-h-11 w-full items-center justify-between text-left text-sm font-bold" aria-expanded={infoSection === 'customize'}>
                Customize chat <ChevronDown className={`size-4 transition-transform ${infoSection === 'customize' ? 'rotate-180' : ''}`} />
              </button>
              {infoSection === 'customize' && (
                <div className="space-y-4 pb-4">
                  <section aria-labelledby="bubble-color-label">
                    <h3 id="bubble-color-label" className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Bubble color · shared</h3>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {BUBBLE_COLORS.map((color) => (
                        <button
                          key={color.value}
                          type="button"
                          onClick={() => void saveConversationPreference(selectedPerson.id, 'bubble_color', color.value)}
                          disabled={savingChatPreferences}
                          className={`size-11 rounded-full border-2 border-card outline outline-1 outline-border disabled:opacity-50 ${selectedChatPreferences.bubble_color === color.value ? 'ring-2 ring-accent ring-offset-2 ring-offset-card' : ''}`}
                          style={{ backgroundColor: color.background }}
                          aria-label={`${color.label} bubble color`}
                          aria-pressed={selectedChatPreferences.bubble_color === color.value}
                        />
                      ))}
                    </div>
                  </section>

                  <section aria-labelledby="chat-background-label">
                    <h3 id="chat-background-label" className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Chat background · shared</h3>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {CHAT_BACKGROUNDS.map((background) => (
                        <button
                          key={background.value}
                          type="button"
                          onClick={() => void saveConversationPreference(selectedPerson.id, 'chat_background', background.value)}
                          disabled={savingChatPreferences}
                          aria-pressed={selectedChatPreferences.chat_background === background.value}
                          className={`min-h-11 rounded-full border px-3 text-xs font-semibold disabled:opacity-50 ${selectedChatPreferences.chat_background === background.value ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:border-accent'}`}
                        >
                          {background.label}
                        </button>
                      ))}
                    </div>
                  </section>

                  <section aria-labelledby="chat-text-size-label">
                    <h3 id="chat-text-size-label" className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Text size · all chats</h3>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {CHAT_TEXT_SIZES.map((size) => (
                        <button
                          key={size.value}
                          type="button"
                          onClick={() => void saveGlobalChatPreference('text_size', size.value)}
                          disabled={savingChatPreferences}
                          aria-pressed={globalChatPreferences.text_size === size.value}
                          className={`min-h-11 rounded-full border px-3 text-xs font-semibold disabled:opacity-50 ${globalChatPreferences.text_size === size.value ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:border-accent'}`}
                        >
                          {size.label}
                        </button>
                      ))}
                    </div>
                  </section>

                  <section aria-labelledby="chat-nicknames-label">
                    <h3 id="chat-nicknames-label" className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Nicknames · shared with this chat</h3>
                    <label className="mt-2 block text-xs font-semibold">
                      You
                      <input
                        value={nicknameDraftSelf}
                        onChange={(event) => setNicknameDraftSelf(event.target.value.slice(0, 40))}
                        onBlur={() => {
                          if (nicknameDraftSelf !== selectedChatPreferences.nickname_self) {
                            void saveConversationPreference(selectedPerson.id, 'nickname_self', nicknameDraftSelf.trim())
                          }
                        }}
                        placeholder="Set your nickname"
                        maxLength={40}
                        className="mt-1 min-h-11 w-full rounded-lg border border-input bg-background px-2.5 text-xs font-normal text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                    </label>
                    <label className="mt-2 block text-xs font-semibold">
                      {selectedPerson.name}
                      <input
                        value={nicknameDraftPartner}
                        onChange={(event) => setNicknameDraftPartner(event.target.value.slice(0, 40))}
                        onBlur={() => {
                          if (nicknameDraftPartner !== selectedChatPreferences.nickname_partner) {
                            void saveConversationPreference(selectedPerson.id, 'nickname_partner', nicknameDraftPartner.trim())
                          }
                        }}
                        placeholder="Set nickname"
                        maxLength={40}
                        className="mt-1 min-h-11 w-full rounded-lg border border-input bg-background px-2.5 text-xs font-normal text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                    </label>
                    <p className="mt-1 text-[10px] leading-4 text-muted-foreground">Both people in this chat see these names.</p>
                  </section>

                  <section aria-labelledby="quick-reaction-label">
                    <h3 id="quick-reaction-label" className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Quick reaction · shared</h3>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {MESSAGE_REACTIONS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => void saveConversationPreference(selectedPerson.id, 'quick_reaction', emoji)}
                          disabled={savingChatPreferences}
                          aria-label={`Set quick reaction to ${emoji}`}
                          aria-pressed={selectedChatPreferences.quick_reaction === emoji}
                          className={`emoji-glyph flex size-11 items-center justify-center rounded-full text-lg disabled:opacity-50 ${selectedChatPreferences.quick_reaction === emoji ? 'bg-secondary ring-1 ring-accent' : 'hover:bg-secondary'}`}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </section>

                  <section aria-labelledby="chat-notifications-label">
                    <h3 id="chat-notifications-label" className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Notifications</h3>
                    <label className="mt-1 flex min-h-11 items-center justify-between gap-2 text-xs">
                      Mute this chat
                      <select
                        value={selectedMuteDuration}
                        onChange={(event) => {
                          if (isMuteDuration(event.target.value)) {
                            void setConversationMuteDuration(selectedPerson.id, event.target.value)
                          }
                        }}
                        disabled={updatingConversation === selectedPerson.id}
                        className="min-h-11 max-w-36 rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-foreground"
                      >
                        <option value="off">Off</option>
                        <option value="1h">1 hour</option>
                        <option value="8h">8 hours</option>
                        <option value="1d">1 day</option>
                        <option value="1w">1 week</option>
                        <option value="always">Until I turn it back on</option>
                      </select>
                    </label>
                  </section>

                  <section aria-labelledby="chat-organize-label">
                    <h3 id="chat-organize-label" className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Organize</h3>
                    <button
                      type="button"
                      onClick={() => void saveConversationPreference(selectedPerson.id, 'pinned', !selectedChatPreferences.pinned)}
                      disabled={savingChatPreferences}
                      aria-pressed={selectedChatPreferences.pinned}
                      className="flex min-h-11 w-full items-center justify-between text-left text-xs disabled:opacity-50"
                    >
                      Pin to top <span className="text-muted-foreground">{selectedChatPreferences.pinned ? 'On' : 'Off'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void updateConversationStatus(selectedPerson.id, selectedConversationStatus === 'archived' ? 'active' : 'archived')}
                      disabled={updatingConversation === selectedPerson.id}
                      className="flex min-h-11 w-full items-center text-left text-xs disabled:opacity-50"
                    >
                      {selectedConversationStatus === 'archived' ? 'Unarchive chat' : 'Archive chat'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void markConversationUnread(selectedPerson.id)}
                      disabled={updatingConversation === selectedPerson.id}
                      className="flex min-h-11 w-full items-center text-left text-xs disabled:opacity-50"
                    >
                      Mark as unread
                    </button>
                  </section>

                  <section aria-labelledby="chat-accessibility-label">
                    <h3 id="chat-accessibility-label" className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Sound &amp; accessibility · all chats</h3>
                    <button
                      type="button"
                      onClick={() => {
                        const enabled = !globalChatPreferences.message_sound
                        if (enabled) unlockMessageNotificationSound()
                        void saveGlobalChatPreference('message_sound', enabled)
                      }}
                      disabled={savingChatPreferences}
                      aria-pressed={globalChatPreferences.message_sound}
                      className="flex min-h-11 w-full items-center justify-between text-left text-xs disabled:opacity-50"
                    >
                      Message sound
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        {globalChatPreferences.message_sound ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
                        {globalChatPreferences.message_sound ? 'On' : 'Off'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void saveGlobalChatPreference('reduce_motion', !globalChatPreferences.reduce_motion)}
                      disabled={savingChatPreferences}
                      aria-pressed={globalChatPreferences.reduce_motion}
                      className="flex min-h-11 w-full items-center justify-between text-left text-xs disabled:opacity-50"
                    >
                      Reduce motion <span className="text-muted-foreground">{globalChatPreferences.reduce_motion ? 'On' : 'Off'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void saveGlobalChatPreference('high_contrast', !globalChatPreferences.high_contrast)}
                      disabled={savingChatPreferences}
                      aria-pressed={globalChatPreferences.high_contrast}
                      className="flex min-h-11 w-full items-center justify-between text-left text-xs disabled:opacity-50"
                    >
                      High contrast bubbles <span className="text-muted-foreground">{globalChatPreferences.high_contrast ? 'On' : 'Off'}</span>
                    </button>
                  </section>

                  <section aria-label="Live chat preview" className="space-y-2 rounded-xl border border-border p-3" style={{ backgroundColor: selectedChatBackground.background, color: selectedChatBackground.foreground }}>
                    <h3 className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Live preview</h3>
                    <div className="flex justify-start">
                      <div>
                        <p className="mb-1 text-[10px]">{nicknameDraftPartner.trim() || selectedPerson.name}</p>
                        <p className={`max-w-[90%] rounded-2xl rounded-bl-md bg-card px-3 py-2 ${textSizeClass} ${globalChatPreferences.high_contrast ? 'border-2 border-foreground' : ''}`}>Received message</p>
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <div className="text-right">
                        <p className="mb-1 text-[10px]">{nicknameDraftSelf.trim() || 'You'}</p>
                        <p className={`max-w-[90%] rounded-2xl rounded-br-md px-3 py-2 ${textSizeClass} ${globalChatPreferences.high_contrast ? 'border-2 border-foreground' : ''}`} style={{ backgroundColor: selectedBubbleColor.background, color: selectedBubbleColor.foreground }}>
                          Your message in your color
                        </p>
                      </div>
                    </div>
                    <p className="text-right text-[10px] text-muted-foreground">✓ Seen</p>
                  </section>
                </div>
              )}
              <button type="button" onClick={() => toggleInfoSection('privacy')} className="flex min-h-11 w-full items-center justify-between text-left text-sm font-bold" aria-expanded={infoSection === 'privacy'}>
                Privacy &amp; support <ChevronDown className={`size-4 transition-transform ${infoSection === 'privacy' ? 'rotate-180' : ''}`} />
              </button>
              {infoSection === 'privacy' && (
                <div className="space-y-3 pb-3 text-sm leading-6 text-muted-foreground">
                  <p className="flex items-start gap-3"><ShieldCheck className="mt-1 size-4 shrink-0" />Only the conversation participants can access these messages.</p>
                  <p>Read receipts show when the recipient has opened a message.</p>
                  <button type="button" onClick={() => void toggleConversationMute()} disabled={updatingConversation === selectedPerson.id} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left font-semibold text-foreground hover:bg-background/70 disabled:opacity-50">
                    <BellOff className="size-4" />{selectedMuteDuration !== 'off' ? 'Unmute notifications' : 'Mute notifications'}
                  </button>
                  <button type="button" onClick={() => { setReportReason('other'); setReportDetails(''); setReportOpen(true) }} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left font-semibold text-destructive hover:bg-background/70">
                    <Flag className="size-4" />Report account or message
                  </button>
                  {selectedAccountControl?.status === 'restricted' ? (
                    <button type="button" onClick={() => void setAccountControl(selectedPerson.id, 'none')} disabled={updatingConversation === selectedPerson.id} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left font-semibold text-accent hover:bg-background/70 disabled:opacity-50">
                      <Shield className="size-4" /> Unrestrict account
                    </button>
                  ) : (
                    <button type="button" onClick={() => void setAccountControl(selectedPerson.id, 'restricted')} disabled={updatingConversation === selectedPerson.id} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left font-semibold hover:bg-background/70 disabled:opacity-50">
                      <Shield className="size-4" /> Restrict account
                    </button>
                  )}
                  {selectedAccountControl?.status === 'blocked' ? (
                    <button type="button" onClick={() => void setAccountControl(selectedPerson.id, 'none')} disabled={updatingConversation === selectedPerson.id} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left font-semibold text-accent hover:bg-background/70 disabled:opacity-50">
                      <Ban className="size-4" /> Unblock account
                    </button>
                  ) : (
                    <button type="button" onClick={() => setConfirmation({ kind: 'account', accountId: selectedPerson.id, status: 'blocked' })} disabled={updatingConversation === selectedPerson.id} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left font-semibold text-destructive hover:bg-background/70 disabled:opacity-50">
                      <Ban className="size-4" /> Block account
                    </button>
                  )}
                  <div className="flex gap-4 font-semibold text-accent"><Link href="/privacy">Privacy</Link><Link href="/guidelines">Guidelines</Link></div>
                </div>
              )}
            </div>
          </aside>
          </>
        )}
      </div>
      {statusMessage && (
        <div role="status" className="fixed bottom-4 left-1/2 z-40 flex max-w-[min(92vw,36rem)] -translate-x-1/2 items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium shadow-xl">
          <span className="flex-1">{statusMessage}</span>
          <button type="button" onClick={() => setStatusMessage(null)} className="flex size-8 shrink-0 items-center justify-center rounded-full hover:bg-muted" aria-label="Dismiss message"><X className="size-4" /></button>
        </div>
      )}
      {shareWorkOpen && selectedPerson && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onClick={(event) => { if (event.target === event.currentTarget) setShareWorkOpen(false) }}>
          <section role="dialog" aria-modal="true" aria-labelledby="share-work-title" className="max-h-[min(85dvh,42rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div><h2 id="share-work-title" className="font-serif text-xl font-bold">Share a work</h2><p className="mt-1 text-sm text-muted-foreground">Choose a published story or comic to share with {selectedPartnerName}.</p></div>
              <button type="button" onClick={() => setShareWorkOpen(false)} className="flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-muted" aria-label="Close share work"><X className="size-5" /></button>
            </div>
            {works.filter((work) => work.status !== 'Draft' && (work.type === 'story' || work.type === 'comic')).length ? (
              <ul className="mt-4 space-y-2">
                {works.filter((work) => work.status !== 'Draft' && (work.type === 'story' || work.type === 'comic')).map((work) => (
                  <li key={work.id}>
                    <button type="button" onClick={() => void shareWork(work)} disabled={sending} className="flex min-h-20 w-full items-center gap-3 rounded-xl border border-border p-3 text-left hover:border-accent hover:bg-background/70 disabled:opacity-50">
                      <span className="relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-secondary text-accent">
                        {work.coverImageUrl ? <Image src={work.coverImageUrl} alt="" fill sizes="56px" className="object-cover" unoptimized /> : <BookOpen className="size-6" />}
                      </span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{work.title}</span><span className="mt-1 block text-xs capitalize text-muted-foreground">{work.type} · {work.status}</span></span>
                      <Send className="size-4 shrink-0 text-accent" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-5 rounded-xl bg-background p-5 text-center">
                <BookOpen className="mx-auto size-7 text-muted-foreground" />
                <p className="mt-2 text-sm font-semibold">No published stories or comics yet</p>
                <p className="mt-1 text-xs text-muted-foreground">Publish a story or comic to share it in a message.</p>
              </div>
            )}
          </section>
        </div>
      )}
      {reportOpen && selectedPerson && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onClick={(event) => { if (event.target === event.currentTarget && !reporting) setReportOpen(false) }}>
          <form role="dialog" aria-modal="true" aria-labelledby="report-title" onSubmit={(event) => void submitReport(event)} className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div><h2 id="report-title" className="font-serif text-xl font-bold">Report {selectedPerson.name}</h2><p className="mt-1 text-sm text-muted-foreground">Reports are private and reviewed by the StoryLines team.</p></div>
              <button type="button" onClick={() => setReportOpen(false)} disabled={reporting} className="flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-muted disabled:opacity-50" aria-label="Close report form"><X className="size-5" /></button>
            </div>
            <label htmlFor="report-reason" className="mt-5 block text-sm font-semibold">Reason</label>
            <select id="report-reason" value={reportReason} onChange={(event) => setReportReason(event.target.value as typeof reportReason)} className="mt-2 min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground">
              <option value="harassment">Harassment or bullying</option>
              <option value="spam">Spam or scams</option>
              <option value="inappropriate">Inappropriate content</option>
              <option value="other">Something else</option>
            </select>
            <label htmlFor="report-details" className="mt-4 block text-sm font-semibold">Additional details <span className="font-normal text-muted-foreground">(optional)</span></label>
            <textarea id="report-details" value={reportDetails} onChange={(event) => setReportDetails(event.target.value)} maxLength={1000} rows={4} className="mt-2 w-full resize-y rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" placeholder="Tell us what happened." />
            <div className="mt-4 grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setReportOpen(false)} disabled={reporting} className="min-h-11 rounded-full border border-border px-4 text-sm font-bold disabled:opacity-50">Cancel</button>
              <button type="submit" disabled={reporting} className="min-h-11 rounded-full bg-destructive px-4 text-sm font-bold text-destructive-foreground disabled:opacity-50">{reporting ? 'Submitting…' : 'Submit report'}</button>
            </div>
          </form>
        </div>
      )}
      {confirmation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onClick={(event) => { if (event.target === event.currentTarget) setConfirmation(null) }}>
          <section role="dialog" aria-modal="true" aria-labelledby="message-confirmation-title" className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl">
            <h2 id="message-confirmation-title" className="font-serif text-xl font-bold">
              {confirmation.kind === 'account'
                ? 'Block this account?'
                : confirmation.status === 'archived' ? 'Archive this conversation?' : 'Delete this conversation?'}
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {confirmation.kind === 'account'
                ? `${people.get(confirmation.accountId)?.name ?? 'This account'} won’t be able to message you or send message requests. Blocking also hides each other’s profiles and content and removes follows in both directions. Manage this block in Settings → Blocked Accounts.`
                : confirmation.status === 'archived'
                  ? 'This conversation will leave your main inbox. You can find it later under Archived Messages.'
                  : 'This removes the conversation from your inbox only. The other person keeps their copy, and you won’t see this history again unless a new message arrives.'}
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setConfirmation(null)} className="inline-flex min-h-11 items-center justify-center rounded-full border border-border px-4 text-sm font-bold hover:bg-muted">Cancel</button>
              <button type="button" onClick={() => void confirmAction()} className={`inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-bold ${confirmation.status === 'blocked' || confirmation.status === 'deleted' ? 'bg-destructive text-destructive-foreground hover:brightness-95' : 'bg-accent text-accent-foreground hover:brightness-95'}`}>
                {confirmation.kind === 'account' ? 'Block account' : confirmation.status === 'archived' ? 'Archive' : 'Delete'}
              </button>
            </div>
          </section>
        </div>
      )}
      {error && (
        <div className="mt-3 rounded-xl border border-destructive/30 bg-card p-3">
          <p role="alert" className="text-sm text-destructive">{error}</p>
          <button type="button" onClick={() => setReloadVersion((version) => version + 1)} className="mt-2 min-h-11 text-sm font-bold text-accent">Try again</button>
        </div>
      )}
    </div>
  )
}
