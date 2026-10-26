'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import {
  Ban,
  Bookmark,
  Brush,
  Check,
  Compass,
  ChevronRight,
  EyeOff,
  BellOff,
  RotateCcw,
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
import { CommunityCommentThread } from '@/components/shared/community-comment-thread'
import { MentionTextField } from '@/components/shared/mention-text-field'
import { PostDetailDialog } from '@/components/shared/post-detail-dialog'
import { PostContent } from '@/components/shared/post-content'
import { ProfileAvatar } from '@/components/shared/profile-avatar'
import { ContentReportMenuItem } from '@/components/shared/content-report-menu-item'
import { ShareLinkDialog } from '@/components/shared/share-link-dialog'
import { useCommunity } from '@/lib/community-store'
import { getErrorMessage } from '@/lib/error-message'
import { getSupabaseClient } from '@/lib/supabase'
import { useWorks } from '@/lib/works-store'
import type { Badge, CommunityComment, CommunityPostType, Post } from '@/lib/types'

const MAX_POST_LENGTH = 5000
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

type FeedTab = 'for-you' | 'following' | 'latest' | 'collaborators' | 'authors' | 'saved' | 'my-posts'
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
  src,
  name = 'StoryLines member',
}: {
  role?: 'writer' | 'artist'
  large?: boolean
  onClick?: () => void
  label?: string
  src?: string | null
  name?: string
}) {
  const Icon = role === 'artist' ? Brush : role === 'writer' ? PenLine : UsersRound
  const avatar = <ProfileAvatar src={src} name={name} className={`community-avatar${large ? ' community-avatar-large' : ''}`} imageSizes={large ? '64px' : '40px'} />
  if (onClick) {
    return (
      <button
        type="button"
        className="community-avatar-link rounded-full focus-visible:outline-2 focus-visible:outline-ring"
        onClick={onClick}
        aria-label={label ?? 'Open profile'}
      >
        {src ? avatar : <span className={`community-avatar${large ? ' community-avatar-large' : ''}`}><Icon className={large ? 'size-5' : 'size-4'} /></span>}
      </button>
    )
  }
  return (
    src ? avatar : <span className={`community-avatar${large ? ' community-avatar-large' : ''}`} aria-hidden="true"><Icon className={large ? 'size-5' : 'size-4'} /></span>
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
  onCommentReaction,
  onUpdateComment,
  onProfileClick,
  currentUserId,
  canDelete,
  canEdit,
  onDelete,
  onEdit,
  mutedAuthor,
  onHidePost,
  onToggleMuteAuthor,
  onBlockAuthor,
}: {
  post: Post
  onLike: (id: string) => Promise<void>
  isSaved: boolean
  isLoggedIn: boolean
  onUnlock: () => void
  onSave: (id: string) => Promise<void>
  onLoadComments: (id: string) => Promise<CommunityComment[]>
  onAddComment: (id: string, content: string, parentCommentId?: string) => Promise<CommunityComment>
  onCommentReaction: (id: string, reaction: 'like' | 'dislike') => Promise<void>
  onUpdateComment: (id: string, content: string) => Promise<void>
  onProfileClick: (id: string) => void
  currentUserId: string | null
  canDelete: boolean
  canEdit: boolean
  onDelete: (id: string) => Promise<void>
  onEdit: (id: string, content: string) => Promise<void>
  mutedAuthor: boolean
  onHidePost: (post: Post) => Promise<void>
  onToggleMuteAuthor: (authorId: string, muted: boolean) => Promise<void>
  onBlockAuthor: (authorId: string) => Promise<void>
}) {
  const router = useRouter()
  const [expanded, setExpanded] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [comments, setComments] = useState<CommunityComment[]>([])
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [commentDraft, setCommentDraft] = useState('')
  const [replyTarget, setReplyTarget] = useState<CommunityComment | null>(null)
  const [commentError, setCommentError] = useState<string | null>(null)
  const [commentSubmitting, setCommentSubmitting] = useState(false)
  const [likePending, setLikePending] = useState(false)
  const [savePending, setSavePending] = useState(false)
  const [likeError, setLikeError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editDraft, setEditDraft] = useState(post.content)
  const [editError, setEditError] = useState<string | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [menuPending, setMenuPending] = useState(false)
  const [menuError, setMenuError] = useState<string | null>(null)
  const postAuthorId = post.authorId
  const images = post.imageUrls?.length ? post.imageUrls : post.imageUrl ? [post.imageUrl] : []
  const tags = post.tags ?? []

  if (hidden) return null

  const shareUrl = typeof window === 'undefined' ? '' : `${window.location.origin}/community#post-${post.id}`

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
      const comment = await onAddComment(post.id, content, replyTarget?.id)
      setComments((current) => [...current, comment])
      setCommentDraft('')
      setReplyTarget(null)
    } catch (submitError) {
      setCommentError(getErrorMessage(submitError, 'Hindi naipadala ang comment. Subukan ulit.'))
    } finally {
      setCommentSubmitting(false)
    }
  }

  const handleCommentKeyDown = (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (
      event.key !== 'Enter'
      || event.shiftKey
      || event.nativeEvent.isComposing
      || event.nativeEvent.keyCode === 229
      || commentSubmitting
      || !commentDraft.trim()
    ) return
    event.preventDefault()
    event.currentTarget.form?.requestSubmit()
  }

  const editComment = async (comment: CommunityComment, content: string) => {
    await onUpdateComment(comment.id, content)
    setComments((current) => current.map((item) => item.id === comment.id ? { ...item, content } : item))
  }

  const likePost = async () => {
    if (!isLoggedIn) {
      onUnlock()
      return
    }
    if (likePending) return
    setLikePending(true)
    setLikeError(null)
    try {
      await onLike(post.id)
    } catch (error) {
      setLikeError(error instanceof Error ? error.message : 'Hindi na-update ang reaction. Subukan ulit.')
    } finally {
      setLikePending(false)
    }
  }

  const savePost = async () => {
    if (!isLoggedIn) {
      onUnlock()
      return
    }
    if (savePending) return
    setSavePending(true)
    setSaveError(null)
    try {
      await onSave(post.id)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Hindi ma-save ang post. Subukan ulit.')
    } finally {
      setSavePending(false)
    }
  }

  const runMenuAction = async (action: () => Promise<void>, hidePost = false) => {
    if (!isLoggedIn) {
      onUnlock()
      return
    }
    setMenuPending(true)
    setMenuError(null)
    try {
      await action()
      if (hidePost) setHidden(true)
    } catch (error) {
      setMenuError(error instanceof Error ? error.message : 'Could not update this post action.')
    } finally {
      setMenuPending(false)
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
    <article className="community-card cursor-pointer" onClick={(event) => {
      if ((event.target as HTMLElement).closest('button, a, input, textarea, details, form')) return
      setDetailOpen(true)
    }} onKeyDown={(event) => {
      if (event.target !== event.currentTarget) return
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        setDetailOpen(true)
      }
    }} tabIndex={0} aria-label={`Open post by ${post.authorName ?? 'StoryLines creator'}`}>
      <div className="flex items-start gap-3">
        <Avatar role={post.authorRole} src={post.authorAvatarUrl} name={post.authorName} onClick={postAuthorId ? () => onProfileClick(postAuthorId) : undefined} label={`Open ${post.authorName ?? 'author'} profile`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {postAuthorId ? (
              <button type="button" className="text-sm font-bold hover:text-accent hover:underline" onClick={() => onProfileClick(postAuthorId)}>
                {post.authorName || 'StoryLines creator'}
              </button>
            ) : (
              <span className="text-sm font-bold">{post.authorName || 'Ikaw'}</span>
            )}
            {shareOpen && <ShareLinkDialog title="Share this post" url={shareUrl} onClose={() => setShareOpen(false)} />}
            {detailOpen && <PostDetailDialog author={post.authorName ?? 'StoryLines creator'} username={post.authorUsername} avatarUrl={post.authorAvatarUrl} createdAt={post.createdAt} content={post.content} images={images} tags={tags} onClose={() => setDetailOpen(false)} />}
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
        {!editing && (
          <details className="group relative">
            <summary
              className="community-icon-button list-none"
              aria-label="Post actions"
              title="Post actions"
            >
              <MoreHorizontal className="size-4" />
            </summary>
            <div role="menu" aria-label="Post actions" className="absolute right-0 z-20 mt-1 w-56 rounded-xl border border-border bg-card p-1 shadow-lg">
              <button
                type="button"
                role="menuitem"
                disabled={menuPending || savePending || !post.authorId}
                className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-semibold hover:bg-secondary disabled:opacity-50"
                onClick={(event) => {
                  event.currentTarget.closest('details')?.removeAttribute('open')
                  void runMenuAction(() => onSave(post.id))
                }}
              >
                <Bookmark className={`size-4 ${isSaved ? 'fill-current' : ''}`} />
                {isSaved ? 'Remove from saved' : 'Save'}
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={menuPending}
                className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-semibold hover:bg-secondary disabled:opacity-50"
                onClick={(event) => {
                  event.currentTarget.closest('details')?.removeAttribute('open')
                  void runMenuAction(() => onHidePost(post), true)
                }}
              >
                <EyeOff className="size-4" /> Hide this post
              </button>
              {postAuthorId && postAuthorId !== currentUserId && (
                <button
                  type="button"
                  role="menuitem"
                  disabled={menuPending}
                  className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-semibold hover:bg-secondary disabled:opacity-50"
                  onClick={(event) => {
                    event.currentTarget.closest('details')?.removeAttribute('open')
                    void runMenuAction(() => onToggleMuteAuthor(postAuthorId, !mutedAuthor))
                  }}
                >
                  <BellOff className="size-4" /> {mutedAuthor ? `Unmute @${post.authorUsername ?? 'author'}` : `Mute @${post.authorUsername ?? 'author'}`}
                </button>
              )}
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
              {postAuthorId && postAuthorId !== currentUserId && (
                <ContentReportMenuItem
                  targetType="post"
                  targetId={post.id}
                  reportedUserId={postAuthorId}
                  reportedName={post.authorName ?? 'StoryLines creator'}
                  reportedUsername={post.authorUsername}
                  currentUserId={currentUserId}
                  contentLabel="post"
                  onHide={() => setHidden(true)}
                />
              )}
              {postAuthorId && postAuthorId !== currentUserId && (
                <button
                  type="button"
                  role="menuitem"
                  disabled={menuPending}
                  className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50"
                  onClick={(event) => {
                    event.currentTarget.closest('details')?.removeAttribute('open')
                    void runMenuAction(() => onBlockAuthor(postAuthorId), true)
                  }}
                >
                  <Ban className="size-4" /> Block @{post.authorUsername ?? 'author'}
                </button>
              )}
            </div>
          </details>
        )}
      </div>
      {menuError && <p role="alert" className="mt-2 text-xs text-destructive">{menuError}</p>}

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
        <div className="mt-4" onClick={() => setDetailOpen(true)}>
          <PostContent content={post.content} className={`whitespace-pre-wrap wrap-break-word text-sm leading-6 ${!expanded ? 'community-post-copy' : ''}`} />
          {post.content.length > 260 && (
            <button type="button" className="mt-1 text-xs font-bold text-accent hover:underline" onClick={() => setExpanded((value) => !value)}>
              {expanded ? 'See less' : 'See more'}
            </button>
          )}
        </div>
      )}

      {post.attachedWork && (
        <Link
          href={`/works/${encodeURIComponent(post.attachedWork.id)}`}
          className="mt-4 flex min-h-20 items-center gap-3 rounded-xl border border-border bg-secondary/45 p-3 transition hover:border-accent/50 hover:bg-secondary"
        >
          {post.attachedWork.coverImageUrl ? (
            <div className="relative size-14 shrink-0 overflow-hidden rounded-lg">
              <Image src={post.attachedWork.coverImageUrl} alt="" fill sizes="56px" className="object-cover" unoptimized />
            </div>
          ) : (
            <span className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
              {post.attachedWork.type === 'comic' ? <Brush className="size-5" /> : <PenLine className="size-5" />}
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-bold uppercase tracking-wide text-accent">Attached {post.attachedWork.type}</span>
            <span className="mt-1 block truncate text-sm font-bold">{post.attachedWork.title}</span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Link>
      )}

      {post.type === 'collaborator' && post.lookingFor?.length ? (
        <div className="mt-3 rounded-xl border border-border bg-secondary/55 p-3">
          <p className="text-xs font-bold text-foreground">Looking for</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {post.lookingFor.map((item) => <span className="community-tag" key={item}>{item}</span>)}
          </div>
          <button type="button" className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent px-3 text-sm font-bold text-accent-foreground hover:brightness-95" onClick={() => {
            if (!isLoggedIn) onUnlock()
            else if (post.authorId) router.push(`/messages?user=${encodeURIComponent(post.authorId)}`)
          }} disabled={!post.authorId} title={!post.authorId ? 'This post has no account to contact' : undefined}>
            <Send className="size-4" /> Reach out
          </button>
        </div>
      ) : null}

      {images.length > 0 && (
        <div className={`community-image-grid community-image-grid-${Math.min(images.length, 4)} mt-4`} aria-label={`${images.length} attached ${images.length === 1 ? 'image' : 'images'}`}>
          {images.map((src, index) => (
            <button key={`${post.id}-${index}`} type="button" className="relative cursor-zoom-in" onClick={() => setDetailOpen(true)} aria-label={`Open image ${index + 1} in post`}>
              <Image src={src} alt={`Post attachment ${index + 1}`} fill loading={index === 0 ? 'eager' : 'lazy'} sizes="(max-width: 640px) 50vw, 320px" className="object-contain" unoptimized />
            </button>
          ))}
        </div>
      )}

      {tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {tags.map((tag) => <span key={tag} className="community-tag">#{tag}</span>)}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between border-b border-border pb-3 text-xs text-muted-foreground">
        <span
          aria-label={`${post.likes} ${post.likes === 1 ? 'reaction' : 'reactions'}`}
          className={`inline-flex min-h-7 items-center gap-1.5 rounded-full border border-border bg-background px-2.5 ${post.likedByMe ? 'text-accent' : ''}`}
        >
          <Heart className={`size-3.5 ${post.likedByMe ? 'fill-current' : ''}`} />
          <span>{post.likes}</span>
        </span>
        <span>{post.commentsCount === undefined ? 'Comments' : `${post.commentsCount} comments`}</span>
      </div>
      <div className="grid grid-cols-4 gap-1 pt-2">
        <button type="button" className={`community-action ${post.likedByMe ? 'community-action-active' : ''}`} aria-pressed={post.likedByMe} onClick={() => void likePost()} disabled={likePending}>
          <Heart className={`size-4 ${post.likedByMe ? 'fill-current' : ''}`} /> Like
        </button>
        <button
          type="button"
          className={`community-action ${commentsOpen ? 'community-action-active' : ''}`}
          aria-expanded={commentsOpen}
          onClick={() => void toggleComments()}
          disabled={!post.authorId || savePending}
          title={!post.authorId ? 'Comments are only available on shared posts' : undefined}
        >
          <MessageCircle className="size-4" /> Comment
        </button>
        <button
          type="button"
          className="community-action"
          onClick={() => setShareOpen(true)}
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
      {likeError && <p role="alert" className="mt-2 text-xs text-destructive">{likeError}</p>}
      {deleteError && <p role="alert" className="mt-2 text-xs text-destructive">{deleteError}</p>}
      {commentsOpen && (
        <section className="mt-3 border-t border-border pt-3" aria-label="Post comments">
          {commentsLoading ? (
            <p className="py-3 text-sm text-muted-foreground">Loading comments…</p>
          ) : comments.length ? (
            <div className="flex flex-col gap-3">
              <CommunityCommentThread
                comments={comments}
                currentUserId={currentUserId}
                onProfile={onProfileClick}
                onReply={(comment) => {
                  setReplyTarget(comment)
                  setCommentDraft('')
                  requestAnimationFrame(() => document.getElementById(`reply-comment-${comment.id}`)?.focus())
                }}
                onReaction={async (comment, reaction) => onCommentReaction(comment.id, reaction)}
                onEdit={editComment}
                onLoginRequired={onUnlock}
                replyTargetId={replyTarget?.id}
                replyTargetName={replyTarget?.authorName}
                replyDraft={commentDraft}
                onReplyDraftChange={setCommentDraft}
                onReplySubmit={(event) => void submitComment(event)}
                onReplyCancel={() => {
                  setReplyTarget(null)
                  setCommentDraft('')
                }}
                replySubmitting={commentSubmitting}
              />
            </div>
          ) : (
            <p className="py-2 text-sm text-muted-foreground">Wala pang comments. Ikaw ang mauna!</p>
          )}
          {isLoggedIn && !replyTarget ? (
            <form className="mt-3 flex flex-col gap-2" onSubmit={(event) => void submitComment(event)}>
              <label className="sr-only" htmlFor={`comment-${post.id}`}>Write a comment</label>
              <MentionTextField
                as="textarea"
                id={`comment-${post.id}`}
                value={commentDraft}
                currentUserId={currentUserId}
                onChange={setCommentDraft}
                onKeyDown={handleCommentKeyDown}
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
          ) : !isLoggedIn ? (
            <button type="button" className="mt-3 text-sm font-bold text-accent hover:underline" onClick={onUnlock}>
              Log in to comment
            </button>
          ) : null}
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
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-destructive px-4 text-sm font-bold text-destructive-foreground hover:brightness-95 disabled:opacity-50"
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
  initialTab = 'for-you',
  updatesMode = false,
}: {
  creator: boolean
  isLoggedIn: boolean
  role: Badge
  onUnlock: () => void
  initialTab?: FeedTab
  updatesMode?: boolean
}) {
  const router = useRouter()
  const {
    posts,
    authors,
    currentProfile,
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
    updateComment,
    toggleCommentReaction,
  } = useCommunity()
  const [composerExpanded, setComposerExpanded] = useState(false)
  const [draft, setDraft] = useState('')
  const [postType, setPostType] = useState<CommunityPostType>('update')
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [lookingFor, setLookingFor] = useState<string[]>([])
  const [images, setImages] = useState<PreviewImage[]>([])
  const [attachedWorkId, setAttachedWorkId] = useState<string | null>(null)
  const [imageError, setImageError] = useState<string | null>(null)
  const [compressing, setCompressing] = useState(false)
  const [feedTab, setFeedTab] = useState<FeedTab>(initialTab)
  const [composerError, setComposerError] = useState<string | null>(null)
  const [authorSearch, setAuthorSearch] = useState('')
  const [selectedAuthorId, setSelectedAuthorId] = useState<string | null>(null)
  const [followingIds, setFollowingIds] = useState<string[]>([])
  const [followingLoading, setFollowingLoading] = useState(false)
  const [followingError, setFollowingError] = useState<string | null>(null)
  const [followingReload, setFollowingReload] = useState(0)
  const [hiddenPostIds, setHiddenPostIds] = useState<string[]>([])
  const [mutedAuthorIds, setMutedAuthorIds] = useState<string[]>([])
  const [blockedAuthorIds, setBlockedAuthorIds] = useState<string[]>([])
  const [feedControlsError, setFeedControlsError] = useState<string | null>(null)
  const [hiddenFeedbackPost, setHiddenFeedbackPost] = useState<Post | null>(null)
  const [hideReason, setHideReason] = useState<string | null>(null)
  const [hideReasonError, setHideReasonError] = useState<string | null>(null)
  const [hideFeedbackPending, setHideFeedbackPending] = useState(false)
  const [followActionId, setFollowActionId] = useState<string | null>(null)
  const [followActionError, setFollowActionError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { works: ownWorks, hydrated: worksHydrated } = useWorks()
  const attachableWorks = ownWorks.filter((work) => work.status !== 'Draft' && (work.type === 'story' || work.type === 'comic'))
  const canPost = isLoggedIn && creator && role !== 'reader'
  const openRoleSettings = isLoggedIn && creator && role === 'reader'
  const profileRole = currentProfile?.roles.find((badge) => badge !== 'reader') ?? 'reader'

  useEffect(() => {
    if (!currentUserId) {
      setFollowingIds([])
      return
    }
    let active = true
    setFollowingLoading(true)
    setFollowingError(null)
    void (async () => {
      const { data, error: followError } = await getSupabaseClient()
        .from('community_follows')
        .select('creator_id')
        .eq('follower_id', currentUserId)
        .limit(500)
      if (followError) throw followError
      if (active) setFollowingIds((data ?? []).map((row) => row.creator_id))
    })().catch((followError: unknown) => {
        if (active) setFollowingError(followError instanceof Error ? followError.message : 'Could not load the creators you follow.')
      })
      .finally(() => {
        if (active) setFollowingLoading(false)
      })
    return () => {
      active = false
    }
  }, [currentUserId, followingReload])

  useEffect(() => {
    if (!currentUserId) {
      setHiddenPostIds([])
      setMutedAuthorIds([])
      setBlockedAuthorIds([])
      setFeedControlsError(null)
      return
    }
    let active = true
    void (async () => {
      const supabase = getSupabaseClient()
      const [hiddenResult, mutedResult, blockedResult] = await Promise.all([
        supabase.from('community_hidden_posts').select('post_id').eq('user_id', currentUserId).limit(500),
        supabase.from('community_feed_author_mutes').select('author_id').eq('user_id', currentUserId).limit(500),
        supabase.from('community_message_account_controls').select('account_id').eq('owner_id', currentUserId).eq('status', 'blocked').limit(500),
      ])
      if (hiddenResult.error) throw hiddenResult.error
      if (mutedResult.error) throw mutedResult.error
      if (blockedResult.error) throw blockedResult.error
      if (active) {
        setHiddenPostIds((hiddenResult.data ?? []).map((row) => row.post_id))
        setMutedAuthorIds((mutedResult.data ?? []).map((row) => row.author_id))
        setBlockedAuthorIds((blockedResult.data ?? []).map((row) => row.account_id))
        setFeedControlsError(null)
      }
    })().catch((loadError: unknown) => {
      if (active) setFeedControlsError(loadError instanceof Error ? loadError.message : 'Could not load your post preferences.')
    })
    return () => {
      active = false
    }
  }, [currentUserId])

  const hideCommunityPost = async (post: Post) => {
    if (!currentUserId) throw new Error('Sign in to hide this post.')
    if (post.authorId) {
      const { error: hideError } = await getSupabaseClient()
        .from('community_hidden_posts')
        .insert({ user_id: currentUserId, post_id: post.id })
      if (hideError && hideError.code !== '23505') throw hideError
    }
    setHiddenPostIds((current) => current.includes(post.id) ? current : [...current, post.id])
    setHiddenFeedbackPost(post)
    setHideReason(null)
    setHideReasonError(null)
  }

  const updateHiddenPostReason = async (reason: string) => {
    if (!currentUserId || !hiddenFeedbackPost?.authorId) return
    setHideReason(reason)
    setHideReasonError(null)
    const { error: updateError } = await getSupabaseClient()
      .from('community_hidden_posts')
      .update({ hide_reason: reason })
      .eq('user_id', currentUserId)
      .eq('post_id', hiddenFeedbackPost.id)
    if (updateError) {
      setHideReasonError(updateError.message)
    }
  }

  const unhidePost = async () => {
    if (!currentUserId || !hiddenFeedbackPost) return
    setHideFeedbackPending(true)
    setHideReasonError(null)
    try {
      if (hiddenFeedbackPost.authorId) {
        const { error: unhideError } = await getSupabaseClient()
          .from('community_hidden_posts')
          .delete()
          .eq('user_id', currentUserId)
          .eq('post_id', hiddenFeedbackPost.id)
        if (unhideError) throw unhideError
      }
      setHiddenPostIds((current) => current.filter((id) => id !== hiddenFeedbackPost.id))
      setHiddenFeedbackPost(null)
      setHideReason(null)
    } catch (error) {
      setHideReasonError(error instanceof Error ? error.message : 'Could not unhide this post.')
    } finally {
      setHideFeedbackPending(false)
    }
  }

  const unfollowHiddenPostAuthor = async () => {
    const authorId = hiddenFeedbackPost?.authorId
    if (!authorId || !currentUserId) return
    setHideFeedbackPending(true)
    setHideReasonError(null)
    try {
      const { error: unfollowError } = await getSupabaseClient()
        .from('community_follows')
        .delete()
        .eq('follower_id', currentUserId)
        .eq('creator_id', authorId)
      if (unfollowError) throw unfollowError
      setFollowingIds((current) => current.filter((id) => id !== authorId))
    } catch (error) {
      setHideReasonError(error instanceof Error ? error.message : 'Could not unfollow this author.')
    } finally {
      setHideFeedbackPending(false)
    }
  }

  const toggleCommunityAuthorMute = async (authorId: string, muted: boolean) => {
    if (!currentUserId) throw new Error('Sign in to mute this author.')
    const supabase = getSupabaseClient()
    const result = muted
      ? await supabase.from('community_feed_author_mutes').delete().eq('user_id', currentUserId).eq('author_id', authorId)
      : await supabase.from('community_feed_author_mutes').insert({ user_id: currentUserId, author_id: authorId })
    if (result.error) throw result.error
    setMutedAuthorIds((current) => muted
      ? current.filter((id) => id !== authorId)
      : current.includes(authorId) ? current : [...current, authorId])
  }

  const blockCommunityAuthor = async (authorId: string) => {
    const { error: blockError } = await getSupabaseClient().rpc('set_community_message_account_control', {
      p_account_id: authorId,
      p_status: 'blocked',
    })
    if (blockError) throw blockError
    setBlockedAuthorIds((current) => current.includes(authorId) ? current : [...current, authorId])
  }

  const visiblePosts = posts
    .filter((post) => !hiddenPostIds.includes(post.id))
    .filter((post) => !post.authorId || (!mutedAuthorIds.includes(post.authorId) && !blockedAuthorIds.includes(post.authorId)))
    .filter((post) => feedTab !== 'collaborators' || post.type === 'collaborator')
    .filter((post) => feedTab !== 'following' || followingIds.includes(post.authorId ?? ''))
    .filter((post) => feedTab !== 'my-posts' || post.authorId === currentUserId)
    .filter((post) => feedTab !== 'saved' || savedPostIds.includes(post.id))
    .filter((post) => selectedAuthorId === null || post.authorId === selectedAuthorId)
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
  const authorQuery = authorSearch.trim().toLowerCase()
  const matchingAuthors = authors.filter((author) =>
    `${author.displayName} ${author.username}`.toLowerCase().includes(authorQuery),
  )
  const authorsToFollow = authors
    .filter((author) => author.id !== currentUserId && !followingIds.includes(author.id))
    .sort((first, second) => {
      const firstRoleRank = first.roles.includes('writer') ? 0 : 1
      const secondRoleRank = second.roles.includes('writer') ? 0 : 1
      return firstRoleRank - secondRoleRank
    })
    .slice(0, 2)
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

  const followAuthor = async (authorId: string) => {
    if (!isLoggedIn || !currentUserId) {
      onUnlock()
      return
    }
    if (followActionId) return
    setFollowActionId(authorId)
    setFollowActionError(null)
    try {
      const supabase = getSupabaseClient()
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError) throw userError
      if (!user) throw new Error('Sign in to follow authors.')
      if (user.id === authorId) throw new Error('You cannot follow your own profile.')
      const { error: followError } = await supabase
        .from('community_follows')
        .insert({ follower_id: user.id, creator_id: authorId })
      if (followError) throw followError
      setFollowingIds((current) => current.includes(authorId) ? current : [...current, authorId])
    } catch (followError) {
      setFollowActionError(getErrorMessage(followError, 'Could not follow this author. Please try again.'))
    } finally {
      setFollowActionId(null)
    }
  }

  const renderAuthorsToFollow = () => (
    <Panel>
      <h2 className="font-serif text-sm font-bold">Authors to follow</h2>
      {followingLoading ? (
        <div className="mt-3 space-y-3" aria-label="Loading authors to follow" aria-busy="true">
          {[0, 1].map((item) => <div key={item} className="h-9 animate-pulse rounded-lg bg-secondary/60" />)}
        </div>
      ) : authorsToFollow.length ? (
        <ul className="mt-3 space-y-2">
          {authorsToFollow.map((author) => {
            const authorRole = author.roles.includes('writer') ? 'Writer' : 'Artist'
            return (
              <li key={author.id} className="flex min-w-0 items-center gap-2">
                <Link href={`/profile/${encodeURIComponent(author.id)}`} className="flex min-w-0 flex-1 items-center gap-2 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                  <ProfileAvatar src={author.avatarUrl} name={author.displayName} className="size-9" imageSizes="36px" />
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-bold">{author.displayName}</span>
                    <span className="block truncate text-[10px] text-muted-foreground">{authorRole}</span>
                  </span>
                </Link>
                <button
                  type="button"
                  onClick={() => void followAuthor(author.id)}
                  disabled={followActionId !== null}
                  className="min-h-8 shrink-0 rounded-full border border-border px-3 text-[10px] font-bold hover:border-accent hover:text-accent disabled:opacity-60"
                >
                  {followActionId === author.id ? '…' : 'Follow'}
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          {followingError
            ? 'Could not load your follows. Retry to refresh author suggestions.'
            : authors.length
              ? 'You’re following all the authors we can suggest.'
              : 'New authors will appear here as they join the community.'}
        </p>
      )}
      {followingError && (
        <button type="button" onClick={() => setFollowingReload((version) => version + 1)} className="mt-2 min-h-8 text-xs font-bold text-accent hover:underline">
          Retry suggestions
        </button>
      )}
      {followActionError && <p role="alert" className="mt-2 text-xs leading-5 text-destructive">{followActionError}</p>}
    </Panel>
  )

  const focusComposer = () => {
    if (!canPost) {
      if (openRoleSettings) router.push('/settings')
      else onUnlock()
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
        attachedWorkId,
      })
      setDraft('')
      setPostType('update')
      setTags([])
      setTagInput('')
      setLookingFor([])
      setImages([])
      setAttachedWorkId(null)
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
      {hiddenFeedbackPost && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/45 p-3 sm:items-center sm:p-5">
          <section role="dialog" aria-modal="true" aria-labelledby="hide-feedback-title" className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-2xl sm:p-6">
            <h2 id="hide-feedback-title" className="font-serif text-lg font-bold">Why aren’t you interested?</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {[
                ['doesnt_match_interests', 'Doesn’t match my interests'],
                ['scam', 'Scam'],
                ['sexual', 'Sexual'],
                ['disturbing', 'Disturbing'],
                ['dislike_creator', 'I don’t like the creator'],
                ['other', 'Other'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={hideReason === value}
                  disabled={hideFeedbackPending}
                  onClick={() => void updateHiddenPostReason(value)}
                  className={`min-h-10 rounded-full px-3.5 text-sm font-semibold transition-colors disabled:opacity-60 ${hideReason === value ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-muted'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <h3 className="mt-7 text-sm font-bold">Other steps you can take</h3>
            <div className="mt-2 divide-y divide-border">
              {hiddenFeedbackPost.authorId && followingIds.includes(hiddenFeedbackPost.authorId) && (
                <button type="button" disabled={hideFeedbackPending} onClick={() => void unfollowHiddenPostAuthor()} className="flex min-h-12 w-full items-center gap-3 text-left text-sm font-semibold hover:text-accent disabled:opacity-60">
                  <UsersRound className="size-5" aria-hidden="true" />
                  Unfollow {hiddenFeedbackPost.authorName ?? `@${hiddenFeedbackPost.authorUsername ?? 'creator'}`}
                </button>
              )}
              {hiddenFeedbackPost.authorId && hiddenFeedbackPost.authorId !== currentUserId && (
                <div className="py-1">
                  <ContentReportMenuItem
                    targetType="post"
                    targetId={hiddenFeedbackPost.id}
                    reportedUserId={hiddenFeedbackPost.authorId}
                    reportedName={hiddenFeedbackPost.authorName ?? 'StoryLines creator'}
                    reportedUsername={hiddenFeedbackPost.authorUsername}
                    currentUserId={currentUserId}
                    contentLabel="post"
                  />
                </div>
              )}
              <button type="button" disabled={hideFeedbackPending} onClick={() => void unhidePost()} className="flex min-h-12 w-full items-center gap-3 text-left text-sm font-semibold hover:text-accent disabled:opacity-60">
                <RotateCcw className="size-5" aria-hidden="true" />
                Unhide post
              </button>
            </div>
            {hideReasonError && <p role="alert" className="mt-3 text-sm text-destructive">{hideReasonError}</p>}
            <div className="mt-3 flex justify-end">
              <button type="button" disabled={hideFeedbackPending} onClick={() => setHiddenFeedbackPost(null)} className="min-h-11 rounded-full border border-border px-4 text-sm font-semibold hover:bg-muted disabled:opacity-60">Done</button>
            </div>
          </section>
        </div>
      )}
      <header className="community-heading">
        <span className="eyebrow">{updatesMode ? 'Your StoryLines' : 'Tambayan ng StoryLines'}</span>
        <h1 className="mt-1 font-serif text-2xl font-bold sm:text-3xl">{updatesMode ? 'Updates' : 'Kuwento, likha, at kuwentuhan.'}</h1>
        {!updatesMode && <p className="mt-1 text-sm text-muted-foreground">Ano'ng ginagawa mo ngayon?</p>}
      </header>

      <div className="community-columns">
        <aside className="community-left-sidebar" aria-label="Community shortcuts">
          {isLoggedIn ? (
            <Panel className="community-profile-card flex min-h-74 flex-col items-center px-6 py-6">
              <Avatar
                role={profileRole === 'reader' ? undefined : profileRole}
                large
                onClick={() => router.push('/profile')}
                label="Open your profile"
                src={currentProfile?.avatarUrl}
                name={currentProfile?.displayName ?? 'Your StoryLines'}
              />
              <button type="button" className="mt-4 font-serif text-lg font-bold hover:text-accent hover:underline" onClick={() => router.push('/profile')}>{currentProfile?.displayName ?? 'Your StoryLines'}</button>
              <div className="mt-1 flex items-center justify-center gap-1.5">
                <span className="max-w-40 truncate text-xs text-muted-foreground">@{currentProfile?.username ?? 'reader'}</span>
                <span className="community-role">{profileRole === 'artist' ? 'Artist' : profileRole === 'writer' ? 'Writer' : 'Reader'}</span>
              </div>
              <p className="mt-4 line-clamp-3 text-xs leading-5 text-muted-foreground">{currentProfile?.bio || 'Add a bio to introduce yourself to the community.'}</p>
              <button type="button" onClick={() => router.push('/profile')} className="mt-auto min-h-10 pt-3 text-sm font-semibold text-accent hover:underline">View profile</button>
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
            <button
              className={`community-shortcut ${feedTab === 'following' ? 'community-shortcut-active' : ''}`}
              type="button"
              onClick={() => {
                if (!isLoggedIn) {
                  onUnlock()
                  return
                }
                setSelectedAuthorId(null)
                setFeedTab('following')
              }}
            ><UsersRound /> Following</button>
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
            <button
              className={`community-shortcut ${feedTab === 'my-posts' ? 'community-shortcut-active' : ''}`}
              type="button"
              onClick={() => {
                if (!isLoggedIn) {
                  onUnlock()
                  return
                }
                setSelectedAuthorId(null)
                setFeedTab('my-posts')
              }}
            ><PenLine /> My Posts</button>
            <button className={`community-shortcut ${feedTab === 'collaborators' ? 'community-shortcut-active' : ''}`} type="button" onClick={() => setFeedTab('collaborators')}><Handshake /> Collaboration Board</button>
          </Panel>
        </aside>

        <section className="community-feed" aria-label="Community feed">
          {feedControlsError && <p role="alert" className="community-card px-4 py-3 text-sm text-destructive">Could not load saved post actions: {feedControlsError}</p>}
          {!updatesMode && <section className="community-card community-composer" aria-label="Create a post">
            {!canPost ? (
              <>
                <div className="flex items-center gap-3">
                  <Avatar role={isLoggedIn && role === 'artist' ? 'artist' : isLoggedIn && role === 'writer' ? 'writer' : undefined} />
                  <button type="button" onClick={focusComposer} className="community-composer-prompt">
                    {openRoleSettings
                      ? 'Naka-Reader mode ka ngayon—magpalit ng active role para mag-post.'
                      : isLoggedIn ? 'Reader ka ngayon—gusto mo bang magbahagi?' : "Ano'ng ginagawa mo ngayon? Log in to post."}
                  </button>
                </div>
                <p className="mt-3 pl-12 text-xs leading-5 text-muted-foreground">
                  {openRoleSettings
                    ? 'May Writer o Artist badge ka na. Piliin ang active role sa account settings para makapag-post.'
                    : isLoggedIn
                    ? 'Kailangan ng Writer o Alagad ng sining badge para makapag-post. Puwede mo itong i-request sa account settings.'
                    : 'Sumali sa kuwentuhan at magbahagi ng ginagawa mong likha.'}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={focusComposer}
                  className="mt-4 min-h-11 w-full rounded-xl"
                >
                  {openRoleSettings
                    ? 'Change active role'
                    : isLoggedIn ? 'Alamin kung paano makakuha ng badge' : 'Log in to post'}
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
                <MentionTextField
                  as="textarea"
                  id="community-post"
                  value={draft}
                  currentUserId={currentUserId}
                  fieldRef={textareaRef}
                  maxLength={MAX_POST_LENGTH}
                  onChange={(value) => { setDraft(value); setComposerError(null) }}
                  placeholder="Ano'ng ginagawa mo ngayon? Share your progress, a reading reco, or an idea."
                  className="community-composer-textarea mt-4"
                />
                <div className="flex justify-end text-xs text-muted-foreground"><span>{draft.length}/{MAX_POST_LENGTH}</span></div>

                <div className="mt-3">
                  <label htmlFor="community-attached-work" className="mb-1.5 block text-xs font-bold">Attach a published work <span className="font-normal text-muted-foreground">(optional)</span></label>
                  {worksHydrated && attachableWorks.length > 0 ? (
                    <select
                      id="community-attached-work"
                      value={attachedWorkId ?? ''}
                      onChange={(event) => setAttachedWorkId(event.target.value || null)}
                      className="community-select"
                    >
                      <option value="">No attached work</option>
                      {attachableWorks.map((work) => (
                        <option key={work.id} value={work.id}>{work.title} · {work.type === 'comic' ? 'Comic' : 'Story'}</option>
                      ))}
                    </select>
                  ) : (
                    <p className="rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">
                      {worksHydrated ? 'Publish a story or comic before attaching it.' : 'Loading your published works…'}
                    </p>
                  )}
                </div>

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
          </section>}

          {!updatesMode && <nav className="community-feed-tabs" aria-label="Feed filter">
            {feedTabs.map((tab) => (
              <button key={tab.id} type="button" aria-current={feedTab === tab.id ? 'page' : undefined} onClick={() => setFeedTab(tab.id)} className={`community-feed-tab ${feedTab === tab.id ? 'community-feed-tab-active' : ''}`}>
                {tab.label}
              </button>
            ))}
          </nav>}

          {!updatesMode && <div className="md:hidden">{renderAuthorsToFollow()}</div>}

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
            followingLoading ? <div className="community-card h-44 animate-pulse bg-secondary/45" aria-label="Loading following feed" /> : followingError ? (
              <div className="community-empty"><p role="alert" className="text-sm text-destructive">{followingError}</p><button type="button" onClick={() => setFollowingReload((version) => version + 1)} className="mt-3 min-h-11 text-sm font-bold text-accent">Try again</button></div>
            ) : (
              <>{visiblePosts.length ? <div className="flex flex-col gap-3">
                {visiblePosts.map((post) => (
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
                      onCommentReaction={toggleCommentReaction}
                      onUpdateComment={updateComment}
                      onProfileClick={openProfile}
                      currentUserId={currentUserId}
                      onDelete={deletePost}
                      onEdit={updatePost}
                      mutedAuthor={mutedAuthorIds.includes(post.authorId ?? '')}
                      onHidePost={hideCommunityPost}
                      onToggleMuteAuthor={toggleCommunityAuthorMute}
                      onBlockAuthor={blockCommunityAuthor}
                    />
                  </div>
                ))}
              </div> : <div className="community-empty">
                <span className="empty-icon"><UsersRound className="size-5" /></span>
                <h2 className="mt-4 font-serif text-xl font-bold">{followingIds.length ? 'No updates yet' : 'Through stories, we find each other'}</h2>
                <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{followingIds.length ? 'The creators you follow have not posted yet. Check back soon.' : 'Follow other people to bring your feed to life and discover new worlds.'}</p>
                <Button type="button" onClick={() => router.push('/browse')} className="mt-4 min-h-11 rounded-xl bg-accent text-accent-foreground">Find creators</Button>
              </div>}</>
            )
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
              <h2 className="mt-4 font-serif text-xl font-bold">{feedTab === 'collaborators' ? 'Wala pang naghahanap ng ka-collab' : feedTab === 'saved' ? 'Wala ka pang naka-save na post' : feedTab === 'my-posts' ? 'You haven’t posted yet' : 'Wala pang kuwentuhan dito'}</h2>
              <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
                {feedTab === 'collaborators'
                  ? 'Baka ikaw ang unang mag-post ng collaboration request at makahanap ng kaagapay.'
                  : feedTab === 'saved'
                    ? 'I-save ang mga post na gusto mong balikan para makita rito.'
                    : feedTab === 'my-posts'
                      ? 'Your posts will appear here after you share them with the community.'
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
                    onCommentReaction={toggleCommentReaction}
                    onUpdateComment={updateComment}
                    onProfileClick={openProfile}
                    currentUserId={currentUserId}
                    onDelete={deletePost}
                    onEdit={updatePost}
                    mutedAuthor={mutedAuthorIds.includes(post.authorId ?? '')}
                    onHidePost={hideCommunityPost}
                    onToggleMuteAuthor={toggleCommunityAuthorMute}
                    onBlockAuthor={blockCommunityAuthor}
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

          {!updatesMode && renderAuthorsToFollow()}
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
