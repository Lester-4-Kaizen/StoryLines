'use client'

import { useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { MessageSquareReply, Send, Smile, ThumbsDown, ThumbsUp, Trash2, X } from 'lucide-react'
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
  onDelete,
  onLoginRequired,
  replyTargetId,
  replyTargetName,
  replyDraft,
  onReplyDraftChange,
  onReplySubmit,
  onReplyCancel,
  replySubmitting = false,
}: {
  comments: CommunityComment[]
  currentUserId: string | null
  onProfile: (id: string) => void
  onReply: (comment: CommunityComment) => void
  onReaction: (comment: CommunityComment, reaction: 'like' | 'dislike') => Promise<void>
  onDelete?: (comment: CommunityComment) => Promise<void>
  onLoginRequired: () => void
  replyTargetId?: string | null
  replyTargetName?: string
  replyDraft?: string
  onReplyDraftChange?: (value: string) => void
  onReplySubmit?: (event: React.FormEvent<HTMLFormElement>) => void
  onReplyCancel?: () => void
  replySubmitting?: boolean
}) {
  const [expandedReplies, setExpandedReplies] = useState<string[]>([])
  const [pendingReactions, setPendingReactions] = useState<string[]>([])
  const [reactionOverrides, setReactionOverrides] = useState<Record<string, Pick<CommunityComment, 'likes' | 'dislikes' | 'myReaction'>>>({})
  const [reactionError, setReactionError] = useState<string | null>(null)
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null)
  const roots = comments.filter((comment) => !comment.parentCommentId)
  const repliesByParent = new Map<string, CommunityComment[]>()
  for (const comment of comments) {
    if (!comment.parentCommentId) continue
    const replies = repliesByParent.get(comment.parentCommentId) ?? []
    replies.push(comment)
    repliesByParent.set(comment.parentCommentId, replies)
  }

  const handleReplyKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key !== 'Enter'
      || event.shiftKey
      || event.nativeEvent.isComposing
      || event.nativeEvent.keyCode === 229
      || replySubmitting
      || !(replyDraft ?? '').trim()
    ) return
    event.preventDefault()
    event.currentTarget.form?.requestSubmit()
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
              <button type="button" onClick={() => {
                if (!currentUserId) {
                  onLoginRequired()
                  return
                }
                setExpandedReplies((current) => current.includes(comment.id) ? current : [...current, comment.id])
                onReply(comment)
              }} className="inline-flex min-h-8 items-center gap-1 font-semibold hover:text-accent focus-visible:outline-2 focus-visible:outline-ring">
                <MessageSquareReply className="size-3.5" /> Reply
              </button>
            )}
            {currentUserId === comment.authorId && onDelete && (
              <button
                type="button"
                disabled={deletingCommentId === comment.id}
                onClick={() => {
                  setDeletingCommentId(comment.id)
                  void onDelete(comment).catch((error: unknown) => {
                    setReactionError(error instanceof Error ? error.message : 'Could not delete this comment.')
                  }).finally(() => setDeletingCommentId(null))
                }}
                className="inline-flex min-h-8 items-center gap-1 font-semibold hover:text-destructive focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
                aria-label="Delete your comment"
              >
                <Trash2 className="size-3.5" /> Delete
              </button>
            )}
            {!nested && replies.length > 0 && (
              <button type="button" aria-expanded={repliesExpanded} onClick={() => setExpandedReplies((current) => current.includes(comment.id) ? current.filter((id) => id !== comment.id) : [...current, comment.id])} className="inline-flex min-h-8 items-center gap-1 font-semibold hover:text-accent focus-visible:outline-2 focus-visible:outline-ring">
                {repliesExpanded ? 'Hide' : 'View'} {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
              </button>
            )}
          </div>
          {repliesExpanded && replies.length > 0 && <div className="mt-1 flex flex-col gap-2.5">{replies.map((reply) => renderComment(reply, true))}</div>}
          {replyTargetId === comment.id && onReplySubmit && onReplyDraftChange && onReplyCancel && (
            <form onSubmit={onReplySubmit} className="ml-2 mt-2 rounded-2xl border border-border bg-secondary/55 p-2.5 shadow-sm sm:p-3">
              <div className="flex items-start gap-2.5">
                <ProfileAvatar name={replyTargetName ?? 'You'} className="mt-1 size-8" imageSizes="32px" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2">
                    <span className="shrink-0 rounded-md bg-accent/15 px-2 py-1 text-xs font-bold text-accent">
                      @{replyTargetName}
                    </span>
                    <label className="sr-only" htmlFor={`reply-comment-${comment.id}`}>Write a reply to {replyTargetName}</label>
                    <textarea
                      id={`reply-comment-${comment.id}`}
                      value={replyDraft ?? ''}
                      onChange={(event) => onReplyDraftChange(event.target.value)}
                      onKeyDown={handleReplyKeyDown}
                      placeholder="Write a reply…"
                      maxLength={500}
                      rows={1}
                      disabled={replySubmitting}
                      className="min-h-9 min-w-0 flex-1 resize-y bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-60"
                    />
                    <button type="button" onClick={onReplyCancel} disabled={replySubmitting} className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50" aria-label="Cancel reply">
                      <X className="size-4" />
                    </button>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between">
                    <button type="button" onClick={() => onReplyDraftChange(`${replyDraft ?? ''}😊`)} disabled={replySubmitting} className="flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-accent disabled:opacity-50" aria-label="Add a smile emoji">
                      <Smile className="size-4" />
                    </button>
                    <button type="submit" disabled={replySubmitting || !(replyDraft ?? '').trim()} className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-accent px-3.5 text-xs font-bold text-accent-foreground hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50">
                      <Send className="size-3.5" /> {replySubmitting ? 'Sending…' : 'Reply'}
                    </button>
                  </div>
                </div>
              </div>
            </form>
          )}
        </div>
      </article>
    )
  }

  return roots.length > 0
    ? <div className="flex flex-col gap-3">{reactionError && <p role="alert" className="text-xs text-destructive">{reactionError}</p>}{roots.map((comment) => renderComment(comment))}</div>
    : <p className="py-2 text-sm text-muted-foreground">Wala pang comments. Ikaw ang mauna!</p>
}
