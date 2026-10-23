'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { UserRound, X } from 'lucide-react'
import { getSupabaseClient } from '@/lib/supabase'

type Direction = 'followers' | 'following'
type Connection = {
  id: string
  displayName: string
  username: string
  avatarUrl: string | null
}
type ConnectionCursor = { createdAt: string; id: string }
type ConnectionRow = {
  profile_id: string
  display_name: string
  username: string
  avatar_path: string | null
  followed_at: string
}

const PAGE_SIZE = 20

function mapConnection(row: ConnectionRow): Connection {
  return {
    id: row.profile_id,
    displayName: row.display_name,
    username: row.username,
    avatarUrl: row.avatar_path
      ? getSupabaseClient().storage.from('avatars').getPublicUrl(row.avatar_path).data.publicUrl
      : null,
  }
}

export function ProfileConnectionsDialog({
  profileId,
  direction,
  onDirectionChange,
  onClose,
}: {
  profileId: string
  direction: Direction
  onDirectionChange: (direction: Direction) => void
  onClose: () => void
}) {
  const [connections, setConnections] = useState<Connection[]>([])
  const [cursor, setCursor] = useState<ConnectionCursor | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadVersion, setReloadVersion] = useState(0)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeButtonRef.current?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    setConnections([])
    setCursor(null)
    setHasMore(false)

    void (async () => {
      try {
        const { data, error: requestError } = await getSupabaseClient()
          .rpc('get_community_connections', {
            p_profile_id: profileId,
            p_direction: direction,
            p_cursor_created_at: null,
            p_cursor_profile_id: null,
            p_page_size: PAGE_SIZE + 1,
          })
        if (requestError) throw requestError
        const rows = (data ?? []) as ConnectionRow[]
        const page = rows.slice(0, PAGE_SIZE)
        if (!active) return
        setConnections(page.map(mapConnection))
        setHasMore(rows.length > PAGE_SIZE)
        const last = page.at(-1)
        setCursor(last && rows.length > PAGE_SIZE
          ? { createdAt: rows[PAGE_SIZE - 1].followed_at, id: rows[PAGE_SIZE - 1].profile_id }
          : null)
      } catch (requestError) {
        if (active) {
          setError(requestError instanceof Error
            ? requestError.message
            : 'Hindi ma-load ang listahan. Subukan ulit.')
        }
      } finally {
        if (active) setLoading(false)
      }
    })()

    return () => {
      active = false
    }
  }, [direction, profileId, reloadVersion])

  const loadMore = async () => {
    if (!cursor || loadingMore) return
    setLoadingMore(true)
    setError(null)
    try {
      const { data, error: requestError } = await getSupabaseClient().rpc('get_community_connections', {
        p_profile_id: profileId,
        p_direction: direction,
        p_cursor_created_at: cursor.createdAt,
        p_cursor_profile_id: cursor.id,
        p_page_size: PAGE_SIZE + 1,
      })
      if (requestError) throw requestError
      const rows = (data ?? []) as ConnectionRow[]
      const page = rows.slice(0, PAGE_SIZE)
      setConnections((current) => [...current, ...page.map(mapConnection)])
      setHasMore(rows.length > PAGE_SIZE)
      const last = page.at(-1)
      setCursor(last && rows.length > PAGE_SIZE
        ? { createdAt: rows[PAGE_SIZE - 1].followed_at, id: rows[PAGE_SIZE - 1].profile_id }
        : null)
    } catch (requestError) {
      setError(requestError instanceof Error
        ? requestError.message
        : 'Hindi ma-load ang susunod na listahan. Subukan ulit.')
    } finally {
      setLoadingMore(false)
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key !== 'Tab') return
    const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
      'button:not(:disabled), a[href], input:not(:disabled), [tabindex]:not([tabindex="-1"])',
    ))
    const first = focusable[0]
    const last = focusable.at(-1)
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first?.focus()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-connections-title"
        onKeyDown={handleKeyDown}
        className="flex max-h-[min(80vh,38rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl"
      >
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 id="profile-connections-title" className="font-serif text-xl font-bold">
            {direction === 'followers' ? 'Followers' : 'Following'}
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Close connections list"
            onClick={onClose}
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            <X className="size-5" />
          </button>
        </header>
        <div className="grid grid-cols-2 border-b border-border p-2" role="group" aria-label="Connection type">
          {(['followers', 'following'] as const).map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={direction === item}
              onClick={() => onDirectionChange(item)}
              className={`min-h-11 rounded-lg text-sm font-semibold capitalize focus-visible:outline-2 focus-visible:outline-ring ${
                direction === item ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2" aria-live="polite">
          {loading ? (
            <p className="p-4 text-center text-sm text-muted-foreground">Naglo-load…</p>
          ) : error && connections.length === 0 ? (
            <div className="p-4 text-center">
              <p role="alert" className="text-sm text-destructive">{error}</p>
              <button
                type="button"
                onClick={() => setReloadVersion((version) => version + 1)}
                className="mt-2 min-h-11 px-3 text-sm font-semibold text-accent underline"
              >
                Subukan ulit
              </button>
            </div>
          ) : connections.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Wala pang {direction === 'followers' ? 'followers' : 'sinusundan'} dito.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {connections.map((connection) => (
                <li key={connection.id}>
                  <Link
                    href={`/profile/${encodeURIComponent(connection.id)}`}
                    onClick={onClose}
                    className="flex min-h-16 items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <span className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary text-accent">
                      {connection.avatarUrl
                        ? <Image src={connection.avatarUrl} alt="" fill sizes="40px" className="object-cover" />
                        : <UserRound className="size-5" aria-hidden="true" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{connection.displayName}</span>
                      <span className="block truncate text-xs text-muted-foreground">@{connection.username}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {error && connections.length > 0 && <p role="alert" className="p-3 text-center text-sm text-destructive">{error}</p>}
        </div>
        {hasMore && (
          <footer className="border-t border-border p-3">
            <button
              type="button"
              disabled={loadingMore}
              onClick={() => void loadMore()}
              className="min-h-11 w-full rounded-full border border-border text-sm font-semibold hover:bg-muted disabled:opacity-60"
            >
              {loadingMore ? 'Naglo-load…' : 'Ipakita pa'}
            </button>
          </footer>
        )}
      </div>
    </div>
  )
}
