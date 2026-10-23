'use client'

import { useState } from 'react'
import { MessageSquareReply, ThumbsDown, ThumbsUp } from 'lucide-react'
import { ProfileAvatar } from '@/components/shared/profile-avatar'
import type { CommunityComment } from '@/lib/types'

function timeAgo(timestamp: number) {
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000))
  if (minutes < 1) return 'Now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

export function CommunityCommentThread({
  comments,
  currentUserId,
  onProfile,
  onReply,
  onReaction,
  onLoginRequired,
}: {
  comments: CommunityComment[]
  currentUserId: string | null
  onProfile: (id: string) => void
  onReply: (comment: CommunityComment) => void
  onReaction: (comment: CommunityComment, reaction: 'like' | 'dislike') => Promise<void>
  onLoginRequired: () => void
}) {
  const [expandedReplies, setExpandedReplies] = useState<string[]>([])
  const [pendingReactions, setPendingReactions] = useState<string[]>([])
  const [reactionOverrides, setReactionOverrides] = useState<Record<string, Pick<CommunityComment, 'likes' | 'dislikes' | 'myReaction'>>>({})
  const [reactionError, setReactionError] = useState<string | null>(null)
  const roots = comments.filter((comment) => !comment.parentCommentId)
  const repliesByParent = new Map<string, CommunityComment[]>()
  for (const comment of comments) {
    if (!comment.parentCommentId) continue
    const replies = repliesByParent.get(comment.parentCommentId) ?? []
    replies.push(comment)
    repliesByParent.set(comment.parentCommentId, replies)
  }

  const toggleReaction = async (comment: CommunityComment, reaction: 'like' | 'dislike') => {
    if (!currentUserId) {
      onLoginRequired()
      return
    }
    if (pendingReactions.includes(comment.id)) return
    const previous = reactionOverrides[comment.id]
    const currentReaction = previous?.myReaction ?? comment.myReaction
    const nextReaction = currentReaction === reaction ? null : reaction
    const nextCounts = {
      likes: Math.max(0, (comment.likes ?? 0) + (currentReaction === 'like' ? -1 : 0) + (nextReaction === 'like' ? 1 : 0)),
      dislikes: Math.max(0, (comment.dislikes ?? 0) + (currentReaction === 'dislike' ? -1 : 0) + (nextReaction === 'dislike' ? 1 : 0)),
      myReaction: nextReaction,
    }
    setReactionOverrides((current) => ({ ...current, [comment.id]: nextCounts }))
    setPendingReactions((items) => [...items, comment.id])
    try {
      await onReaction(comment, reaction)
      setReactionError(null)
    } catch (error) {
      setReactionOverrides((current) => {
        const next = { ...current }
        if (previous) next[comment.id] = previous
        else delete next[comment.id]
        return next
      })
      setReactionError(error instanceof Error ? error.message : 'Could not save this reaction.')
    } finally {
      setPendingReactions((items) => items.filter((id) => id !== comment.id))
    }
  }

  const renderComment = (comment: CommunityComment, nested = false) => {
    const displayComment = { ...comment, ...reactionOverrides[comment.id] }
    const replies = repliesByParent.get(comment.id) ?? []
    const repliesExpanded = expandedReplies.includes(comment.id)
    return (
      <article key={comment.id} className={`flex gap-2.5 ${nested ? 'ml-8 border-l-2 border-border pl-3' : ''}`}>
        <button type="button" onClick={() => onProfile(comment.authorId)} className="self-start rounded-full focus-visible:outline-2 focus-visible:outline-ring" aria-label={`View ${comment.authorName}'s profile`}>
          <ProfileAvatar src={comment.authorAvatarUrl} name={comment.authorName} className={nested ? 'size-8' : 'size-9'} imageSizes={nested ? '32px' : '36px'} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="inline-block max-w-full rounded-2xl bg-secondary/70 px-3 py-2.5">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <button type="button" onClick={() => onProfile(comment.authorId)} className="text-left text-xs font-bold hover:text-accent hover:underline">
                {comment.authorName}
              </button>
              {comment.authorUsername && <span className="text-[11px] text-muted-foreground">@{comment.authorUsername}</span>}
              <time className="text-[11px] text-muted-foreground" dateTime={new Date(comment.createdAt).toISOString()}>{timeAgo(comment.createdAt)}</time>
            </div>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5">{comment.content}</p>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 px-2 text-[11px] text-muted-foreground">
            <button type="button" aria-pressed={displayComment.myReaction === 'like'} disabled={pendingReactions.includes(comment.id)} onClick={() => void toggleReaction(displayComment, 'like')} className={`inline-flex min-h-8 items-center gap-1 font-semibold hover:text-accent focus-visible:outline-2 focus-visible:outline-ring ${displayComment.myReaction === 'like' ? 'text-accent' : ''}`}>
              <ThumbsUp className="size-3.5" /> {displayComment.likes ? displayComment.likes : 'Like'}
            </button>
            <button type="button" aria-pressed={displayComment.myReaction === 'dislike'} disabled={pendingReactions.includes(comment.id)} onClick={() => void toggleReaction(displayComment, 'dislike')} className={`inline-flex min-h-8 items-center gap-1 font-semibold hover:text-accent focus-visible:outline-2 focus-visible:outline-ring ${displayComment.myReaction === 'dislike' ? 'text-accent' : ''}`}>
              <ThumbsDown className="size-3.5" /> {displayComment.dislikes ? displayComment.dislikes : 'Dislike'}
            </button>
            {!nested && (
              <button type="button" onClick={() => currentUserId ? onReply(comment) : onLoginRequired()} className="inline-flex min-h-8 items-center gap-1 font-semibold hover:text-accent focus-visible:outline-2 focus-visible:outline-ring">
                <MessageSquareReply className="size-3.5" /> Reply
              </button>
            )}
            {!nested && replies.length > 0 && (
              <button type="button" aria-expanded={repliesExpanded} onClick={() => setExpandedReplies((current) => current.includes(comment.id) ? current.filter((id) => id !== comment.id) : [...current, comment.id])} className="inline-flex min-h-8 items-center gap-1 font-semibold hover:text-accent focus-visible:outline-2 focus-visible:outline-ring">
                {repliesExpanded ? 'Hide' : 'View'} {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
              </button>
            )}
          </div>
          {repliesExpanded && replies.length > 0 && <div className="mt-1 flex flex-col gap-2.5">{replies.map((reply) => renderComment(reply, true))}</div>}
        </div>
      </article>
    )
  }

  return roots.length > 0
    ? <div className="flex flex-col gap-3">{reactionError && <p role="alert" className="text-xs text-destructive">{reactionError}</p>}{roots.map((comment) => renderComment(comment))}</div>
    : <p className="py-2 text-sm text-muted-foreground">Wala pang comments. Ikaw ang mauna!</p>
}
