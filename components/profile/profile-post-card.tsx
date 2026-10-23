'use client'

import Image from 'next/image'
import { useState, type FormEvent } from 'react'
import { Bookmark, Heart, MessageCircle, Share2 } from 'lucide-react'
import { getSupabaseClient } from '@/lib/supabase'
import { isSupabaseStorageImage } from '@/lib/is-supabase-storage-image'
import type { ProfilePost } from '@/lib/profile-data'
import type { CommunityComment } from '@/lib/types'

const POST_TYPE_LABELS: Record<ProfilePost['type'], string> = {
  update: 'Update',
  recommendation: 'Recommendation',
  'work-in-progress': 'Work in progress',
  collaborator: 'Collaboration',
  feedback: 'Feedback',
  poll: 'Poll',
  random: 'Random',
}

function timeAgo(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000))
  if (minutes < 1) return 'Ngayon lang'
  if (minutes < 60) return `${minutes}m ang nakalipas`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function ProfilePostCard({
  post,
  displayName,
  username,
  currentUserId,
  onLike,
  onSave,
  onLoginRequired,
}: {
  post: ProfilePost
  displayName: string
  username: string
  currentUserId: string | null
  onLike: (postId: string) => Promise<void>
  onSave: (postId: string) => Promise<void>
  onLoginRequired: (action: string) => void
}) {
  const [comments, setComments] = useState<CommunityComment[]>([])
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [commentDraft, setCommentDraft] = useState('')
  const [commentError, setCommentError] = useState<string | null>(null)
  const [commentSending, setCommentSending] = useState(false)
  const [shareMessage, setShareMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [likePending, setLikePending] = useState(false)
  const [savePending, setSavePending] = useState(false)

  const loadComments = async () => {
    setCommentsLoading(true)
    setCommentError(null)
    try {
      const supabase = getSupabaseClient()
      const { data, error } = await supabase
        .from('community_post_comments')
        .select('id, post_id, author_id, content, created_at')
        .eq('post_id', post.id)
        .order('created_at', { ascending: true })
        .limit(50)
      if (error) throw error
      const authorIds = Array.from(new Set((data ?? []).map((comment) => comment.author_id)))
      const { data: profiles, error: profileError } = authorIds.length
        ? await supabase.from('profiles').select('id, display_name, username').in('id', authorIds)
        : { data: [], error: null }
      if (profileError) throw profileError
      const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]))
      setComments((data ?? []).map((comment) => {
        const author = profileById.get(comment.author_id)
        return {
          id: comment.id,
          postId: comment.post_id,
          authorId: comment.author_id,
          authorName: author?.display_name ?? 'StoryLines reader',
          authorUsername: author?.username ?? undefined,
          content: comment.content,
          createdAt: new Date(comment.created_at).getTime(),
        }
      }))
    } catch (error) {
      setCommentError(error instanceof Error ? error.message : 'Hindi ma-load ang comments. Subukan ulit.')
    } finally {
      setCommentsLoading(false)
    }
  }

  const toggleComments = async () => {
    if (commentsOpen) {
      setCommentsOpen(false)
      return
    }
    setCommentsOpen(true)
    await loadComments()
  }

  const submitComment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const content = commentDraft.trim()
    if (!currentUserId) {
      onLoginRequired('mag-comment')
      return
    }
    if (!content || content.length > 500) {
      setCommentError('Maglagay ng comment na 1 hanggang 500 characters.')
      return
    }

    setCommentSending(true)
    setCommentError(null)
    try {
      const supabase = getSupabaseClient()
      const { data, error } = await supabase
        .from('community_post_comments')
        .insert({ post_id: post.id, author_id: currentUserId, content })
        .select('id, post_id, author_id, content, created_at')
        .single()
      if (error) throw error
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('display_name, username')
        .eq('id', currentUserId)
        .single()
      if (profileError) throw profileError
      setComments((items) => [...items, {
        id: data.id,
        postId: data.post_id,
        authorId: data.author_id,
        authorName: profile.display_name,
        authorUsername: profile.username,
        content: data.content,
        createdAt: new Date(data.created_at).getTime(),
      }])
      setCommentDraft('')
    } catch (error) {
      setCommentError(error instanceof Error ? error.message : 'Hindi naipadala ang comment. Subukan ulit.')
    } finally {
      setCommentSending(false)
    }
  }

  const sharePost = async () => {
    const url = `${window.location.origin}${window.location.pathname}#post-${post.id}`
    try {
      await navigator.clipboard.writeText(url)
      setShareMessage('Link copied!')
    } catch {
      setShareMessage(url)
    }
  }

  const runAction = async (action: () => Promise<void>) => {
    setActionError(null)
    try {
      await action()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Hindi na-update ang post. Subukan ulit.')
    }
  }

  const likePost = async () => {
    if (likePending) return
    setLikePending(true)
    await runAction(() => onLike(post.id))
    setLikePending(false)
  }

  const savePost = async () => {
    if (savePending) return
    setSavePending(true)
    await runAction(() => onSave(post.id))
    setSavePending(false)
  }

  return (
    <article id={`post-${post.id}`} className="min-w-0 rounded-2xl border border-border bg-card p-4 shadow-[0_2px_0_rgba(68,45,31,0.05)] sm:p-5">
      <header className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-accent" aria-hidden="true">
          {displayName.slice(0, 1).toLocaleUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-bold">{displayName}</h3>
          <p className="truncate text-xs text-muted-foreground">@{username} · {timeAgo(post.createdAt)}</p>
        </div>
        <span className="rounded-full border border-border px-3 py-1 text-xs font-semibold">
          {POST_TYPE_LABELS[post.type]}
        </span>
      </header>

      <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-6">{post.content}</p>
      {post.lookingFor.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">Looking for: {post.lookingFor.join(', ')}</p>
      )}
      {post.imageUrls.length > 0 && (
        <div className={`mt-4 grid gap-2 ${post.imageUrls.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {post.imageUrls.map((imageUrl, index) => (
            <div key={`${post.id}-${index}`} className="relative aspect-[16/7] overflow-hidden rounded-xl bg-secondary">
              <Image
                src={imageUrl}
                alt={`${displayName}'s post image ${index + 1}`}
                fill
                loading="lazy"
                sizes="(max-width: 768px) 100vw, 600px"
                className="object-cover"
                unoptimized={!isSupabaseStorageImage(imageUrl)}
              />
            </div>
          ))}
        </div>
      )}
      {post.tags.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="Post tags">
          {post.tags.map((tag) => (
            <li key={tag} className="rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground">#{tag}</li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2">
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring ${post.likedByMe ? 'text-accent' : ''}`}
            aria-pressed={post.likedByMe}
            disabled={likePending}
            onClick={() => currentUserId ? void likePost() : onLoginRequired('mag-like')}
          >
            <Heart className={`size-4 ${post.likedByMe ? 'fill-current' : ''}`} /> Like
            <span className="sr-only">, {post.likes} likes</span>
          </button>
          <button
            type="button"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            aria-expanded={commentsOpen}
            onClick={() => void toggleComments()}
          >
            <MessageCircle className="size-4" /> Comment
          </button>
          <button
            type="button"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => void sharePost()}
          >
            <Share2 className="size-4" /> Share
          </button>
        </div>
        <button
          type="button"
          className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring ${post.savedByMe ? 'text-accent' : ''}`}
          aria-pressed={post.savedByMe}
          disabled={savePending}
          onClick={() => currentUserId ? void savePost() : onLoginRequired('mag-save')}
        >
          <Bookmark className={`size-4 ${post.savedByMe ? 'fill-current' : ''}`} /> {post.savedByMe ? 'Saved' : 'Save'}
        </button>
      </div>

      {shareMessage && <p role="status" className="mt-2 break-all text-xs text-muted-foreground">{shareMessage}</p>}
      {actionError && <p role="alert" className="mt-2 text-xs text-destructive">{actionError}</p>}

      {commentsOpen && (
        <section className="mt-3 border-t border-border pt-3" aria-label="Comments">
          {commentsLoading ? (
            <p className="text-xs text-muted-foreground" aria-live="polite">Naglo-load ng comments…</p>
          ) : commentError && comments.length === 0 ? (
            <div className="flex items-center justify-between gap-3">
              <p role="alert" className="text-xs text-destructive">{commentError}</p>
              <button type="button" className="min-h-11 text-xs font-bold text-accent" onClick={() => void loadComments()}>Subukan ulit</button>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {comments.map((comment) => (
                <li key={comment.id} className="rounded-xl bg-secondary/50 p-3">
                  <p className="text-xs font-bold">{comment.authorName} {comment.authorUsername ? `· @${comment.authorUsername}` : ''}</p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm">{comment.content}</p>
                </li>
              ))}
              {comments.length === 0 && <li className="text-xs text-muted-foreground">Wala pang comments. Ikaw ang mauna!</li>}
            </ul>
          )}
          <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={(event) => void submitComment(event)}>
            <label htmlFor={`comment-${post.id}`} className="sr-only">Write a comment</label>
            <input
              id={`comment-${post.id}`}
              value={commentDraft}
              maxLength={500}
              onChange={(event) => setCommentDraft(event.target.value)}
              placeholder={currentUserId ? 'Write a comment…' : 'Mag-log in para mag-comment'}
              disabled={!currentUserId}
              className="min-h-11 min-w-0 flex-1 rounded-full border border-input bg-background px-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {currentUserId ? (
              <button type="submit" disabled={commentSending} className="min-h-11 rounded-full bg-accent px-4 text-sm font-bold text-accent-foreground disabled:opacity-60">
                {commentSending ? 'Sending…' : 'Comment'}
              </button>
            ) : (
              <button type="button" onClick={() => onLoginRequired('mag-comment')} className="min-h-11 rounded-full bg-accent px-4 text-sm font-bold text-accent-foreground">
                Log in
              </button>
            )}
          </form>
          {commentError && <p role="alert" className="mt-2 text-xs text-destructive">{commentError}</p>}
        </section>
      )}
    </article>
  )
}
