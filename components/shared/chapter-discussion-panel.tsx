'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { CommunityCommentThread } from '@/components/shared/community-comment-thread'
import { ProfileAvatar } from '@/components/shared/profile-avatar'
import { getSupabaseClient } from '@/lib/supabase'
import type { CommunityComment } from '@/lib/types'

type DiscussionRow = {
  id: string
  chapter_id: string
  author_id: string
  parent_comment_id: string | null
  paragraph_index: number
  anchor_text: string
  content: string
  created_at: string
}

type AuthorRow = { id: string; display_name: string; username: string; avatar_path: string | null }

export function ChapterDiscussionPanel({
  chapterId,
  paragraphIndex,
  anchorText,
  currentUserId,
  onClose,
  onLoginRequired,
}: {
  chapterId: string
  paragraphIndex: number
  anchorText: string
  currentUserId: string | null
  onClose: () => void
  onLoginRequired: () => void
}) {
  const router = useRouter()
  const [comments, setComments] = useState<CommunityComment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [replyingTo, setReplyingTo] = useState<CommunityComment | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [reload, setReload] = useState(0)

  const loadComments = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const supabase = getSupabaseClient()
      const { data: rows, error: loadError } = await supabase
        .from('creator_chapter_comments')
        .select('id, chapter_id, author_id, parent_comment_id, paragraph_index, anchor_text, content, created_at')
        .eq('chapter_id', chapterId)
        .eq('paragraph_index', paragraphIndex)
        .order('created_at', { ascending: true })
        .limit(100)
      if (loadError) throw loadError
      const commentRows = (rows ?? []) as DiscussionRow[]
      const authorIds = Array.from(new Set(commentRows.map((comment) => comment.author_id)))
      const commentIds = commentRows.map((comment) => comment.id)
      const [authorsResult, countsResult, reactionsResult] = await Promise.all([
        authorIds.length
          ? supabase.from('profiles').select('id, display_name, username, avatar_path').in('id', authorIds)
          : Promise.resolve({ data: [], error: null }),
        commentIds.length
          ? supabase.rpc('get_creator_chapter_comment_reaction_counts', { p_comment_ids: commentIds })
          : Promise.resolve({ data: [], error: null }),
        currentUserId && commentIds.length
          ? supabase.from('creator_chapter_comment_reactions').select('comment_id, reaction').eq('user_id', currentUserId).in('comment_id', commentIds)
          : Promise.resolve({ data: [], error: null }),
      ])
      if (authorsResult.error) throw authorsResult.error
      if (countsResult.error) throw countsResult.error
      if (reactionsResult.error) throw reactionsResult.error
      const authors = new Map(((authorsResult.data ?? []) as AuthorRow[]).map((author) => [author.id, author]))
      const counts = new Map<string, { likes: number; dislikes: number }>((countsResult.data ?? []).map((row: { comment_id: string; likes: number | string; dislikes: number | string }) => [
        row.comment_id,
        { likes: Number(row.likes), dislikes: Number(row.dislikes) },
      ]))
      const myReactions = new Map((reactionsResult.data ?? []).map((row: { comment_id: string; reaction: 'like' | 'dislike' }) => [
        row.comment_id,
        row.reaction,
      ]))
      setComments(commentRows.map((row) => {
        const author = authors.get(row.author_id)
        const count = counts.get(row.id)
        return {
          id: row.id,
          postId: chapterId,
          authorId: row.author_id,
          authorName: author?.display_name ?? 'StoryLines member',
          authorUsername: author?.username ?? '',
          authorAvatarUrl: author?.avatar_path
            ? supabase.storage.from('avatars').getPublicUrl(author.avatar_path).data.publicUrl
            : null,
          parentCommentId: row.parent_comment_id,
          content: row.content,
          createdAt: new Date(row.created_at).getTime(),
          likes: count?.likes ?? 0,
          dislikes: count?.dislikes ?? 0,
          myReaction: myReactions.get(row.id) ?? null,
        }
      }))
    } catch (loadError) {
      console.error('Failed to load chapter discussion', loadError)
      setError(loadError instanceof Error ? loadError.message : 'Could not load chapter comments.')
    } finally {
      setLoading(false)
    }
  }, [chapterId, currentUserId, paragraphIndex])

  useEffect(() => {
    let active = true
    void loadComments().catch((loadError: unknown) => {
      if (active) setError(loadError instanceof Error ? loadError.message : 'Could not load chapter comments.')
    })
    return () => {
      active = false
    }
  }, [loadComments, reload])

  const addComment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!currentUserId) {
      onLoginRequired()
      return
    }
    const content = draft.trim()
    if (!content || content.length > 500) {
      setError('Write a comment between 1 and 500 characters.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const { data, error: insertError } = await getSupabaseClient()
        .from('creator_chapter_comments')
        .insert({
          chapter_id: chapterId,
          author_id: currentUserId,
          parent_comment_id: replyingTo?.id ?? null,
          paragraph_index: paragraphIndex,
          anchor_text: anchorText.slice(0, 300),
          content,
        })
        .select('id, chapter_id, author_id, parent_comment_id, paragraph_index, anchor_text, content, created_at')
        .single()
      if (insertError) throw insertError
      const { data: profile, error: profileError } = await getSupabaseClient()
        .from('profiles')
        .select('display_name, username, avatar_path')
        .eq('id', currentUserId)
        .single()
      if (profileError) throw profileError
      const newComment: CommunityComment = {
        id: data.id,
        postId: chapterId,
        authorId: currentUserId,
        authorName: profile.display_name,
        authorUsername: profile.username,
        authorAvatarUrl: profile.avatar_path
          ? getSupabaseClient().storage.from('avatars').getPublicUrl(profile.avatar_path).data.publicUrl
          : null,
        parentCommentId: data.parent_comment_id,
        content: data.content,
        createdAt: new Date(data.created_at).getTime(),
        likes: 0,
        dislikes: 0,
        myReaction: null,
      }
      setComments((current) => [...current, newComment])
      setDraft('')
      setReplyingTo(null)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not post this comment.')
    } finally {
      setSubmitting(false)
    }
  }

  const toggleReaction = async (comment: CommunityComment, reaction: 'like' | 'dislike') => {
    if (!currentUserId) {
      onLoginRequired()
      return
    }
    const supabase = getSupabaseClient()
    const { data: existing, error: readError } = await supabase
      .from('creator_chapter_comment_reactions')
      .select('reaction')
      .eq('comment_id', comment.id)
      .eq('user_id', currentUserId)
      .maybeSingle()
    if (readError) throw readError
    if (existing?.reaction === reaction) {
      const { error: deleteError } = await supabase.from('creator_chapter_comment_reactions').delete().eq('comment_id', comment.id).eq('user_id', currentUserId)
      if (deleteError) throw deleteError
    } else if (existing) {
      const { error: updateError } = await supabase.from('creator_chapter_comment_reactions').update({ reaction }).eq('comment_id', comment.id).eq('user_id', currentUserId)
      if (updateError) throw updateError
    } else {
      const { error: insertError } = await supabase.from('creator_chapter_comment_reactions').insert({ comment_id: comment.id, user_id: currentUserId, reaction })
      if (insertError) throw insertError
    }
    await loadComments()
  }

  const deleteComment = async (comment: CommunityComment) => {
    const { error: deleteError } = await getSupabaseClient()
      .from('creator_chapter_comments')
      .delete()
      .eq('id', comment.id)
      .eq('author_id', currentUserId)
    if (deleteError) throw deleteError
    setComments((current) => current.filter((item) => (
      item.id !== comment.id && item.parentCommentId !== comment.id
    )))
  }

  const replyTo = (comment: CommunityComment) => {
    setReplyingTo(comment)
    requestAnimationFrame(() => document.getElementById(`chapter-comment-input-${paragraphIndex}`)?.focus())
  }

  const login = () => {
    onLoginRequired()
  }
  const openProfile = (userId: string) => {
    router.push(userId === currentUserId ? '/profile' : `/profile/${encodeURIComponent(userId)}`)
  }

  return (
    <section aria-label={`Comments on paragraph ${paragraphIndex + 1}`} className="rounded-2xl border border-border bg-card p-4 shadow-xl sm:p-5">
      <header className="flex items-start gap-3 border-b border-border pb-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-serif text-lg font-bold">Discussion</h3>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{anchorText}</p>
        </div>
        <button type="button" onClick={onClose} className="flex size-9 shrink-0 items-center justify-center rounded-full hover:bg-muted" aria-label="Close discussion">
          <X className="size-4" />
        </button>
      </header>
      <div className="max-h-80 overflow-y-auto py-4">
        {loading ? <p className="text-sm text-muted-foreground" aria-live="polite">Loading discussion…</p> : error && !comments.length ? (
          <div>
            <p role="alert" className="text-sm text-destructive">{error}</p>
            <button type="button" onClick={() => setReload((value) => value + 1)} className="mt-2 min-h-9 text-xs font-bold text-accent">Try again</button>
          </div>
        ) : (
          <CommunityCommentThread
            comments={comments}
            currentUserId={currentUserId}
            onProfile={openProfile}
            onReply={replyTo}
            onReaction={toggleReaction}
            onDelete={deleteComment}
            onLoginRequired={login}
          />
        )}
      </div>
      {currentUserId ? (
        <form onSubmit={(event) => void addComment(event)} className="border-t border-border pt-3">
          {replyingTo && (
            <div className="mb-2 flex items-center gap-2">
              <ProfileAvatar src={replyingTo.authorAvatarUrl} name={replyingTo.authorName} className="size-7" imageSizes="28px" />
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">Replying to {replyingTo.authorName}</span>
              <button type="button" onClick={() => setReplyingTo(null)} className="min-h-8 px-2 text-xs font-semibold text-accent">Cancel</button>
            </div>
          )}
          <label htmlFor={`chapter-comment-input-${paragraphIndex}`} className="sr-only">Write a comment about this paragraph</label>
          <textarea
            id={`chapter-comment-input-${paragraphIndex}`}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={500}
            rows={2}
            placeholder="Add to the discussion…"
            className="w-full resize-y rounded-xl border border-border bg-background p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {error && <p role="alert" className="mt-1 text-xs text-destructive">{error}</p>}
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">{draft.length}/500</span>
            <button type="submit" disabled={submitting || !draft.trim()} className="min-h-10 rounded-full bg-accent px-4 text-xs font-bold text-accent-foreground disabled:opacity-50">
              {submitting ? 'Posting…' : replyingTo ? 'Reply' : 'Comment'}
            </button>
          </div>
        </form>
      ) : (
        <button type="button" onClick={login} className="w-full border-t border-border pt-3 text-left text-sm font-semibold text-accent">
          Log in to join the discussion
        </button>
      )}
    </section>
  )
}
