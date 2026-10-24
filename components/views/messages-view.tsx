'use client'

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
  Inbox,
  MoreVertical,
  Palette,
  Shield,
  Search,
  Send,
  ShieldCheck,
  Smile,
  Trash2,
  UserRound,
  X,
} from 'lucide-react'
import { Panel } from '@/components/shared/panel'
import { ProfileAvatar } from '@/components/shared/profile-avatar'
import { useAppState } from '@/lib/app-state'
import { getSupabaseClient } from '@/lib/supabase'

type Message = {
  id: string
  sender_id: string
  recipient_id: string
  content: string
  is_deleted: boolean
  created_at: string
  read_at: string | null
  reply_to_message_id: string | null
  reactions?: MessageReactionView[]
  replyPreview?: Pick<Message, 'id' | 'sender_id' | 'content' | 'is_deleted'>
}
type MessageReaction = { message_id: string; user_id: string; reaction: string }
type MessageReactionView = { emoji: string; count: number; reactedByMe: boolean }
type Person = { id: string; name: string; username: string; avatarUrl: string | null }
type MessageFilter = 'all' | 'unread' | 'archived' | 'requests' | 'restricted' | 'blocked'
type ConversationStatus = 'active' | 'archived' | 'deleted'
type ConversationState = { status: ConversationStatus; updated_at: string }
type ConversationStateResult = { partner_id: string; status: ConversationStatus; updated_at: string }
type MessageRequest = { id: string; sender_id: string; recipient_id: string; content: string; created_at: string }
type AccountControl = { account_id: string; status: 'restricted' | 'blocked'; created_at: string }
type MessageAccess = { can_send_direct: boolean; can_send_request: boolean; request_pending: boolean; account_blocked: boolean }
type Confirmation = { kind: 'conversation'; partnerId: string; status: ConversationStatus } | { kind: 'account'; accountId: string; status: 'restricted' | 'blocked' }
const MESSAGE_PAGE_SIZE = 100
const MESSAGE_REACTIONS = ['❤️', '😂', '😮', '😢', '👍', '🔥'] as const
const EmojiPicker = dynamic(() => import('emoji-picker-react'), { ssr: false })

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

