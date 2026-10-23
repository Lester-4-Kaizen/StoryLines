'use client'

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Send } from 'lucide-react'
import { Panel } from '@/components/shared/panel'
import { ProfileAvatar } from '@/components/shared/profile-avatar'
import { useAppState } from '@/lib/app-state'
import { getSupabaseClient } from '@/lib/supabase'

type Message = {
  id: string
  sender_id: string
  recipient_id: string
  content: string
  created_at: string
  read_at: string | null
}
type Person = { id: string; name: string; username: string; avatarUrl: string | null }
type MessageFilter = 'all' | 'unread'
const MESSAGE_PAGE_SIZE = 100

export function MessagesView() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const targetUserId = searchParams.get('user')
  const { currentUserId } = useAppState()
  const [messages, setMessages] = useState<Message[]>([])
  const [people, setPeople] = useState<Map<string, Person>>(new Map())
  const [selectedUserId, setSelectedUserId] = useState<string | null>(targetUserId)
  const [filter, setFilter] = useState<MessageFilter>('all')
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [hasMoreMessages, setHasMoreMessages] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadVersion, setReloadVersion] = useState(0)

  useEffect(() => {
    setSelectedUserId(targetUserId)
  }, [targetUserId])

  useEffect(() => {
    if (!currentUserId) {
      setMessages([])
      setLoading(false)
      return
    }
    let active = true
    setLoading(true)
    setError(null)
    void (async () => {
      const supabase = getSupabaseClient()
      const { data, error: messagesError } = await supabase
        .from('community_direct_messages')
        .select('id, sender_id, recipient_id, content, created_at, read_at')
        .or(`sender_id.eq.${currentUserId},recipient_id.eq.${currentUserId}`)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(MESSAGE_PAGE_SIZE)
      if (messagesError) throw messagesError
      const partnerIds = Array.from(new Set((data ?? []).map((message) => (
        message.sender_id === currentUserId ? message.recipient_id : message.sender_id
      ))))
      if (targetUserId) partnerIds.push(targetUserId)
      const uniquePartnerIds = Array.from(new Set(partnerIds))
      const { data: profiles, error: profilesError } = uniquePartnerIds.length
        ? await supabase.from('profiles').select('id, display_name, username, avatar_path').in('id', uniquePartnerIds)
        : { data: [], error: null }
      if (profilesError) throw profilesError
      if (!active) return
      setMessages((data ?? []).slice().reverse())
      setHasMoreMessages((data?.length ?? 0) === MESSAGE_PAGE_SIZE)
      setPeople(new Map((profiles ?? []).map((profile) => [profile.id, {
        id: profile.id,
        name: profile.display_name,
        username: profile.username,
        avatarUrl: profile.avatar_path
          ? supabase.storage.from('avatars').getPublicUrl(profile.avatar_path).data.publicUrl
          : null,
      }])))
    })().catch((loadError: unknown) => {
      if (active) setError(loadError instanceof Error ? loadError.message : 'Could not load your messages.')
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => {
      active = false
    }
  }, [currentUserId, targetUserId, reloadVersion])

  const loadOlderMessages = async () => {
    const cursor = messages[0]
    if (!cursor || loadingOlder || !hasMoreMessages) return
    setLoadingOlder(true)
    setError(null)
    try {
      const supabase = getSupabaseClient()
      const { data, error: olderError } = await supabase
        .from('community_direct_messages')
        .select('id, sender_id, recipient_id, content, created_at, read_at')
        .or(`sender_id.eq.${currentUserId},recipient_id.eq.${currentUserId}`)
        .or(`created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(MESSAGE_PAGE_SIZE)
      if (olderError) throw olderError
      const olderMessages = (data ?? []).slice().reverse()
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
      setMessages((current) => [...olderMessages, ...current])
      setHasMoreMessages((data?.length ?? 0) === MESSAGE_PAGE_SIZE)
    } catch (olderError) {
      setError(olderError instanceof Error ? olderError.message : 'Could not load older messages.')
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
      }))
      .filter((conversation) => filter === 'all' || conversation.unread > 0)
      .sort((a, b) => new Date(b.latest.created_at).getTime() - new Date(a.latest.created_at).getTime())
  }, [currentUserId, filter, messages])

  const threadMessages = useMemo(() => selectedUserId
    ? messages.filter((message) => (
      (message.sender_id === currentUserId && message.recipient_id === selectedUserId)
      || (message.sender_id === selectedUserId && message.recipient_id === currentUserId)
    ))
    : [], [currentUserId, messages, selectedUserId])
  const selectedPerson = selectedUserId ? people.get(selectedUserId) : undefined

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
    })().catch((updateError: unknown) => {
      setError(updateError instanceof Error ? updateError.message : 'Could not mark messages as read.')
    })
  }, [currentUserId, selectedUserId, threadMessages])

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const content = draft.trim()
    if (!currentUserId || !selectedUserId) return
    if (!content || content.length > 2000) {
      setError('Write a message between 1 and 2,000 characters.')
      return
    }
    setSending(true)
    setError(null)
    try {
      const { data, error: sendError } = await getSupabaseClient()
        .from('community_direct_messages')
        .insert({ sender_id: currentUserId, recipient_id: selectedUserId, content })
        .select('id, sender_id, recipient_id, content, created_at, read_at')
        .single()
      if (sendError) throw sendError
      setMessages((current) => [...current, data])
      setDraft('')
      if (!selectedPerson) setReloadVersion((version) => version + 1)
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Could not send your message.')
    } finally {
      setSending(false)
    }
  }

  const selectConversation = (userId: string) => {
    setSelectedUserId(userId)
    router.replace(`/messages?user=${encodeURIComponent(userId)}`, { scroll: false })
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <header className="mb-5">
        <span className="eyebrow">Your inbox</span>
        <h1 className="mt-1 font-serif text-3xl font-bold">My Messages</h1>
      </header>
      <Panel className="grid min-h-[min(72vh,52rem)] overflow-hidden p-0 md:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className={`min-w-0 border-border md:border-r ${selectedUserId ? 'hidden md:block' : ''}`} aria-label="Conversations">
          <div className="border-b border-border p-4">
            <label htmlFor="message-filter" className="sr-only">Filter messages</label>
            <select id="message-filter" value={filter} onChange={(event) => setFilter(event.target.value as MessageFilter)} className="min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring">
              <option value="all">All</option>
              <option value="unread">Unread</option>
            </select>
          </div>
          {error && (
            <div className="m-4 rounded-xl border border-destructive/30 p-3">
              <p role="alert" className="text-sm text-destructive">{error}</p>
              <button type="button" onClick={() => setReloadVersion((version) => version + 1)} className="mt-2 min-h-11 text-sm font-bold text-accent">Try again</button>
            </div>
          )}
          {loading ? (
            <div className="space-y-3 p-4" aria-busy="true" aria-label="Loading messages">{[0, 1, 2].map((item) => <div key={item} className="h-16 animate-pulse rounded-xl bg-secondary/60" />)}</div>
          ) : conversations.length ? (
            <ul className="divide-y divide-border">
              {conversations.map((conversation) => {
                const person = people.get(conversation.partnerId)
                if (!person) return null
                return (
                  <li key={person.id}>
                    <button type="button" onClick={() => selectConversation(person.id)} className={`flex min-h-20 w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted ${selectedUserId === person.id ? 'bg-secondary' : ''}`}>
                      <ProfileAvatar src={person.avatarUrl} name={person.name} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold">{person.name}</span>
                        <span className="mt-1 block truncate text-xs text-muted-foreground">{conversation.latest.sender_id === currentUserId ? 'You: ' : ''}{conversation.latest.content}</span>
                      </span>
                      {conversation.unread > 0 && <span className="flex size-6 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground">{conversation.unread}</span>}
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <div className="px-5 py-12 text-center">
              <h2 className="font-serif text-lg font-bold">{filter === 'unread' ? 'No unread messages' : 'Your messages will appear here'}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">Start a conversation from a creator’s profile to connect with the people behind the stories.</p>
              <button type="button" onClick={() => router.push('/browse')} className="mt-3 min-h-11 rounded-full bg-accent px-4 text-sm font-bold text-accent-foreground">Find creators</button>
            </div>
          )}
          {hasMoreMessages && (
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
              <header className="flex min-h-16 items-center gap-3 border-b border-border px-4 py-3">
                <button type="button" onClick={() => { setSelectedUserId(null); router.replace('/messages', { scroll: false }) }} className="flex size-11 items-center justify-center rounded-full hover:bg-muted md:hidden" aria-label="Back to messages"><ArrowLeft className="size-5" /></button>
                <ProfileAvatar src={selectedPerson.avatarUrl} name={selectedPerson.name} />
                <span className="min-w-0"><span className="block truncate text-sm font-bold">{selectedPerson.name}</span><span className="text-xs text-muted-foreground">@{selectedPerson.username}</span></span>
              </header>
              <div className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-6" aria-live="polite">
                {threadMessages.length ? threadMessages.map((message) => {
                  const isMine = message.sender_id === currentUserId
                  return (
                    <div key={message.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[min(82%,38rem)] rounded-2xl px-4 py-3 ${isMine ? 'rounded-br-md bg-accent text-accent-foreground' : 'rounded-bl-md bg-secondary text-foreground'}`}>
                        <p className="whitespace-pre-wrap break-words text-sm leading-6">{message.content}</p>
                        <time className={`mt-1 block text-right text-[11px] ${isMine ? 'text-accent-foreground/75' : 'text-muted-foreground'}`} dateTime={message.created_at}>{new Date(message.created_at).toLocaleString()}</time>
                      </div>
                    </div>
                  )
                }) : <p className="mt-10 text-center text-sm text-muted-foreground">Start the conversation with {selectedPerson.name}.</p>}
              </div>
              <form onSubmit={(event) => void sendMessage(event)} className="flex items-end gap-2 border-t border-border p-3 sm:p-4">
                <label htmlFor="message-composer" className="sr-only">Write a message</label>
                <textarea id="message-composer" value={draft} maxLength={2000} onChange={(event) => setDraft(event.target.value)} rows={2} placeholder="Write a message…" className="min-h-12 min-w-0 flex-1 resize-y rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                <button type="submit" disabled={sending || !draft.trim()} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-bold text-accent-foreground disabled:opacity-50"><Send className="size-4" />{sending ? 'Sending…' : 'Send'}</button>
              </form>
              {error && (
                <div className="px-4 pb-3">
                  <p role="alert" className="text-sm text-destructive">{error}</p>
                  <button type="button" onClick={() => setReloadVersion((version) => version + 1)} className="mt-2 min-h-11 text-sm font-bold text-accent">Try again</button>
                </div>
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
      </Panel>
    </div>
  )
}
