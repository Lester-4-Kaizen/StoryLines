'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Bookmark,
  Brush,
  Check,
  Compass,
  Trash2,
  MoreHorizontal,
  Handshake,
  Heart,
  ImagePlus,
  MessageCircle,
  PenLine,
  Plus,
  Search,
  Send,
  Share2,
  Sparkles,
  UsersRound,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/shared/panel'
import { useCommunity } from '@/lib/community-store'
import type { Badge, CommunityComment, CommunityPostType, Post } from '@/lib/types'

const MAX_POST_LENGTH = 500
const MAX_IMAGES = 4
const MAX_FILE_SIZE = 8 * 1024 * 1024
const IMAGE_MAX_EDGE = 1280
const POST_TYPES: { value: CommunityPostType; label: string }[] = [
  { value: 'update', label: 'Update' },
  { value: 'recommendation', label: 'Reading reco' },
  { value: 'work-in-progress', label: 'Work-in-progress' },
  { value: 'collaborator', label: 'Looking for collaborator' },
  { value: 'feedback', label: 'Feedback request' },
  { value: 'poll', label: 'Poll' },
  { value: 'random', label: 'Random story / post' },
]
const COLLABORATOR_ROLES = ['Writer', 'Artist', 'Editor', 'Cover designer', 'Translator']
const SUGGESTED_TAGS: Record<CommunityPostType, string[]> = {
  update: ['writing-progress', 'new-chapter', 'behind-the-scenes', 'creative-life'],
  recommendation: ['book-recommendation', 'reading-list', 'favorite-story', 'webcomic'],
  'work-in-progress': ['work-in-progress', 'drafting', 'worldbuilding', 'illustration'],
  collaborator: ['collaboration', 'looking-for-writer', 'looking-for-artist', 'open-call'],
  feedback: ['feedback-welcome', 'critique', 'cover-art', 'story-review'],
  poll: ['community-poll', 'story-ideas', 'character-design', 'choose-for-me'],
  random: ['random-thought', 'mini-story', 'writing-prompt', 'just-for-fun'],
}

type FeedTab = 'for-you' | 'following' | 'latest' | 'collaborators' | 'authors' | 'saved'
type PreviewImage = { name: string; dataUrl: string }

function timeAgo(ts: number) {
  const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (seconds < 60) return 'Ngayon lang'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min ang nakalipas`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} oras ang nakalipas`
  return `${Math.floor(hours / 24)} araw ang nakalipas`
}

function roleLabel(role: Post['authorRole']) {
  return role === 'artist' ? 'Alagad ng sining' : 'Writer'
}

function postTypeLabel(type: CommunityPostType | undefined) {
  return POST_TYPES.find((item) => item.value === type)?.label ?? 'Update'
}

async function compressImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Pumili ng image file.')
  if (file.size > MAX_FILE_SIZE) throw new Error('Hanggang 8 MB lang ang image bago i-compress.')

  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, IMAGE_MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const context = canvas.getContext('2d')
  if (!context) {
    bitmap.close()
    throw new Error('Hindi maihanda ang image. Subukan ulit.')
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.76))
  if (!blob) throw new Error('Hindi ma-compress ang image. Subukan ang ibang file.')
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Hindi mabasa ang image.'))
    reader.onerror = () => reject(new Error('Hindi mabasa ang image.'))
    reader.readAsDataURL(blob)
  })
}

function Avatar({
  role,
  large = false,
  onClick,
  label,
}: {
  role?: 'writer' | 'artist'
  large?: boolean
  onClick?: () => void
  label?: string
}) {
  const Icon = role === 'artist' ? Brush : role === 'writer' ? PenLine : UsersRound
  if (onClick) {
    return (
      <button
        type="button"
        className={`community-avatar${large ? ' community-avatar-large' : ''} community-avatar-link`}
        onClick={onClick}
        aria-label={label ?? 'Open profile'}
      >
        <Icon className={large ? 'size-5' : 'size-4'} />
      </button>
    )
  }
  return (
    <span className={`community-avatar${large ? ' community-avatar-large' : ''}`} aria-hidden="true">
      <Icon className={large ? 'size-5' : 'size-4'} />
    </span>
  )
}

