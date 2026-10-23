'use client'

import Image from 'next/image'
import { useState, type FormEvent } from 'react'
import { Bookmark, Check, Heart, MessageCircle, MoreHorizontal, PenLine, Share2, Trash2, X } from 'lucide-react'
import { isSupabaseStorageImage } from '@/lib/is-supabase-storage-image'
import { getSupabaseClient } from '@/lib/supabase'
import { CommunityCommentThread } from '@/components/shared/community-comment-thread'
import { PostDetailDialog } from '@/components/shared/post-detail-dialog'
import { ProfileAvatar } from '@/components/shared/profile-avatar'
import { ShareLinkDialog } from '@/components/shared/share-link-dialog'
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
  isOwnPost,
  onLike,
  onSave,
  onEdit,
  onDelete,
  onLoginRequired,
  onProfile,
}: {
  post: ProfilePost
  displayName: string
  username: string
  currentUserId: string | null
  isOwnPost: boolean
  onLike: (postId: string) => Promise<void>
  onSave: (postId: string) => Promise<void>
  onEdit: (postId: string, content: string) => Promise<void>
  onDelete: (postId: string) => Promise<void>
  onLoginRequired: (action: string) => void
  onProfile: (id: string) => void
}) {
  const [comments, setComments] = useState<CommunityComment[]>([])
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [commentDraft, setCommentDraft] = useState('')
  const [replyTarget, setReplyTarget] = useState<CommunityComment | null>(null)
  const [commentError, setCommentError] = useState<string | null>(null)
  const [commentSending, setCommentSending] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [likePending, setLikePending] = useState(false)
  const [savePending, setSavePending] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editDraft, setEditDraft] = useState(post.content)
  const [editError, setEditError] = useState<string | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const loadComments = async () => {
    setCommentsLoading(true)
    setCommentError(null)
    try {
      const supabase = getSupabaseClient()
      const { data, error } = await supabase
        .from('community_post_comments')
        .select('id, post_id, author_id, content, created_at, parent_comment_id')
        .eq('post_id', post.id)
        .order('created_at', { ascending: true })
        .limit(50)
      if (error) throw error
      const authorIds = Array.from(new Set((data ?? []).map((comment) => comment.author_id)))
      const { data: profiles, error: profileError } = authorIds.length
        ? await supabase.from('profiles').select('id, display_name, username, avatar_path').in('id', authorIds)
        : { data: [], error: null }
      if (profileError) throw profileError
      const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]))
      const commentIds = (data ?? []).map((comment) => comment.id)
      const [{ data: counts, error: countsError }, { data: { user }, error: userError }] = await Promise.all([
        commentIds.length
          ? supabase.rpc('get_community_comment_reaction_counts', { comment_ids: commentIds })
          : Promise.resolve({ data: [], error: null }),
        supabase.auth.getUser(),
      ])
      if (countsError) throw countsError
      if (userError) throw userError
      const { data: myReactions, error: reactionsError } = user && commentIds.length
        ? await supabase.from('community_comment_reactions').select('comment_id, reaction').eq('user_id', user.id).in('comment_id', commentIds)
        : { data: [], error: null }
      if (reactionsError) throw reactionsError
      const countsById = new Map<string, { likes: number | string; dislikes: number | string }>(
        (counts ?? []).map((row: { comment_id: string; likes: number | string; dislikes: number | string }) => [row.comment_id, row]),
      )
      const reactionsById = new Map<string, 'like' | 'dislike'>(
        (myReactions ?? []).map((row: { comment_id: string; reaction: 'like' | 'dislike' }) => [row.comment_id, row.reaction]),
      )
      setComments((data ?? []).map((comment) => {
        const author = profileById.get(comment.author_id)
        const reactionCounts = countsById.get(comment.id)
        return {
          id: comment.id,
          postId: comment.post_id,
          authorId: comment.author_id,
          authorName: author?.display_name ?? 'StoryLines reader',
          authorUsername: author?.username ?? undefined,
          authorAvatarUrl: author?.avatar_path
            ? supabase.storage.from('avatars').getPublicUrl(author.avatar_path).data.publicUrl
            : null,
          content: comment.content,
          createdAt: new Date(comment.created_at).getTime(),
          parentCommentId: comment.parent_comment_id,
          likes: Number(reactionCounts?.likes ?? 0),
          dislikes: Number(reactionCounts?.dislikes ?? 0),
          myReaction: reactionsById.get(comment.id) ?? null,
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
        .insert({ post_id: post.id, author_id: currentUserId, content, parent_comment_id: replyTarget?.id ?? null })
        .select('id, post_id, author_id, content, created_at, parent_comment_id')
        .single()
      if (error) throw error
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('display_name, username, avatar_path')
        .eq('id', currentUserId)
        .single()
      if (profileError) throw profileError
      setComments((items) => [...items, {
        id: data.id,
        postId: data.post_id,
        authorId: data.author_id,
        authorName: profile.display_name,
        authorUsername: profile.username,
        authorAvatarUrl: profile.avatar_path
          ? supabase.storage.from('avatars').getPublicUrl(profile.avatar_path).data.publicUrl
          : null,
        content: data.content,
        createdAt: new Date(data.created_at).getTime(),
        parentCommentId: data.parent_comment_id,
        likes: 0,
        dislikes: 0,
        myReaction: null,
      }])
      setCommentDraft('')
      setReplyTarget(null)
    } catch (error) {
      setCommentError(error instanceof Error ? error.message : 'Hindi naipadala ang comment. Subukan ulit.')
    } finally {
      setCommentSending(false)
    }
  }

  const toggleCommentReaction = async (comment: CommunityComment, reaction: 'like' | 'dislike') => {
    if (!currentUserId) {
      onLoginRequired('mag-react sa comment')
      return
    }
    const supabase = getSupabaseClient()
    const { data: existing, error: readError } = await supabase.from('community_comment_reactions').select('reaction').eq('comment_id', comment.id).eq('user_id', currentUserId).maybeSingle()
    if (readError) throw readError
    if (existing?.reaction === reaction) {
      const { error } = await supabase.from('community_comment_reactions').delete().eq('comment_id', comment.id).eq('user_id', currentUserId)
      if (error) throw error
    } else if (existing) {
      const { error } = await supabase.from('community_comment_reactions').update({ reaction }).eq('comment_id', comment.id).eq('user_id', currentUserId)
      if (error) throw error
    } else {
      const { error } = await supabase.from('community_comment_reactions').insert({ comment_id: comment.id, user_id: currentUserId, reaction })
      if (error) throw error
    }
    await loadComments()
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

  const saveEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const content = editDraft.trim()
    if (!content || content.length > 500) {
      setEditError('Maglagay ng post na 1 hanggang 500 characters.')
      return
    }

    setSavingEdit(true)
    setEditError(null)
    try {
      await onEdit(post.id, content)
      setEditing(false)
    } catch (error) {
      setEditError(error instanceof Error ? error.message : 'Hindi ma-edit ang post. Subukan ulit.')
    } finally {
      setSavingEdit(false)
    }
  }

  const deletePost = async () => {
    setDeleting(true)
    setDeleteError(null)
    try {
      await onDelete(post.id)
      setConfirmDelete(false)
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Hindi mabura ang post. Subukan ulit.')
      setDeleting(false)
    }
  }

  return (
    <article
      id={`post-${post.id}`}
      className="min-w-0 cursor-pointer rounded-2xl border border-border bg-card p-5 shadow-[0_2px_0_rgba(68,45,31,0.05)] sm:p-6"
      onClick={(event) => {
        if ((event.target as HTMLElement).closest('button, a, input, textarea, details, form')) return
        setDetailOpen(true)
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          setDetailOpen(true)
        }
      }}
      tabIndex={0}
      aria-label={`Open post by ${displayName}`}
    >
      <header className="flex items-center gap-3">
        <ProfileAvatar src={post.authorAvatarUrl} name={displayName} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-bold">{displayName}</h3>
          <p className="truncate text-xs text-muted-foreground">@{username} · {timeAgo(post.createdAt)}</p>
        </div>
        {isOwnPost ? (
          <details className="group relative shrink-0">
            <summary
              className="community-icon-button list-none"
              aria-label="Post actions"
              title="Post actions"
            >
              <MoreHorizontal className="size-4" />
            </summary>
            <div role="menu" aria-label="Post actions" className="absolute right-0 z-20 mt-1 w-48 rounded-xl border border-border bg-card p-1 shadow-lg">
              <button
                type="button"
                role="menuitem"
                className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-semibold hover:bg-secondary"
                onClick={(event) => {
                  event.currentTarget.closest('details')?.removeAttribute('open')
                  setEditDraft(post.content)
                  setEditError(null)
                  setEditing(true)
                }}
              >
                <PenLine className="size-4" /> Edit post
              </button>
              <button
                type="button"
                role="menuitem"
                className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-semibold text-destructive hover:bg-destructive/10"
                onClick={(event) => {
                  event.currentTarget.closest('details')?.removeAttribute('open')
                  setConfirmDelete(true)
                }}
              >
                <Trash2 className="size-4" /> Delete post
              </button>
            </div>
          </details>
        ) : (
          <span className="shrink-0 rounded-full border border-border px-3 py-1 text-xs font-semibold">
            {POST_TYPE_LABELS[post.type]}
          </span>
        )}
        {shareOpen && <ShareLinkDialog title="Share this post" url={`${window.location.origin}${window.location.pathname}#post-${post.id}`} onClose={() => setShareOpen(false)} />}
        {detailOpen && <PostDetailDialog author={post.authorDisplayName ?? displayName} username={post.authorUsername ?? username} avatarUrl={post.authorAvatarUrl} createdAt={post.createdAt} content={post.content} images={post.imageUrls} tags={post.tags} onClose={() => setDetailOpen(false)} />}
      </header>

      {editing ? (
        <form className="mt-4" onSubmit={(event) => void saveEdit(event)}>
          <label htmlFor={`edit-profile-post-${post.id}`} className="sr-only">Edit post</label>
          <textarea
            id={`edit-profile-post-${post.id}`}
            value={editDraft}
            maxLength={500}
            rows={5}
            autoFocus
            disabled={savingEdit}
            onChange={(event) => setEditDraft(event.target.value)}
            className="w-full resize-y rounded-xl border border-input bg-background p-3 text-sm leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">{editDraft.length}/500</span>
            <div className="flex gap-2">
              <button type="button" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 text-sm font-semibold hover:bg-secondary" disabled={savingEdit} onClick={() => setEditing(false)}>
                <X className="size-4" /> Cancel
              </button>
              <button type="submit" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-3 text-sm font-bold text-accent-foreground disabled:opacity-50" disabled={savingEdit || !editDraft.trim()}>
                <Check className="size-4" /> {savingEdit ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
          {editError && <p role="alert" className="mt-2 text-xs text-destructive">{editError}</p>}
        </form>
      ) : (
        <p className="mt-5 whitespace-pre-wrap break-words text-sm leading-6" onClick={() => setDetailOpen(true)}>{post.content}</p>
      )}
      {post.lookingFor.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">Looking for: {post.lookingFor.join(', ')}</p>
      )}
      {post.imageUrls.length > 0 && (
        <div className={`mt-5 grid gap-2.5 ${post.imageUrls.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {post.imageUrls.map((imageUrl, index) => (
            <button key={`${post.id}-${index}`} type="button" onClick={() => setDetailOpen(true)} aria-label={`Open post image ${index + 1}`} className="relative aspect-[16/7] cursor-zoom-in overflow-hidden rounded-xl bg-secondary">
              <Image
                src={imageUrl}
                alt={`${displayName}'s post image ${index + 1}`}
                fill
                loading="lazy"
                sizes="(max-width: 768px) 100vw, 600px"
                className="object-cover"
                unoptimized={!isSupabaseStorageImage(imageUrl)}
              />
            </button>
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
            onClick={() => setShareOpen(true)}
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

      {actionError && <p role="alert" className="mt-2 text-xs text-destructive">{actionError}</p>}
      {deleteError && <p role="alert" className="mt-2 text-xs text-destructive">{deleteError}</p>}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/45 p-4" onClick={(event) => {
          if (event.target === event.currentTarget && !deleting) setConfirmDelete(false)
        }}>
          <section role="dialog" aria-modal="true" aria-labelledby={`delete-profile-post-${post.id}`} className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-xl">
            <h2 id={`delete-profile-post-${post.id}`} className="font-serif text-xl font-bold">Delete this post?</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">This will permanently remove your post and its comments. You can’t undo this action.</p>
            {deleteError && <p role="alert" className="mt-3 text-sm text-destructive">{deleteError}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="min-h-11 rounded-xl border border-border px-4 text-sm font-semibold hover:bg-secondary" onClick={() => setConfirmDelete(false)} disabled={deleting}>Cancel</button>
              <button type="button" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-destructive px-4 text-sm font-bold text-white disabled:opacity-50" onClick={() => void deletePost()} disabled={deleting}>
                <Trash2 className="size-4" /> {deleting ? 'Deleting…' : 'Delete post'}
              </button>
            </div>
          </section>
        </div>
      )}
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
            <CommunityCommentThread
              comments={comments}
              currentUserId={currentUserId}
              onProfile={onProfile}
              onReply={(comment) => {
                setReplyTarget(comment)
                requestAnimationFrame(() => document.getElementById(`comment-${post.id}`)?.focus())
              }}
              onReaction={toggleCommentReaction}
              onLoginRequired={() => onLoginRequired('mag-react sa comment')}
            />
          )}
          <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={(event) => void submitComment(event)}>
            {replyTarget && <div className="flex items-center justify-between rounded-lg bg-secondary/60 px-3 py-2 text-xs sm:order-first"><span>Replying to <strong>{replyTarget.authorName}</strong></span><button type="button" onClick={() => setReplyTarget(null)} className="min-h-8 px-2 font-bold">Cancel</button></div>}
            <label htmlFor={`comment-${post.id}`} className="sr-only">Write a comment</label>
            <input
              id={`comment-${post.id}`}
              value={commentDraft}
              maxLength={500}
              onChange={(event) => setCommentDraft(event.target.value)}
              placeholder={replyTarget ? `Reply to ${replyTarget.authorName}…` : currentUserId ? 'Write a comment…' : 'Mag-log in para mag-comment'}
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
