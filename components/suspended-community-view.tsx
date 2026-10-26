'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ShieldAlert } from 'lucide-react'
import { ProfileAvatar } from '@/components/shared/profile-avatar'
import type { ModerationStatus } from '@/lib/moderation/status'
import { getSupabaseClient } from '@/lib/supabase'

type CommunityPost = {
  id: string
  author_id: string
  author_role: string
  type: string
  content: string
  image_urls: string[]
  created_at: string
  authorName: string
  authorUsername: string
  authorAvatar: string | null
}

export function SuspendedCommunityView({ status }: { status: ModerationStatus }) {
  const [posts, setPosts] = useState<CommunityPost[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void (async () => {
      const supabase = getSupabaseClient()
      const { data: rows, error: postsError } = await supabase
        .from('community_posts')
        .select('id, author_id, author_role, type, content, image_urls, created_at')
        .order('created_at', { ascending: false })
        .limit(50)
      if (postsError) throw postsError

      const authorIds = Array.from(new Set((rows ?? []).map((post) => post.author_id)))
      const { data: authors, error: authorsError } = authorIds.length
        ? await supabase.from('profiles').select('id, display_name, username, avatar_path').in('id', authorIds)
        : { data: [], error: null }
      if (authorsError) throw authorsError

      const authorsById = new Map((authors ?? []).map((author) => [author.id, author]))
      if (!active) return
      setPosts((rows ?? []).map((post) => {
        const author = authorsById.get(post.author_id)
        return {
          ...post,
          authorName: author?.display_name ?? 'StoryLines member',
          authorUsername: author?.username ?? '',
          authorAvatar: author?.avatar_path
            ? supabase.storage.from('avatars').getPublicUrl(author.avatar_path).data.publicUrl
            : null,
        }
      }))
    })().catch((loadError: unknown) => {
      if (active) setError(loadError instanceof Error ? loadError.message : 'Could not load public posts.')
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => {
      active = false
    }
  }, [])

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-6 pb-12">
      <aside role="alert" className="mb-5 flex gap-3 rounded-xl border border-red-300 bg-red-50 p-4 text-red-950">
        <ShieldAlert className="mt-0.5 size-5 shrink-0 text-red-700" aria-hidden="true" />
        <div>
          <h1 className="font-bold">Your account is suspended</h1>
          <p className="mt-1 text-sm leading-5">
            {status.latestMessage ?? 'You can view public community posts only. Posting, commenting, reporting, messaging, and reading stories are unavailable during your suspension.'}
          </p>
          {status.suspendedUntil && (
            <p className="mt-1 text-sm font-semibold">Suspension ends {new Date(status.suspendedUntil).toLocaleString()}.</p>
          )}
          <Link href="/account-restricted?status=suspended" className="mt-2 inline-flex min-h-9 items-center text-sm font-bold underline">
            View suspension details
          </Link>
        </div>
      </aside>

      <header className="mb-4">
        <h2 className="font-serif text-2xl font-bold">Public community posts</h2>
        <p className="mt-1 text-sm text-muted-foreground">Read-only view. Account interactions are disabled.</p>
      </header>

      {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-card p-4 text-sm text-destructive">{error}</p>}
      {loading && <p role="status" className="py-8 text-center text-sm text-muted-foreground">Loading public posts…</p>}
      {!loading && !error && posts.length === 0 && <p className="rounded-xl border border-border bg-card p-6 text-sm">There are no public posts to show.</p>}

      <ul className="space-y-3">
        {posts.map((post) => (
          <li key={post.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <article>
              <header className="mb-3 flex items-center gap-3">
                <ProfileAvatar src={post.authorAvatar} name={post.authorName} className="size-10" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">{post.authorName}</p>
                  <p className="text-xs text-muted-foreground">
                    {post.authorUsername ? `@${post.authorUsername} · ` : ''}{post.type.replaceAll('-', ' ')}
                  </p>
                </div>
                <time className="ml-auto shrink-0 text-xs text-muted-foreground" dateTime={post.created_at}>
                  {new Date(post.created_at).toLocaleDateString()}
                </time>
              </header>
              <p className="whitespace-pre-wrap break-words text-sm leading-6">{post.content}</p>
              {post.image_urls.length > 0 && (
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {post.image_urls.map((url, index) => (
                    <li key={`${post.id}-${index}`}>
                          <img src={url} alt="" loading="lazy" className="max-h-80 w-full rounded-lg object-contain" />
                    </li>
                  ))}
                </ul>
              )}
            </article>
          </li>
        ))}
      </ul>
    </main>
  )
}
