'use client'

import { useState } from 'react'
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Check, MessageSquareReply, MoreHorizontal, PenLine, Send, Smile, ThumbsDown, ThumbsUp, Trash2, X } from 'lucide-react'
import { ContentReportMenuItem, type ReportTargetType } from '@/components/shared/content-report-menu-item'
import { MentionTextField } from '@/components/shared/mention-text-field'
import { ProfileAvatar } from '@/components/shared/profile-avatar'
import { getErrorMessage } from '@/lib/error-message'
import type { CommunityComment } from '@/lib/types'

const VISIBLE_REPLY_COUNT = 2

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
  onEdit,
  onLoginRequired,
  replyTargetId,
  replyTargetName,
  replyDraft,
  replyError,
  onReplyDraftChange,
  onReplySubmit,
  onReplyCancel,
  replySubmitting = false,
  reportTargetType = 'comment',
  allowReports = true,
}: {
  comments: CommunityComment[]
  currentUserId: string | null
  onProfile: (id: string) => void
  onReply: (comment: CommunityComment) => void
  onReaction: (comment: CommunityComment, reaction: 'like' | 'dislike') => Promise<void>
  onDelete?: (comment: CommunityComment) => Promise<void>
  onEdit?: (comment: CommunityComment, content: string) => Promise<void>
  onLoginRequired: () => void
  replyTargetId?: string | null
  replyTargetName?: string
  replyDraft?: string
  replyError?: string | null
  onReplyDraftChange?: (value: string) => void
  onReplySubmit?: (event: React.FormEvent<HTMLFormElement>) => void
  onReplyCancel?: () => void
  replySubmitting?: boolean
  allowReports?: boolean
  reportTargetType?: Extract<ReportTargetType, 'comment' | 'chapter_comment' | 'work_comment'>
}) {
  const [expandedReplies, setExpandedReplies] = useState<string[]>([])
  const [pendingReactions, setPendingReactions] = useState<string[]>([])
  const [reactionOverrides, setReactionOverrides] = useState<Record<string, Pick<CommunityComment, 'likes' | 'dislikes' | 'myReaction'>>>({})
  const [reactionError, setReactionError] = useState<string | null>(null)
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null)
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [editError, setEditError] = useState<string | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [hiddenComments, setHiddenComments] = useState<Set<string>>(new Set())
  const roots = comments.filter((comment) => !comment.parentCommentId)
  const repliesByParent = new Map<string, CommunityComment[]>()
  for (const comment of comments) {
    if (!comment.parentCommentId) continue
    const replies = repliesByParent.get(comment.parentCommentId) ?? []
    replies.push(comment)
    repliesByParent.set(comment.parentCommentId, replies)
  }

  const handleReplyKeyDown = (event: ReactKeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
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

  const saveCommentEdit = async (event: FormEvent<HTMLFormElement>, comment: CommunityComment) => {
    event.preventDefault()
    const content = editDraft.trim()
    if (!content || content.length > 500) {
      setEditError('A comment must be between 1 and 500 characters.')
      return
    }
    if (!onEdit) return

    setSavingEdit(true)
    setEditError(null)
    try {
      await onEdit(comment, content)
      setEditingCommentId(null)
      setEditDraft('')
    } catch (error) {
      setEditError(getErrorMessage(error, 'Could not edit this comment.'))
    } finally {
      setSavingEdit(false)
    }
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
    if (hiddenComments.has(comment.id)) return null
    const displayComment = { ...comment, ...reactionOverrides[comment.id] }
    const replies = repliesByParent.get(comment.id) ?? []
    const repliesExpanded = expandedReplies.includes(comment.id)
    const visibleReplies = repliesExpanded ? replies : replies.slice(0, VISIBLE_REPLY_COUNT)
    const hiddenReplyCount = replies.length - visibleReplies.length
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
            {editingCommentId === comment.id ? (
              <form onSubmit={(event) => void saveCommentEdit(event, comment)} className="mt-2 min-w-56 space-y-2">
                <label className="sr-only" htmlFor={`edit-comment-${comment.id}`}>Edit your comment</label>
                <textarea
                  id={`edit-comment-${comment.id}`}
                  autoFocus
                  value={editDraft}
                  onChange={(event) => setEditDraft(event.target.value)}
                  maxLength={500}
                  rows={3}
                  disabled={savingEdit}
                  className="w-full resize-y rounded-lg border border-input bg-background px-2.5 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                />
                {editError && <p role="alert" className="text-xs text-destructive">{editError}</p>}
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => { setEditingCommentId(null); setEditError(null) }} disabled={savingEdit} className="inline-flex min-h-8 items-center gap-1 rounded-full px-2.5 text-xs font-semibold text-muted-foreground hover:bg-secondary disabled:opacity-50">
                    <X className="size-3.5" /> Cancel
                  </button>
                  <button type="submit" disabled={savingEdit || !editDraft.trim()} className="inline-flex min-h-8 items-center gap-1 rounded-full bg-accent px-3 text-xs font-bold text-accent-foreground disabled:opacity-50">
                    <Check className="size-3.5" /> {savingEdit ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </form>
            ) : (
              <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5">{comment.content}</p>
            )}
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
            {currentUserId === comment.authorId && onEdit && editingCommentId !== comment.id && (
              <button
                type="button"
                onClick={() => {
                  setEditingCommentId(comment.id)
                  setEditDraft(comment.content)
                  setEditError(null)
                }}
                className="inline-flex min-h-8 items-center gap-1 font-semibold hover:text-accent focus-visible:outline-2 focus-visible:outline-ring"
                aria-label="Edit your comment"
              >
                <PenLine className="size-3.5" /> Edit
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
            {allowReports && currentUserId !== comment.authorId && (
              <details className="group relative">
                <summary className="inline-flex size-8 cursor-pointer list-none items-center justify-center rounded-full hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring" aria-label="Comment actions">
                  <MoreHorizontal className="size-4" />
                </summary>
                <div role="menu" aria-label="Comment actions" className="absolute left-0 z-20 mt-1 min-w-44 rounded-xl border border-border bg-card p-1 shadow-lg">
                  <ContentReportMenuItem
                    targetType={reportTargetType}
                    targetId={comment.id}
                    reportedUserId={comment.authorId}
                    reportedName={comment.authorName}
                    reportedUsername={comment.authorUsername}
                    currentUserId={currentUserId}
                    contentLabel="comment"
                    onHide={() => setHiddenComments((current) => new Set(current).add(comment.id))}
                  />
                </div>
              </details>
            )}
            {!nested && replies.length > 0 && (
              <button type="button" aria-expanded={repliesExpanded} onClick={() => setExpandedReplies((current) => current.includes(comment.id) ? current.filter((id) => id !== comment.id) : [...current, comment.id])} className="inline-flex min-h-8 items-center gap-1 font-semibold hover:text-accent focus-visible:outline-2 focus-visible:outline-ring">
                {repliesExpanded ? 'Hide' : 'View'} {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
              </button>
            )}
          </div>
          {replies.length > 0 && (
            <div className="mt-1 flex flex-col gap-2.5">
              {visibleReplies.map((reply) => renderComment(reply, true))}
              {hiddenReplyCount > 0 && (
                <button
                  type="button"
                  aria-expanded={repliesExpanded}
                  onClick={() => setExpandedReplies((current) => current.includes(comment.id) ? current : [...current, comment.id])}
                  className="ml-11 min-h-8 self-start text-left text-xs font-semibold text-accent hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                >
                  View {hiddenReplyCount} more {hiddenReplyCount === 1 ? 'reply' : 'replies'}
                </button>
              )}
              {repliesExpanded && replies.length > VISIBLE_REPLY_COUNT && (
                <button
                  type="button"
                  aria-expanded="true"
                  onClick={() => setExpandedReplies((current) => current.filter((id) => id !== comment.id))}
                  className="ml-11 min-h-8 self-start text-left text-xs font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                >
                  Hide extra replies
                </button>
              )}
            </div>
          )}
          {replyTargetId === comment.id && onReplySubmit && onReplyDraftChange && onReplyCancel && (
            <form onSubmit={onReplySubmit} className="ml-2 mt-3 overflow-hidden rounded-lg border border-border bg-background shadow-sm">
              <label className="sr-only" htmlFor={`reply-comment-${comment.id}`}>Write a reply to {replyTargetName}</label>
              <MentionTextField
                as="textarea"
                id={`reply-comment-${comment.id}`}
                value={replyDraft ?? ''}
                currentUserId={currentUserId}
                onChange={onReplyDraftChange}
                onKeyDown={handleReplyKeyDown}
                placeholder={`Reply to ${replyTargetName}…`}
                maxLength={500}
                rows={3}
                disabled={replySubmitting}
                className="block min-h-20 w-full resize-y bg-transparent px-3 py-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:opacity-60"
              />
              {replyError && <p role="alert" className="px-3 pb-2 text-xs text-destructive">{replyError}</p>}
              <div className="flex min-h-11 items-center justify-between gap-3 border-t border-border bg-secondary/30 px-2.5 py-1.5">
                <button type="button" onClick={() => onReplyDraftChange(`${replyDraft ?? ''}😊`)} disabled={replySubmitting} className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-accent disabled:opacity-50" aria-label="Add a smile emoji">
                  <Smile className="size-4" />
                </button>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">{(replyDraft ?? '').length}/500</span>
                  <button type="button" onClick={onReplyCancel} disabled={replySubmitting} className="min-h-9 rounded-md px-2.5 text-xs font-semibold text-muted-foreground hover:bg-background disabled:opacity-50">
                    Cancel
                  </button>
                  <button type="submit" disabled={replySubmitting || !(replyDraft ?? '').trim()} className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-accent px-3.5 text-xs font-bold text-accent-foreground hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50">
                    <Send className="size-3.5" /> {replySubmitting ? 'Posting…' : 'Post'}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </article>
    )
  }

  return roots.length > 0
    ? <div className="divide-y divide-border">{reactionError && <p role="alert" className="py-2 text-xs text-destructive">{reactionError}</p>}{roots.map((comment) => <div key={comment.id} className="py-4 first:pt-0 last:pb-0">{renderComment(comment)}</div>)}</div>
    : <p className="py-2 text-sm text-muted-foreground">Wala pang comments. Ikaw ang mauna!</p>
}