function describeMessageError(error: unknown, fallback: string) {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    if (error.code === '42P01' || error.code === 'PGRST205') {
      return 'Messaging privacy features are not installed. Apply migrations 20261025000400 through 20261025000800 in Supabase.'
    }
    if (error.code === 'PGRST202') {
      return 'A messaging database function is missing. Apply migrations 20261025000400 through 20261025000800 and 20261025001200_chapter_discussions_chat_unsend_and_reader_position.sql in Supabase.'
    }
    if (error.code === '42501') {
      return 'Supabase denied this message action. Apply migrations 20261025000400 through 20261025000800, then sign in again.'
    }
    if (error.code === '42P17') {
      return 'The direct-message database policy is recursive. Apply migration 20261025000300 in Supabase to fix it.'
    }
    if (error.code === '42703' || error.code === 'PGRST204') {
      return 'The chat database is missing the latest message fields. Apply migration 20261025001200_chapter_discussions_chat_unsend_and_reader_position.sql in Supabase.'
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
  const [messages, setMessages] = useState<Message[]>([])
  const [people, setPeople] = useState<Map<string, Person>>(new Map())
  const [conversationStates, setConversationStates] = useState<Map<string, ConversationState>>(new Map())
  const [messageRequests, setMessageRequests] = useState<MessageRequest[]>([])
  const [accountControls, setAccountControls] = useState<AccountControl[]>([])
  const [selectedUserId, setSelectedUserId] = useState<string | null>(targetUserId)
  const [filter, setFilter] = useState<MessageFilter>('all')
  const [inboxMenuOpen, setInboxMenuOpen] = useState(false)
  const [conversationMenuFor, setConversationMenuFor] = useState<string | null>(null)
  const [updatingConversation, setUpdatingConversation] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
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
  const [infoSection, setInfoSection] = useState<'chat' | 'customize' | 'privacy' | null>('privacy')
  const [conversationSearchOpen, setConversationSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [hasMoreMessages, setHasMoreMessages] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [inboxCursor, setInboxCursor] = useState<Pick<Message, 'created_at' | 'id'> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadVersion, setReloadVersion] = useState(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const activeMessageRef = useRef<HTMLDivElement>(null)
  const conversationMenuRef = useRef<HTMLDivElement>(null)
  const inboxMenuRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressTriggeredRef = useRef(false)

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
      if (!inboxMenuRef.current?.contains(target)) setInboxMenuOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setActiveMessageActionsFor(null)
      setReactionPickerFor(null)
      setMessageMenuFor(null)
      setConversationMenuFor(null)
      setInboxMenuOpen(false)
      setConfirmation(null)
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
    const [reactionsResult, repliesResult] = await Promise.all([
      supabase
        .from('community_message_reactions')
        .select('message_id, user_id, reaction')
        .in('message_id', messageIds),
      replyIds.length
        ? supabase.from('community_direct_messages').select('id, sender_id, content, is_deleted').in('id', replyIds)
        : Promise.resolve({ data: [], error: null }),
    ])
    if (reactionsResult.error) throw reactionsResult.error
    if (repliesResult.error) throw repliesResult.error
    const reactionsByMessage = new Map<string, MessageReaction[]>()
    for (const reaction of reactionsResult.data ?? []) {
      const reactions = reactionsByMessage.get(reaction.message_id) ?? []
      reactions.push(reaction)
      reactionsByMessage.set(reaction.message_id, reactions)
    }
    const replyById = new Map((repliesResult.data ?? []).map((reply) => [reply.id, reply]))
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
      }
    })
  }

  useEffect(() => {
    setSelectedUserId(targetUserId)
  }, [targetUserId])

  useEffect(() => {
    if (!currentUserId) {
      setMessages([])
      setPeople(new Map())
      setConversationStates(new Map())
      setMessageRequests([])
      setAccountControls([])
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
          .select('id, sender_id, recipient_id, content, is_deleted, created_at, read_at, reply_to_message_id')
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
      const selectedThreadPromise = targetUserId
        ? supabase
          .from('community_direct_messages')
          .select('id, sender_id, recipient_id, content, is_deleted, created_at, read_at, reply_to_message_id')
          .or(`and(sender_id.eq.${currentUserId},recipient_id.eq.${targetUserId}),and(sender_id.eq.${targetUserId},recipient_id.eq.${currentUserId})`)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(MESSAGE_PAGE_SIZE)
        : Promise.resolve({ data: [], error: null })
      const [inboxResult, selectedThreadResult, conversationStatesResult, messageRequestsResult, accountControlsResult] = await Promise.all([
        inboxPromise,
        selectedThreadPromise,
        conversationStatesPromise,
        messageRequestsPromise,
        accountControlsPromise,
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
    })().catch((loadError: unknown) => {
      if (active) setError(describeMessageError(loadError, 'Could not load your messages.'))
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => {
      active = false
    }
  }, [currentUserId, router, targetUserId, reloadVersion])

  const loadOlderMessages = async () => {
    const cursor = inboxCursor
    if (!cursor || loadingOlder || !hasMoreMessages) return
    setLoadingOlder(true)
    setError(null)
    try {
      const supabase = getSupabaseClient()
      const { data, error: olderError } = await supabase
        .from('community_direct_messages')
        .select('id, sender_id, recipient_id, content, is_deleted, created_at, read_at, reply_to_message_id')
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
      .sort((a, b) => new Date(b.latest.created_at).getTime() - new Date(a.latest.created_at).getTime())
  }, [conversationStates, currentUserId, filter, messages])

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
  const restrictedIncomingRequests = messageRequests.filter((request) => (
    request.recipient_id === currentUserId
    && accountControls.some((control) => control.account_id === request.sender_id && control.status === 'restricted')
  ))

  useEffect(() => {
    if (!currentUserId || !selectedUserId) {
      setMessageAccess(null)
      setMessageAccessLoading(false)
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
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [threadMessages.length, selectedUserId])

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
        .select('id, sender_id, recipient_id, content, is_deleted, created_at, read_at, reply_to_message_id')
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
    } catch (controlError) {
      setError(describeMessageError(controlError, 'Could not update this account control.'))
    } finally {
      setUpdatingConversation(null)
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
    const existing = message.reactions?.find((reaction) => reaction.emoji === emoji)
    const currentReactionByMe = existing?.reactedByMe ?? false
    try {
      const supabase = getSupabaseClient()
      const result = currentReactionByMe
        ? await supabase.from('community_message_reactions')
          .delete()
          .eq('message_id', message.id)
          .eq('user_id', currentUserId)
        : await supabase.from('community_message_reactions')
          .upsert({ message_id: message.id, user_id: currentUserId, reaction: emoji }, { onConflict: 'message_id,user_id' })
      if (result.error) throw result.error
      setMessages((current) => current.map((item) => {
        if (item.id !== message.id) return item
        const reactions = new Map((item.reactions ?? []).map((reaction) => [reaction.emoji, { ...reaction }]))
        if (currentReactionByMe) {
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
    <div className="mx-auto w-full max-w-6xl">
      <header className="mb-5">
        <span className="eyebrow">Your inbox</span>
        <h1 className="mt-1 font-serif text-3xl font-bold">My Messages</h1>
      </header>
      <Panel className={`relative grid min-h-[min(78vh,58rem)] overflow-hidden border-[#ddd1b9] bg-[#e7ddc8] p-0 ${infoPanelOpen ? 'md:grid-cols-[18rem_minmax(0,1fr)_20rem]' : 'md:grid-cols-[18rem_minmax(0,1fr)]'}`}>
        <aside className={`min-w-0 border-border md:border-r ${selectedUserId ? 'hidden md:block' : ''}`} aria-label="Conversations">
          <div className="flex items-center justify-between border-b border-border p-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">
                {filter === 'requests' ? 'Message requests'
                  : filter === 'restricted' ? 'Restricted accounts'
                    : filter === 'blocked' ? 'Blocked accounts'
                      : filter === 'archived' ? 'Archived messages'
                        : filter === 'unread' ? 'Unread messages' : 'All messages'}
              </p>
              {filter === 'requests' && <p className="mt-1 text-xs text-muted-foreground">{visibleMessageRequests.length} pending</p>}
            </div>
            <div className="relative shrink-0" ref={inboxMenuRef}>
              <button type="button" onClick={() => setInboxMenuOpen((open) => !open)} className="flex size-10 items-center justify-center rounded-full hover:bg-muted" aria-label="Message folders and account controls" aria-expanded={inboxMenuOpen} aria-haspopup="menu">
                <MoreVertical className="size-5" />
              </button>
              {inboxMenuOpen && (
                <div role="menu" className="absolute right-0 top-full z-30 mt-1 w-64 rounded-xl border border-border bg-card p-2 shadow-lg">
                  {([
                    ['all', 'All messages', Inbox],
                    ['unread', 'Unread', Check],
                    ['archived', 'Archived Messages', Archive],
                    ['requests', 'Message Requests', Send],
                    ['restricted', 'Restricted Account', Shield],
                    ['blocked', 'Blocked accounts', Ban],
                  ] as const).map(([value, label, Icon]) => (
                    <button key={value} type="button" role="menuitem" onClick={() => { setFilter(value); setInboxMenuOpen(false) }} className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold hover:bg-muted ${filter === value ? 'text-accent' : ''}`}>
                      <Icon className="size-4 shrink-0" />{label}
                      {value === 'requests' && visibleMessageRequests.length > 0 && <span className="ml-auto rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">{visibleMessageRequests.length}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
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
          ) : filter === 'restricted' || filter === 'blocked' ? (
            (() => {
              const controls = accountControls.filter((control) => control.status === (filter === 'restricted' ? 'restricted' : 'blocked'))
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
                          {filter === 'restricted' ? 'Unrestrict' : 'Unblock'}
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
                <div className="px-5 py-12 text-center"><h2 className="font-serif text-lg font-bold">No {filter} accounts</h2><p className="mt-2 text-sm text-muted-foreground">Accounts you {filter === 'restricted' ? 'restrict' : 'block'} will appear here.</p></div>
              )
            })()
          ) : conversations.length ? (
            <ul className="divide-y divide-border">
              {conversations.map((conversation) => {
                const person = people.get(conversation.partnerId)
                if (!person) return null
                return (
                  <li key={person.id} className={`relative flex min-h-20 items-center gap-1 px-3 ${selectedUserId === person.id ? 'bg-secondary' : 'bg-card hover:bg-muted'}`}>
                    <button type="button" onClick={() => selectConversation(person.id)} className="flex min-h-20 min-w-0 flex-1 items-center gap-3 py-3 text-left">
                      <ProfileAvatar src={person.avatarUrl} name={person.name} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold">{person.name}</span>
                        <span className="mt-1 block truncate text-xs text-muted-foreground">{conversation.latest.sender_id === currentUserId ? 'You: ' : ''}{conversation.latest.content}</span>
                      </span>
                      {conversation.unread > 0 && conversation.status === 'active' && <span className="flex size-6 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground">{conversation.unread}</span>}
                    </button>
                    <div className="relative shrink-0" ref={conversationMenuFor === person.id ? conversationMenuRef : null}>
                      <button type="button" onClick={() => setConversationMenuFor((current) => current === person.id ? null : person.id)} disabled={updatingConversation === person.id} className="flex size-10 items-center justify-center rounded-full text-muted-foreground hover:bg-background disabled:opacity-50" aria-label={`More options for conversation with ${person.name}`} aria-expanded={conversationMenuFor === person.id}>
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
              <h2 className="font-serif text-lg font-bold">{filter === 'unread' ? 'No unread messages' : filter === 'archived' ? 'No archived conversations' : 'Your messages will appear here'}</h2>
              {filter === 'all' && <>
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

        <section className={`flex min-h-[min(72vh,52rem)] min-w-0 flex-col ${selectedUserId ? '' : 'hidden md:flex'}`} aria-label="Message conversation">
          {selectedUserId && selectedPerson ? (
            <>
              <header className="flex min-h-16 items-center gap-3 border-b border-[#d7c9ad] bg-[#eee5d3] px-4 py-3">
                <button type="button" onClick={() => { setSelectedUserId(null); router.replace('/messages', { scroll: false }) }} className="flex size-11 items-center justify-center rounded-full hover:bg-muted md:hidden" aria-label="Back to messages"><ArrowLeft className="size-5" /></button>
                <Link href={`/profile/${encodeURIComponent(selectedPerson.id)}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left hover:opacity-80" aria-label={`View ${selectedPerson.name}'s profile`}>
                  <ProfileAvatar src={selectedPerson.avatarUrl} name={selectedPerson.name} />
                  <span className="min-w-0"><span className="block truncate text-sm font-bold">{selectedPerson.name}</span><span className="text-xs text-muted-foreground">@{selectedPerson.username}</span></span>
                </Link>
                <button type="button" onClick={() => setInfoPanelOpen((open) => !open)} className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-foreground hover:bg-background/70" aria-label={infoPanelOpen ? 'Close conversation info' : 'More conversation options'} aria-expanded={infoPanelOpen}>
                  {infoPanelOpen ? <X className="size-5" /> : <MoreVertical className="size-5" />}
                </button>
              </header>
              {conversationSearchOpen && (
                <div className="border-b border-[#d7c9ad] bg-[#eee5d3] px-4 py-2">
                  <label htmlFor="conversation-search" className="sr-only">Search this conversation</label>
                  <div className="flex items-center gap-2 rounded-xl border border-[#d7c9ad] bg-[#f8f3e9] px-3">
                    <Search className="size-4 shrink-0 text-muted-foreground" />
                    <input id="conversation-search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search messages" className="min-h-10 min-w-0 flex-1 bg-transparent text-sm outline-none" />
                    <button type="button" onClick={() => { setConversationSearchOpen(false); setSearchQuery('') }} className="flex size-8 items-center justify-center rounded-full hover:bg-white" aria-label="Close search"><X className="size-4" /></button>
                  </div>
                </div>
              )}
              <div className="flex-1 space-y-4 overflow-y-auto bg-[#e7ddc8] p-4 sm:p-6" aria-live="polite">
                {displayedThreadMessages.length ? displayedThreadMessages.map((message, index) => {
                  const isMine = message.sender_id === currentUserId
                  const reply = threadMessages.find((item) => item.id === message.reply_to_message_id) ?? message.replyPreview
                  const sender = isMine ? 'You' : selectedPerson.name
                  const showActions = !message.is_deleted && activeMessageActionsFor === message.id
                  const messageDate = new Date(message.created_at)
                  const previousMessageDate = index > 0 ? new Date(displayedThreadMessages[index - 1].created_at) : null
                  return (
                    <Fragment key={message.id}>
                    {(!previousMessageDate || !sameMessageDay(messageDate, previousMessageDate)) && (
                      <div className="my-5 flex items-center gap-3" role="separator" aria-label={messageDateLabel(messageDate)}>
                        <span className="h-px flex-1 bg-[#c7b99d]" />
                        <time dateTime={messageDate.toISOString()} className="rounded-full bg-[#f8f3e9] px-3 py-1 text-xs font-semibold text-[#75684f]">
                          {messageDateLabel(messageDate)}
                        </time>
                        <span className="h-px flex-1 bg-[#c7b99d]" />
                      </div>
                    )}
                    <div className={`group flex items-end gap-2 ${isMine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`flex max-w-[min(82%,38rem)] flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                        <div className={`mb-1 flex items-center gap-2 px-1 text-[11px] text-[#83765d] ${isMine ? 'justify-end' : ''}`}>
                          {!isMine && <ProfileAvatar src={selectedPerson.avatarUrl} name={selectedPerson.name} className="size-7" imageSizes="28px" />}
                          <time dateTime={message.created_at}>{new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
                          <span>{sender}</span>
                          {isMine && <ProfileAvatar src={people.get(currentUserId ?? '')?.avatarUrl} name="You" className="size-7" imageSizes="28px" />}
                        </div>
                        <div ref={showActions ? activeMessageRef : null} className={`flex items-center gap-1 ${isMine ? 'flex-row-reverse' : ''}`}>
                          <div className="relative max-w-full">
                            <div
                              role={message.is_deleted ? undefined : 'button'}
                              tabIndex={message.is_deleted ? undefined : 0}
                              onPointerDown={message.is_deleted ? undefined : () => startMessageLongPress(message.id)}
                              onPointerUp={message.is_deleted ? undefined : cancelMessageLongPress}
                              onPointerLeave={message.is_deleted ? undefined : cancelMessageLongPress}
                              onPointerCancel={message.is_deleted ? undefined : cancelMessageLongPress}
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
                              className={`w-fit max-w-full overflow-hidden rounded-2xl px-4 py-2.5 shadow-sm ${message.is_deleted ? 'border border-[#d7c9ad] bg-[#f4eddf] italic text-[#75684f]' : `cursor-pointer focus-visible:outline-2 focus-visible:outline-ring ${isMine ? 'rounded-br-md bg-[#956c16] text-white' : 'rounded-bl-md bg-[#f4eddf] text-foreground'}`}`}
                            >
                              {reply && (
                                <div className={`mb-2 border-l-2 pl-2 text-xs ${isMine ? 'border-white/50 text-white/75' : 'border-accent text-muted-foreground'}`}>
                                  <p className="font-semibold">{reply.sender_id === currentUserId ? 'You' : selectedPerson.name}</p>
                                  <p className="line-clamp-2">{reply.is_deleted ? 'This message was deleted' : reply.content}</p>
                                </div>
                              )}
                              <p className={`whitespace-pre-wrap break-words text-sm leading-6 ${message.is_deleted ? 'text-xs' : ''}`}>{message.is_deleted ? 'This message was deleted' : message.content}</p>
                              {isMine && !message.is_deleted && message.read_at && (
                                <p className="mt-1 flex items-center justify-end gap-1 text-[10px] text-white/70"><Check className="size-3" /> Seen</p>
                              )}
                            </div>
                            {!message.is_deleted && reactionPickerFor === message.id && (
                              <div className={`absolute bottom-full z-10 mb-1 flex gap-1 rounded-full border border-[#d7c9ad] bg-[#f8f3e9] p-2 shadow-lg ${isMine ? 'right-0' : 'left-0'}`}>
                                {MESSAGE_REACTIONS.map((emoji) => (
                                  <button key={emoji} type="button" onClick={() => void reactToMessage(message, emoji)} className="flex size-8 items-center justify-center rounded-full text-lg hover:bg-white" aria-label={`React ${emoji}`}>
                                    {emoji}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className={`flex items-center gap-1 transition-opacity duration-150 ${showActions ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100'}`}>
                            <button type="button" onClick={() => setReactionPickerFor((current) => current === message.id ? null : message.id)} className="inline-flex size-8 items-center justify-center rounded-full text-[#75684f] hover:bg-white/60" aria-label="React to message" aria-expanded={reactionPickerFor === message.id}>
                              <Smile className="size-4" />
                            </button>
                            <button type="button" onClick={() => { setReplyingTo(message); setMessageMenuFor(null); setActiveMessageActionsFor(null) }} className="inline-flex size-8 items-center justify-center rounded-full text-[#75684f] hover:bg-white/60" aria-label="Reply to message">
                              <CornerUpLeft className="size-4" />
                            </button>
                            <div className="relative">
                              <button type="button" onClick={() => setMessageMenuFor((current) => current === message.id ? null : message.id)} className="inline-flex size-8 items-center justify-center rounded-full text-[#75684f] hover:bg-white/60" aria-label="More message actions" aria-expanded={messageMenuFor === message.id}>
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
                          <div className={`mt-1 flex flex-wrap gap-1 ${isMine ? 'justify-end' : ''}`}>
                            {message.reactions.map((reaction) => (
                              <button
                                key={reaction.emoji}
                                type="button"
                                onClick={() => void reactToMessage(message, reaction.emoji)}
                                aria-pressed={reaction.reactedByMe}
                                className={`inline-flex min-h-7 items-center gap-1 rounded-full border bg-[#f8f3e9] px-2 text-xs ${reaction.reactedByMe ? 'border-accent text-accent' : 'border-[#d7c9ad]'}`}
                              >
                                {reaction.emoji}<span>{reaction.count}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    </Fragment>
                  )
                }) : <p className="mt-10 text-center text-sm text-[#83765d]">{searchQuery ? 'No messages match your search.' : `Start the conversation with ${selectedPerson.name}.`}</p>}
                {selectedPendingRequest && (
                  <div className="mx-auto mt-5 w-full max-w-xl rounded-2xl border border-[#d7c9ad] bg-[#f8f3e9] p-4 shadow-sm">
                    <p className="text-xs font-bold uppercase tracking-wide text-accent">
                      {selectedPendingRequest.sender_id === currentUserId ? 'Message request sent' : 'Message request'}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{selectedPendingRequest.content}</p>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      {selectedPendingRequest.sender_id === currentUserId
                        ? `${selectedPerson.name} must accept before you can chat.`
                        : `${selectedPerson.name} can message you normally after you accept.`}
                    </p>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
              {messageAccessLoading ? (
                <div className="border-t border-[#d7c9ad] bg-[#eee5d3] p-4 text-center text-sm text-muted-foreground" aria-live="polite">Checking message permissions…</div>
              ) : !messageAccess ? (
                <div className="border-t border-[#d7c9ad] bg-[#eee5d3] p-4 text-center text-sm text-muted-foreground">Message permissions are unavailable. Try again after the connection is restored.</div>
              ) : messageAccess.account_blocked ? (
                <div className="border-t border-[#d7c9ad] bg-[#eee5d3] p-4 text-center text-sm text-muted-foreground">Messaging is unavailable because one of these accounts has blocked the other.</div>
              ) : selectedPendingRequest && selectedPendingRequest.recipient_id === currentUserId ? (
                <div className="grid grid-cols-2 gap-3 border-t border-[#d7c9ad] bg-[#eee5d3] p-3 sm:p-4">
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
                <div className="border-t border-[#d7c9ad] bg-[#eee5d3] p-4 text-center text-sm text-muted-foreground">Your message request is waiting for {selectedPerson.name} to respond.</div>
              ) : !messageAccess.can_send_direct && !messageAccess.can_send_request ? (
                <div className="border-t border-[#d7c9ad] bg-[#eee5d3] p-4 text-center text-sm text-muted-foreground">You can’t message this account right now.</div>
              ) : (
                <form onSubmit={(event) => void sendMessage(event)} className="flex flex-col gap-2 border-t border-[#d7c9ad] bg-[#eee5d3] p-3 sm:p-4">
                  {!messageAccess.can_send_direct && <p className="text-xs text-muted-foreground">They don’t follow you yet. Your first message will be sent as a request.</p>}
                  {replyingTo && messageAccess.can_send_direct && (
                    <div className="flex items-center gap-3 border-l-2 border-accent px-3 py-1 text-xs">
                      <CornerUpLeft className="size-4 shrink-0 text-accent" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">Replying to {replyingTo.sender_id === currentUserId ? 'yourself' : selectedPerson.name}</span>
                        <span className="block truncate text-muted-foreground">{replyingTo.content}</span>
                      </span>
                      <button type="button" onClick={() => setReplyingTo(null)} className="flex size-9 items-center justify-center rounded-full hover:bg-background/70" aria-label="Cancel reply"><X className="size-4" /></button>
                    </div>
                  )}
                  <div className="flex items-end gap-2">
                    <label htmlFor="message-composer" className="sr-only">{messageAccess.can_send_direct ? 'Write a message' : 'Write a message request'}</label>
                    <textarea ref={composerRef} id="message-composer" value={draft} maxLength={2000} onChange={(event) => setDraft(event.target.value)} onKeyDown={handleComposerKeyDown} rows={1} placeholder={messageAccess.can_send_direct ? 'Write a message…' : 'Write a message request…'} className="min-h-11 min-w-0 flex-1 resize-y rounded-2xl border border-[#d7c9ad] bg-[#f8f3e9] px-4 py-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                    {draft.trim() ? (
                      <button type="submit" disabled={sending} className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-[#956c16] text-white disabled:opacity-50" aria-label={messageAccess.can_send_direct ? 'Send message' : 'Send message request'}>
                        {sending ? <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Send className="size-4" />}
                      </button>
                    ) : (
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
                    )}
                  </div>
                </form>
              )}
            </>
          ) : (
            <div className="m-auto max-w-md px-6 py-12 text-center">
              <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-secondary text-accent"><Send className="size-6" /></span>
              <h2 className="mt-4 font-serif text-xl font-bold">Make room for a good conversation</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">Messages from readers and creators will show up here.</p>
            </div>
          )}
        </section>
        {infoPanelOpen && selectedPerson && (
          <aside className="absolute inset-y-0 right-0 z-20 flex w-[min(22rem,92%)] flex-col overflow-y-auto border-l border-[#d7c9ad] bg-[#eee5d3] shadow-xl md:static md:z-auto md:w-auto md:shadow-none" aria-label="Conversation information">
            <div className="flex min-h-14 items-center justify-between border-b border-[#d7c9ad] px-4">
              <h2 className="text-sm font-bold">Conversation info</h2>
              <button type="button" onClick={() => setInfoPanelOpen(false)} className="flex size-10 items-center justify-center rounded-full hover:bg-background/70" aria-label="Close conversation info"><X className="size-5" /></button>
            </div>
            <div className="flex flex-col items-center px-5 pb-5 pt-6 text-center">
              <ProfileAvatar src={selectedPerson.avatarUrl} name={selectedPerson.name} className="size-20" imageSizes="80px" />
              <h3 className="mt-3 text-lg font-bold">{selectedPerson.name}</h3>
              <p className="text-sm text-muted-foreground">@{selectedPerson.username}</p>
              <div className="mt-4 flex w-full justify-center gap-3">
                <Link href={`/profile/${encodeURIComponent(selectedPerson.id)}`} className="flex min-w-20 flex-col items-center gap-1 rounded-xl px-4 py-2 text-xs font-semibold hover:bg-background/70">
                  <span className="flex size-10 items-center justify-center rounded-full bg-[#ded4c2]"><UserRound className="size-5" /></span>
                  Profile
                </Link>
                <button type="button" onClick={() => { setConversationSearchOpen(true); setInfoPanelOpen(false) }} className="flex min-w-20 flex-col items-center gap-1 rounded-xl px-4 py-2 text-xs font-semibold hover:bg-background/70">
                  <span className="flex size-10 items-center justify-center rounded-full bg-[#ded4c2]"><Search className="size-5" /></span>
                  Search
                </button>
              </div>
              <span className="mt-3 rounded-full bg-[#ded4c2] px-3 py-1.5 text-xs font-semibold text-muted-foreground">Text-only conversation</span>
            </div>
            <div className="space-y-1 border-t border-[#d7c9ad] px-4 py-3">
              <button type="button" onClick={() => toggleInfoSection('chat')} className="flex min-h-11 w-full items-center justify-between text-left text-sm font-bold" aria-expanded={infoSection === 'chat'}>
                Chat info <ChevronDown className={`size-4 transition-transform ${infoSection === 'chat' ? 'rotate-180' : ''}`} />
              </button>
              {infoSection === 'chat' && (
                <div className="space-y-3 pb-3 text-sm">
                  <p className="flex items-center gap-3 text-muted-foreground"><Info className="size-4 shrink-0" />Conversation with @{selectedPerson.username}</p>
                  <p className="flex items-center gap-3 text-muted-foreground"><FileText className="size-4 shrink-0" />{threadMessages.length} {threadMessages.length === 1 ? 'message' : 'messages'}</p>
                </div>
              )}
              <button type="button" onClick={() => toggleInfoSection('customize')} className="flex min-h-11 w-full items-center justify-between text-left text-sm font-bold" aria-expanded={infoSection === 'customize'}>
                Customize chat <ChevronDown className={`size-4 transition-transform ${infoSection === 'customize' ? 'rotate-180' : ''}`} />
              </button>
              {infoSection === 'customize' && <p className="pb-3 text-sm leading-6 text-muted-foreground"><Palette className="mr-2 inline size-4" />This conversation follows the current StoryLines theme.</p>}
              <button type="button" onClick={() => toggleInfoSection('privacy')} className="flex min-h-11 w-full items-center justify-between text-left text-sm font-bold" aria-expanded={infoSection === 'privacy'}>
                Privacy &amp; support <ChevronDown className={`size-4 transition-transform ${infoSection === 'privacy' ? 'rotate-180' : ''}`} />
              </button>
              {infoSection === 'privacy' && (
                <div className="space-y-3 pb-3 text-sm leading-6 text-muted-foreground">
                  <p className="flex items-start gap-3"><ShieldCheck className="mt-1 size-4 shrink-0" />Only the conversation participants can access these messages.</p>
                  <p>Read receipts show when the recipient has opened a message.</p>
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
        )}
      </Panel>
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
                ? `${people.get(confirmation.accountId)?.name ?? 'This account'} won’t be able to message you or send message requests. You can unblock them later.`
                : confirmation.status === 'archived'
                  ? 'This conversation will leave your main inbox. You can find it later under Archived Messages.'
                  : 'This removes the conversation from your inbox only. The other person keeps their copy, and you won’t see this history again unless a new message arrives.'}
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setConfirmation(null)} className="inline-flex min-h-11 items-center justify-center rounded-full border border-border px-4 text-sm font-bold hover:bg-muted">Cancel</button>
              <button type="button" onClick={() => void confirmAction()} className={`inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-bold ${confirmation.status === 'blocked' || confirmation.status === 'deleted' ? 'bg-destructive text-white hover:brightness-95' : 'bg-accent text-accent-foreground hover:brightness-95'}`}>
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