function FeedPost({
  post,
  onLike,
  isSaved,
  isLoggedIn,
  onUnlock,
  onSave,
  onLoadComments,
  onAddComment,
  onProfileClick,
  canDelete,
  canEdit,
  onDelete,
  onEdit,
}: {
  post: Post
  onLike: (id: string) => void
  isSaved: boolean
  isLoggedIn: boolean
  onUnlock: () => void
  onSave: (id: string) => Promise<void>
  onLoadComments: (id: string) => Promise<CommunityComment[]>
  onAddComment: (id: string, content: string) => Promise<CommunityComment>
  onProfileClick: (id: string) => void
  canDelete: boolean
  canEdit: boolean
  onDelete: (id: string) => Promise<void>
  onEdit: (id: string, content: string) => Promise<void>
}) {
  const [expanded, setExpanded] = useState(false)
  const [shareMessage, setShareMessage] = useState<string | null>(null)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [comments, setComments] = useState<CommunityComment[]>([])
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [commentDraft, setCommentDraft] = useState('')
  const [commentError, setCommentError] = useState<string | null>(null)
  const [commentSubmitting, setCommentSubmitting] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editDraft, setEditDraft] = useState(post.content)
  const [editError, setEditError] = useState<string | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const postAuthorId = post.authorId
  const images = post.imageUrls?.length ? post.imageUrls : post.imageUrl ? [post.imageUrl] : []
  const tags = post.tags ?? []

  const sharePost = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/community#post-${post.id}`)
      setShareMessage('Link copied!')
    } catch {
      setShareMessage('Hindi makopya ang link sa device na ito.')
    }
  }

  const toggleComments = async () => {
    if (commentsOpen) {
      setCommentsOpen(false)
      return
    }
    if (!post.authorId) {
      setCommentError('Comments are only available on shared posts.')
      return
    }

    setCommentsOpen(true)
    setCommentsLoading(true)
    setCommentError(null)
    try {
      setComments(await onLoadComments(post.id))
    } catch (loadError) {
      setCommentError(loadError instanceof Error ? loadError.message : 'Hindi ma-load ang comments. Subukan ulit.')
    } finally {
      setCommentsLoading(false)
    }
  }

  const submitComment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const content = commentDraft.trim()
    if (!content) {
      setCommentError('Maglagay muna ng comment.')
      return
    }

    setCommentSubmitting(true)
    setCommentError(null)
    try {
      const comment = await onAddComment(post.id, content)
      setComments((current) => [...current, comment])
      setCommentDraft('')
    } catch (submitError) {
      setCommentError(submitError instanceof Error ? submitError.message : 'Hindi naipadala ang comment. Subukan ulit.')
    } finally {
      setCommentSubmitting(false)
    }
  }

  const savePost = async () => {
    if (!isLoggedIn) {
      onUnlock()
      return
    }
    setSaveError(null)
    try {
      await onSave(post.id)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Hindi ma-save ang post. Subukan ulit.')
    }
  }

  const deleteOwnPost = async () => {
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

  const saveEdit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const content = editDraft.trim()
    if (!content) {
      setEditError('Maglagay muna ng mensahe bago i-save.')
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

  return (
    <article className="community-card">
      <div className="flex items-start gap-3">
        <Avatar role={post.authorRole} onClick={postAuthorId ? () => onProfileClick(postAuthorId) : undefined} label={`Open ${post.authorName ?? 'author'} profile`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {postAuthorId ? (
              <button type="button" className="text-sm font-bold hover:text-accent hover:underline" onClick={() => onProfileClick(postAuthorId)}>
                {post.authorName || 'StoryLines creator'}
              </button>
            ) : (
              <span className="text-sm font-bold">{post.authorName || 'Ikaw'}</span>
            )}
            <span className="community-role">{roleLabel(post.authorRole)}</span>
            {!post.authorId && <span className="community-role">On this device</span>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {post.authorUsername && <span>@{post.authorUsername}</span>}
            {post.authorUsername && <span aria-hidden="true">·</span>}
            <time dateTime={new Date(post.createdAt).toISOString()}>{timeAgo(post.createdAt)}</time>
            {post.type !== 'random' && (
              <>
                <span aria-hidden="true">·</span>
                <span className="community-type">{postTypeLabel(post.type)}</span>
              </>
            )}
          </div>
        </div>
        {(canEdit || canDelete) && !editing && (
          <details className="group relative">
            <summary
              className="community-icon-button list-none"
              aria-label="Post actions"
              title="Post actions"
            >
              <MoreHorizontal className="size-4" />
            </summary>
            <div role="menu" aria-label="Post actions" className="absolute right-0 z-20 mt-1 w-48 rounded-xl border border-border bg-card p-1 shadow-lg">
              {canEdit && (
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
              )}
              {canDelete && (
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
              )}
            </div>
          </details>
        )}
      </div>

      {editing ? (
        <form className="mt-4" onSubmit={(event) => void saveEdit(event)}>
          <label className="sr-only" htmlFor={`edit-post-${post.id}`}>Edit post</label>
          <textarea
            id={`edit-post-${post.id}`}
            value={editDraft}
            onChange={(event) => setEditDraft(event.target.value)}
            maxLength={MAX_POST_LENGTH}
            rows={5}
            autoFocus
            disabled={savingEdit}
            className="community-composer-textarea border border-input"
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">{editDraft.length}/{MAX_POST_LENGTH}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 text-sm font-semibold hover:bg-secondary"
                onClick={() => {
                  setEditing(false)
                  setEditError(null)
                }}
                disabled={savingEdit}
              >
                <X className="size-4" /> Cancel
              </button>
              <button
                type="submit"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-3 text-sm font-bold text-accent-foreground hover:brightness-95 disabled:opacity-50"
                disabled={savingEdit || !editDraft.trim()}
              >
                <Check className="size-4" /> {savingEdit ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
          {editError && <p role="alert" className="mt-2 text-xs text-destructive">{editError}</p>}
        </form>
      ) : (
        <div className="mt-4">
          <p className={`whitespace-pre-wrap break-words text-sm leading-6 ${!expanded ? 'community-post-copy' : ''}`}>{post.content}</p>
          {post.content.length > 260 && (
            <button type="button" className="mt-1 text-xs font-bold text-accent hover:underline" onClick={() => setExpanded((value) => !value)}>
              {expanded ? 'See less' : 'See more'}
            </button>
          )}
        </div>
      )}

      {post.type === 'collaborator' && post.lookingFor?.length ? (
        <div className="mt-3 rounded-xl border border-border bg-secondary/55 p-3">
          <p className="text-xs font-bold text-foreground">Looking for</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {post.lookingFor.map((item) => <span className="community-tag" key={item}>{item}</span>)}
          </div>
          <button type="button" className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg bg-accent px-3 text-sm font-bold text-accent-foreground hover:brightness-95" disabled title="Reach out opens in a later phase">
            <Send className="size-4" /> Reach out
          </button>
        </div>
      ) : null}

      {images.length > 0 && (
        <div className={`community-image-grid community-image-grid-${Math.min(images.length, 4)} mt-4`} aria-label={`${images.length} attached ${images.length === 1 ? 'image' : 'images'}`}>
          {images.map((src, index) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={`${post.id}-${index}`} src={src} alt={`Post attachment ${index + 1}`} loading="lazy" />
          ))}
        </div>
      )}

      {tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {tags.map((tag) => <span key={tag} className="community-tag">#{tag}</span>)}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between border-b border-border pb-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Heart className={`size-3.5 ${post.likedByMe ? 'fill-accent text-accent' : ''}`} />
          {post.likes} {post.likes === 1 ? 'reaction' : 'reactions'}
        </span>
        <span>{shareMessage ?? (post.commentsCount === undefined ? 'Comments' : `${post.commentsCount} comments`)}</span>
      </div>
      <div className="grid grid-cols-4 gap-1 pt-2">
        <button type="button" className={`community-action ${post.likedByMe ? 'community-action-active' : ''}`} aria-pressed={post.likedByMe} onClick={() => onLike(post.id)}>
          <Heart className={`size-4 ${post.likedByMe ? 'fill-current' : ''}`} /> Like
        </button>
        <button
          type="button"
          className={`community-action ${commentsOpen ? 'community-action-active' : ''}`}
          aria-expanded={commentsOpen}
          onClick={() => void toggleComments()}
          disabled={!post.authorId}
          title={!post.authorId ? 'Comments are only available on shared posts' : undefined}
        >
          <MessageCircle className="size-4" /> Comment
        </button>
        <button
          type="button"
          className="community-action"
          onClick={() => void sharePost()}
        >
          <Share2 className="size-4" /> Share
        </button>
        <button
          type="button"
          className={`community-action ${isSaved ? 'community-action-active' : ''}`}
          aria-pressed={isSaved}
          onClick={() => void savePost()}
          disabled={!post.authorId}
          title={!post.authorId ? 'Only shared posts can be saved' : undefined}
        >
          <Bookmark className={`size-4 ${isSaved ? 'fill-current' : ''}`} /> {isSaved ? 'Saved' : 'Save'}
        </button>
      </div>
      {saveError && <p role="alert" className="mt-2 text-xs text-destructive">{saveError}</p>}
      {deleteError && <p role="alert" className="mt-2 text-xs text-destructive">{deleteError}</p>}
      {commentsOpen && (
        <section className="mt-3 border-t border-border pt-3" aria-label="Post comments">
          {commentsLoading ? (
            <p className="py-3 text-sm text-muted-foreground">Loading comments…</p>
          ) : comments.length ? (
            <div className="flex flex-col gap-3">
              {comments.map((comment) => (
                <article key={comment.id} className="rounded-xl bg-secondary/55 px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                    <button type="button" className="font-bold hover:text-accent hover:underline" onClick={() => onProfileClick(comment.authorId)}>
                      {comment.authorName}{comment.authorUsername ? ` · @${comment.authorUsername}` : ''}
                    </button>
                    <time className="text-muted-foreground" dateTime={new Date(comment.createdAt).toISOString()}>
                      {timeAgo(comment.createdAt)}
                    </time>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5">{comment.content}</p>
                </article>
              ))}
            </div>
          ) : (
            <p className="py-2 text-sm text-muted-foreground">Wala pang comments. Ikaw ang mauna!</p>
          )}
          {isLoggedIn ? (
            <form className="mt-3 flex flex-col gap-2" onSubmit={(event) => void submitComment(event)}>
              <label className="sr-only" htmlFor={`comment-${post.id}`}>Write a comment</label>
              <textarea
                id={`comment-${post.id}`}
                value={commentDraft}
                onChange={(event) => setCommentDraft(event.target.value)}
                maxLength={500}
                rows={2}
                placeholder="Write a comment…"
                className="w-full resize-y rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-accent"
                disabled={commentSubmitting}
              />
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground">{commentDraft.length}/500</span>
                <button
                  type="submit"
                  className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-accent px-3 text-sm font-bold text-accent-foreground hover:brightness-95 disabled:opacity-50"
                  disabled={commentSubmitting || !commentDraft.trim()}
                >
                  <Send className="size-4" /> {commentSubmitting ? 'Sending…' : 'Comment'}
                </button>
              </div>
            </form>
          ) : (
            <button type="button" className="mt-3 text-sm font-bold text-accent hover:underline" onClick={onUnlock}>
              Log in to comment
            </button>
          )}
          {commentError && <p role="alert" className="mt-2 text-xs text-destructive">{commentError}</p>}
        </section>
      )}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-primary/45 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget && !deleting) setConfirmDelete(false)
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby={`delete-post-title-${post.id}`}
            className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-xl"
            onKeyDown={(event) => {
              if (event.key === 'Escape' && !deleting) {
                setConfirmDelete(false)
                return
              }
              if (event.key !== 'Tab') return
              const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
              const first = buttons[0]
              const last = buttons[buttons.length - 1]
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault()
                last?.focus()
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault()
                first?.focus()
              }
            }}
          >
            <h2 id={`delete-post-title-${post.id}`} className="font-serif text-xl font-bold">Delete this post?</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">This will permanently remove your post and its comments. You can’t undo this action.</p>
            {deleteError && <p role="alert" className="mt-3 text-sm text-destructive">{deleteError}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="min-h-11 rounded-xl border border-border px-4 text-sm font-semibold hover:bg-secondary"
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                autoFocus
              >
                Cancel
              </button>
              <button
                type="button"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-destructive px-4 text-sm font-bold text-white hover:brightness-95 disabled:opacity-50"
                onClick={() => void deleteOwnPost()}
                disabled={deleting}
              >
                <Trash2 className="size-4" /> {deleting ? 'Deleting…' : 'Delete post'}
              </button>
            </div>
          </section>
        </div>
      )}
    </article>
  )
}

export function CommunityView({
  creator,
  isLoggedIn,
  role,
  onUnlock,
}: {
  creator: boolean
  isLoggedIn: boolean
  role: Badge
  onUnlock: () => void
}) {
  const router = useRouter()
  const {
    posts,
    authors,
    savedPostIds,
    currentUserId,
    hydrated,
    error,
    refresh,
    addPost,
    toggleLike,
    deletePost,
    updatePost,
    toggleSaved,
    loadComments,
    addComment,
  } = useCommunity()
  const [composerExpanded, setComposerExpanded] = useState(false)
  const [draft, setDraft] = useState('')
  const [postType, setPostType] = useState<CommunityPostType>('update')
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [lookingFor, setLookingFor] = useState<string[]>([])
  const [images, setImages] = useState<PreviewImage[]>([])
  const [imageError, setImageError] = useState<string | null>(null)
  const [compressing, setCompressing] = useState(false)
  const [feedTab, setFeedTab] = useState<FeedTab>('for-you')
  const [composerError, setComposerError] = useState<string | null>(null)
  const [authorSearch, setAuthorSearch] = useState('')
  const [selectedAuthorId, setSelectedAuthorId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const canPost = isLoggedIn && creator

  const visiblePosts = posts
    .filter((post) => feedTab !== 'collaborators' || post.type === 'collaborator')
    .filter((post) => feedTab !== 'following')
    .filter((post) => feedTab !== 'saved' || savedPostIds.includes(post.id))
    .filter((post) => selectedAuthorId === null || post.authorId === selectedAuthorId)
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
  const authorQuery = authorSearch.trim().toLowerCase()
  const matchingAuthors = authors.filter((author) =>
    `${author.displayName} ${author.username}`.toLowerCase().includes(authorQuery),
  )
  const recentCollaborationPosts = posts.filter((post) => post.type === 'collaborator').slice(0, 3)
  const trendingTags = posts
    .flatMap((post) => post.tags ?? [])
    .reduce<{ tag: string; count: number }[]>((counts, tag) => {
      const found = counts.find((item) => item.tag === tag)
      if (found) found.count += 1
      else counts.push({ tag, count: 1 })
      return counts
    }, [])
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  const focusComposer = () => {
    if (!canPost) {
      onUnlock()
      return
    }
    setComposerExpanded(true)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  const openProfile = (authorId: string) => {
    router.push(authorId === currentUserId ? '/profile' : `/profile/${encodeURIComponent(authorId)}`)
  }

  const addTag = (value = tagInput) => {
    const nextTag = value.trim().replace(/^#/, '').replace(/\s+/g, '-').slice(0, 24)
    if (!nextTag || tags.includes(nextTag) || tags.length >= 5) return
    setTags((current) => [...current, nextTag])
    setTagInput('')
  }

  const handleImages = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (!files.length) return
    if (images.length + files.length > MAX_IMAGES) {
      setImageError('Puwede kang mag-attach ng hanggang 4 na image.')
      return
    }

    setImageError(null)
    setCompressing(true)
    try {
      const compressed = await Promise.all(files.map(async (file) => ({ name: file.name, dataUrl: await compressImage(file) })))
      setImages((current) => [...current, ...compressed])
    } catch (error) {
      setImageError(error instanceof Error ? error.message : 'Hindi maihanda ang image. Subukan ulit.')
    } finally {
      setCompressing(false)
    }
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const content = draft.trim()
    if (!content) {
      setComposerError('Magdagdag muna ng maikling mensahe bago mag-post.')
      textareaRef.current?.focus()
      return
    }
    if (postType === 'collaborator' && !lookingFor.length) {
      setComposerError('Piliin kung anong collaborator ang hinahanap mo.')
      return
    }

    setSubmitting(true)
    try {
      await addPost({
        content,
        authorRole: role === 'artist' ? 'artist' : 'writer',
        type: postType,
        imageUrls: images.map((image) => image.dataUrl),
        tags,
        lookingFor: postType === 'collaborator' ? lookingFor : [],
      })
      setDraft('')
      setPostType('update')
      setTags([])
      setTagInput('')
      setLookingFor([])
      setImages([])
      setComposerError(null)
      setComposerExpanded(false)
      setSelectedAuthorId(null)
      setFeedTab('for-you')
    } catch (postError) {
      setComposerError(postError instanceof Error ? postError.message : 'Hindi maibahagi ang post. Subukan ulit.')
    } finally {
      setSubmitting(false)
    }
  }

  const feedTabs: { id: FeedTab; label: string; disabled?: boolean }[] = [
    { id: 'for-you', label: 'For you' },
    { id: 'following', label: 'Following' },
    { id: 'latest', label: 'Latest' },
    { id: 'collaborators', label: 'Collaborators' },
    { id: 'authors', label: 'Authors' },
  ]

  return (
    <div className="community-layout">
      <header className="community-heading">
        <span className="eyebrow">Tambayan ng StoryLines</span>
        <h1 className="mt-1 font-serif text-2xl font-bold sm:text-3xl">Kuwento, likha, at kuwentuhan.</h1>
        <p className="mt-1 text-sm text-muted-foreground">Ano'ng ginagawa mo ngayon?</p>
      </header>

      <div className="community-columns">
        <aside className="community-left-sidebar" aria-label="Community shortcuts">
          {isLoggedIn ? (
            <Panel className="community-profile-card">
              <Avatar
                role={creator ? role === 'artist' ? 'artist' : 'writer' : undefined}
                large
                onClick={() => router.push('/profile')}
                label="Open your profile"
              />
              <button type="button" className="mt-3 font-serif text-lg font-bold hover:text-accent hover:underline" onClick={() => router.push('/profile')}>Your StoryLines</button>
              <span className="community-role mt-1">{role === 'artist' ? 'Alagad ng sining' : role === 'writer' ? 'Writer' : 'Reader'}</span>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">Profile details will appear here when community profiles are connected.</p>
            </Panel>
          ) : (
            <Panel className="community-profile-card">
              <span className="section-icon"><UsersRound className="size-4" /></span>
              <h2 className="mt-3 font-serif text-lg font-bold">Gawa tayo ng community.</h2>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">Mag-sign in para makasali sa kuwentuhan at makilala ang kapwa manlilikha.</p>
              <Button type="button" onClick={onUnlock} className="mt-4 min-h-11 w-full rounded-xl bg-accent text-accent-foreground">Log in to join</Button>
            </Panel>
          )}
          <Panel className="community-shortcuts">
            <p className="community-sidebar-label">Your space</p>
            <button className={`community-shortcut ${feedTab === 'for-you' ? 'community-shortcut-active' : ''}`} type="button" onClick={() => setFeedTab('for-you')}><Compass /> Feed</button>
            <button className={`community-shortcut ${feedTab === 'authors' ? 'community-shortcut-active' : ''}`} type="button" onClick={() => setFeedTab('authors')}><Search /> Authors</button>
            <button className="community-shortcut" type="button" disabled title="Following feed arrives in a later phase"><UsersRound /> Following</button>
            <button
              className={`community-shortcut ${feedTab === 'saved' ? 'community-shortcut-active' : ''}`}
              type="button"
              onClick={() => {
                if (!isLoggedIn) {
                  onUnlock()
                  return
                }
                setSelectedAuthorId(null)
                setFeedTab('saved')
              }}
            >
              <Bookmark /> Saved
            </button>
            <button className="community-shortcut" type="button" disabled title="Your posts view arrives in a later phase"><PenLine /> My Posts</button>
            <button className={`community-shortcut ${feedTab === 'collaborators' ? 'community-shortcut-active' : ''}`} type="button" onClick={() => setFeedTab('collaborators')}><Handshake /> Collaboration Board</button>
          </Panel>
        </aside>

        <section className="community-feed" aria-label="Community feed">
          <section className="community-card community-composer" aria-label="Create a post">
            {!canPost ? (
              <>
                <div className="flex items-center gap-3">
                  <Avatar role={isLoggedIn && role === 'artist' ? 'artist' : isLoggedIn && role === 'writer' ? 'writer' : undefined} />
                  <button type="button" onClick={onUnlock} className="community-composer-prompt">
                    {isLoggedIn ? 'Reader ka ngayon—gusto mo bang magbahagi?' : "Ano'ng ginagawa mo ngayon? Log in to post."}
                  </button>
                </div>
                <p className="mt-3 pl-12 text-xs leading-5 text-muted-foreground">
                  {isLoggedIn
                    ? 'Kailangan ng Writer o Alagad ng sining badge para makapag-post. Puwede mo itong i-request sa account settings.'
                    : 'Sumali sa kuwentuhan at magbahagi ng ginagawa mong likha.'}
                </p>
                <Button type="button" variant="outline" onClick={onUnlock} className="mt-4 min-h-11 w-full rounded-xl">
                  {isLoggedIn ? 'Alamin kung paano makakuha ng badge' : 'Log in to post'}
                </Button>
              </>
            ) : !composerExpanded ? (
              <>
                <div className="flex items-center gap-3">
                  <Avatar role={role === 'artist' ? 'artist' : 'writer'} />
                  <button type="button" onClick={focusComposer} className="community-composer-prompt">
                    Ano'ng ginagawa mo ngayon?
                  </button>
                </div>
                <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
                  <button type="button" onClick={focusComposer} className="community-composer-action"><ImagePlus /> Photo</button>
                  <button type="button" onClick={() => { setPostType('work-in-progress'); focusComposer() }} className="community-composer-action"><PenLine /> Work-in-progress</button>
                  <button type="button" onClick={() => { setPostType('collaborator'); focusComposer() }} className="community-composer-action"><Handshake /> Find a collaborator</button>
                </div>
              </>
            ) : (
              <form onSubmit={submit}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar role={role === 'artist' ? 'artist' : 'writer'} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">Your StoryLines</p>
                      <span className="community-role">{roleLabel(role === 'artist' ? 'artist' : 'writer')}</span>
                    </div>
                  </div>
                  <button type="button" onClick={() => setComposerExpanded(false)} className="community-icon-button" aria-label="Close composer"><X className="size-4" /></button>
                </div>
                <label htmlFor="community-post" className="sr-only">Your post</label>
                <textarea
                  ref={textareaRef}
                  id="community-post"
                  value={draft}
                  maxLength={MAX_POST_LENGTH}
                  onChange={(event) => { setDraft(event.target.value); setComposerError(null) }}
                  placeholder="Ano'ng ginagawa mo ngayon? Share your progress, a reading reco, or an idea."
                  className="community-composer-textarea mt-4"
                />
                <div className="flex justify-end text-xs text-muted-foreground"><span>{draft.length}/{MAX_POST_LENGTH}</span></div>

                <div className="mt-3">
                  <label htmlFor="community-post-type" className="mb-1.5 block text-xs font-bold">Post type</label>
                  <select id="community-post-type" value={postType} onChange={(event) => { setPostType(event.target.value as CommunityPostType); setComposerError(null) }} className="community-select">
                    {POST_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </div>

                {postType === 'collaborator' && (
                  <fieldset className="mt-3">
                    <legend className="mb-2 text-xs font-bold">I&apos;m looking for</legend>
                    <div className="flex flex-wrap gap-2">
                      {COLLABORATOR_ROLES.map((item) => {
                        const checked = lookingFor.includes(item)
                        return (
                          <button type="button" key={item} aria-pressed={checked} onClick={() => setLookingFor((current) => checked ? current.filter((roleItem) => roleItem !== item) : [...current, item])} className={`community-chip ${checked ? 'community-chip-selected' : ''}`}>
                            {checked && <Check className="size-3.5" />}{item}
                          </button>
                        )
                      })}
                    </div>
                  </fieldset>
                )}

                <div className="mt-3">
                  <label htmlFor="community-tag" className="mb-1.5 block text-xs font-bold">Tags <span className="font-normal text-muted-foreground">(up to 5)</span></label>
                  <div className="flex gap-2">
                    <input id="community-tag" value={tagInput} maxLength={24} onChange={(event) => setTagInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addTag() } }} placeholder="e.g. fantasy, writing" className="community-text-input min-w-0 flex-1" />
                    <Button type="button" variant="outline" disabled={!tagInput.trim() || tags.length >= 5} onClick={() => addTag()} className="min-h-11 rounded-xl px-3"><Plus className="size-4" /><span className="sr-only">Add tag</span></Button>
                  </div>
                  {tags.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{tags.map((tag) => <button type="button" key={tag} onClick={() => setTags((current) => current.filter((item) => item !== tag))} className="community-tag">#{tag}<X className="ml-1 size-3" /></button>)}</div>}
                  <div className="mt-3">
                    <p className="mb-2 text-xs font-bold">Suggested tags</p>
                    <div className="flex flex-wrap gap-2">
                      {SUGGESTED_TAGS[postType].filter((tag) => !tags.includes(tag)).map((tag) => (
                        <button key={tag} type="button" disabled={tags.length >= 5} onClick={() => addTag(tag)} className="community-chip disabled:cursor-not-allowed disabled:opacity-50">
                          + #{tag}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {images.length > 0 && (
                  <div className="community-image-grid community-image-grid-composer mt-3">
                    {images.map((image, index) => (
                      <div className="relative" key={`${image.name}-${index}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={image.dataUrl} alt={`Selected attachment ${index + 1}`} />
                        <button type="button" onClick={() => setImages((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="community-remove-image" aria-label={`Remove ${image.name}`}><X className="size-4" /></button>
                      </div>
                    ))}
                  </div>
                )}
                {imageError && <p role="alert" className="mt-2 text-xs font-medium text-destructive">{imageError}</p>}
                {composerError && <p role="alert" className="mt-2 text-xs font-medium text-destructive">{composerError}</p>}

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                  <label className={`community-composer-action ${images.length >= MAX_IMAGES || compressing ? 'pointer-events-none opacity-50' : 'cursor-pointer'}`}>
                    <ImagePlus /> Add photos
                    <input type="file" accept="image/*" multiple disabled={images.length >= MAX_IMAGES || compressing} className="sr-only" onChange={(event) => void handleImages(event)} />
                  </label>
                  <span className="text-xs text-muted-foreground">{compressing ? 'Preparing photos…' : `${images.length}/${MAX_IMAGES} photos`}</span>
                  <Button type="submit" disabled={!draft.trim() || compressing || submitting} className="min-h-11 rounded-xl bg-accent px-5 text-accent-foreground">
                    <Send className="size-4" /> {submitting ? 'Posting…' : 'Post'}
                  </Button>
                </div>
                <p className="mt-3 text-[11px] leading-5 text-muted-foreground">Maging mabait sa kapwa manlilikha. Posts and photos are shared with the community.</p>
              </form>
            )}
          </section>

          <nav className="community-feed-tabs" aria-label="Feed filter">
            {feedTabs.map((tab) => (
              <button key={tab.id} type="button" aria-current={feedTab === tab.id ? 'page' : undefined} onClick={() => setFeedTab(tab.id)} className={`community-feed-tab ${feedTab === tab.id ? 'community-feed-tab-active' : ''}`}>
                {tab.label}
              </button>
            ))}
          </nav>

          {error && (
            <div role="alert" className="community-card flex flex-wrap items-center justify-between gap-3 text-sm">
              <p className="min-w-0 flex-1 text-destructive">Hindi ma-load ang community: {error}</p>
              <Button type="button" variant="outline" onClick={() => void refresh()} className="min-h-10 rounded-xl">Try again</Button>
            </div>
          )}

          {!hydrated ? (
            <div className="flex flex-col gap-3" aria-label="Loading community posts" aria-busy="true">
              {[0, 1].map((item) => <div key={item} className="community-card h-44 animate-pulse bg-secondary/45" />)}
            </div>
          ) : feedTab === 'authors' ? (
            <section className="community-card" aria-label="Search authors">
              <h2 className="font-serif text-xl font-bold">Find an author</h2>
              <p className="mt-1 text-sm text-muted-foreground">Maghanap ng writers at artists sa StoryLines.</p>
              <label htmlFor="community-author-search" className="sr-only">Search authors by name or username</label>
              <div className="relative mt-4">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <input
                  id="community-author-search"
                  value={authorSearch}
                  onChange={(event) => setAuthorSearch(event.target.value)}
                  placeholder="Search name or username"
                  className="community-text-input pl-10"
                />
              </div>
              {matchingAuthors.length ? (
                <ul className="mt-3 divide-y divide-border">
                  {matchingAuthors.map((author) => (
                    <li key={author.id}>
                      <button
                        type="button"
                        onClick={() => openProfile(author.id)}
                        className="flex min-h-16 w-full items-center gap-3 py-3 text-left hover:text-accent"
                      >
                        <Avatar role={author.roles.includes('artist') ? 'artist' : 'writer'} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold">{author.displayName}</span>
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">@{author.username}</span>
                        </span>
                        <span className="community-role">{author.roles.includes('writer') ? 'Writer' : 'Artist'}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 rounded-xl bg-secondary/55 p-4 text-sm text-muted-foreground">
                  {authors.length ? 'Walang author na tugma sa search mo.' : 'Wala pang authors na may public posts.'}
                </p>
              )}
            </section>
          ) : feedTab === 'following' ? (
            <div className="community-empty">
              <span className="empty-icon"><UsersRound className="size-5" /></span>
              <h2 className="mt-4 font-serif text-xl font-bold">Your Following feed is coming soon</h2>
              <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">Soon, makikita rito ang bagong gawa at updates ng mga creator na sinusubaybayan mo.</p>
            </div>
          ) : (
            <>
            {selectedAuthorId && (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm">
                <span>Posts by {authors.find((author) => author.id === selectedAuthorId)?.displayName ?? 'this author'}</span>
                <button type="button" onClick={() => setSelectedAuthorId(null)} className="inline-flex min-h-10 items-center gap-1 text-xs font-bold text-accent hover:underline">
                  Clear filter <X className="size-3.5" />
                </button>
              </div>
            )}
            {visiblePosts.length === 0 ? (
            <div className="community-empty">
              <span className="empty-icon"><MessageCircle className="size-5" /></span>
              <h2 className="mt-4 font-serif text-xl font-bold">{feedTab === 'collaborators' ? 'Wala pang naghahanap ng ka-collab' : feedTab === 'saved' ? 'Wala ka pang naka-save na post' : 'Wala pang kuwentuhan dito'}</h2>
              <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
                {feedTab === 'collaborators'
                  ? 'Baka ikaw ang unang mag-post ng collaboration request at makahanap ng kaagapay.'
                  : feedTab === 'saved'
                    ? 'I-save ang mga post na gusto mong balikan para makita rito.'
                    : 'Walang pang post, ikaw na ang mauna! Ibahagi ang ginagawa mo o ang kuwentong tumatak sa iyo.'}
              </p>
              {canPost && <Button type="button" onClick={focusComposer} className="mt-4 min-h-11 rounded-xl bg-accent text-accent-foreground">Start a post</Button>}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {(showAll ? visiblePosts : visiblePosts.slice(0, 10)).map((post) => (
                <div id={`post-${post.id}`} key={post.id}>
                  <FeedPost
                    post={post}
                    onLike={toggleLike}
                    isSaved={savedPostIds.includes(post.id)}
                    canDelete={!post.authorId || (currentUserId !== null && post.authorId === currentUserId)}
                    canEdit={currentUserId !== null && post.authorId === currentUserId}
                    isLoggedIn={isLoggedIn}
                    onUnlock={onUnlock}
                    onSave={toggleSaved}
                    onLoadComments={loadComments}
                    onAddComment={addComment}
                    onProfileClick={openProfile}
                    onDelete={deletePost}
                    onEdit={updatePost}
                  />
                </div>
              ))}
              {visiblePosts.length > 10 && <Button type="button" variant="outline" onClick={() => setShowAll((value) => !value)} className="min-h-11 w-full rounded-xl">{showAll ? 'Show fewer posts' : 'Load more posts'}</Button>}
            </div>
          )}
            </>
          )}
        </section>

        <aside className="community-right-sidebar" aria-label="Community information">
          <Panel>
            <span className="section-icon"><Sparkles className="size-4" /></span>
            <h2 className="mt-3 font-serif text-lg font-bold">Community notes</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">Isang mahinahon at mabait na tambayan para pag-usapan ang mga likha at tumuklas ng susunod mong paborito.</p>
            <ul className="mt-4 flex flex-col gap-2 border-t border-border pt-4 text-xs leading-5">
              <li>Mga reading reco</li>
              <li>Updates sa ginagawa mong likha</li>
              <li>Mabait at makabuluhang feedback</li>
            </ul>
            <a href="/guidelines" className="mt-4 inline-flex min-h-11 items-center text-xs font-bold text-accent hover:underline">Read community guidelines</a>
          </Panel>

          <Panel>
            <div className="flex items-center gap-2">
              <span className="section-icon"><Handshake className="size-4" /></span>
              <h2 className="font-serif text-lg font-bold">Looking for collaborators</h2>
            </div>
            {recentCollaborationPosts.length ? (
              <ul className="mt-3 flex flex-col gap-3">
                {recentCollaborationPosts.map((post) => (
                  <li key={post.id} className="border-t border-border pt-3">
                    <p className="line-clamp-2 text-xs leading-5">{post.content}</p>
                    <span className="mt-1 block text-[11px] text-muted-foreground">{(post.lookingFor ?? []).join(', ')}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-3 text-xs leading-5 text-muted-foreground">Open calls from the feed will show up here.</p>}
            <button type="button" onClick={() => setFeedTab('collaborators')} className="mt-3 inline-flex min-h-11 items-center text-xs font-bold text-accent hover:underline">Open collaboration board</button>
          </Panel>

          <Panel>
            <h2 className="font-serif text-lg font-bold">Trending tags</h2>
            {trendingTags.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {trendingTags.map(({ tag }) => <span className="community-tag community-tag-muted" key={tag}>#{tag}</span>)}
              </div>
            ) : <p className="mt-2 text-xs leading-5 text-muted-foreground">Post tags will trend here as the community grows.</p>}
          </Panel>

          <Panel>
            <h2 className="font-serif text-lg font-bold">Suggested creators</h2>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">Creator suggestions will appear here when profiles and follows are available.</p>
          </Panel>
        </aside>
      </div>
      {canPost && (
        <button type="button" className="community-floating-post" onClick={focusComposer}>
          <Plus className="size-4" /> Post
        </button>
      )}
    </div>
  )
}
