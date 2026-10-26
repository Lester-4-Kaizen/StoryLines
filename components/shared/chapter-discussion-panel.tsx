'use client'

import { useCallback, useEffect, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CommunityCommentThread } from '@/components/shared/community-comment-thread'
import { MentionTextField } from '@/components/shared/mention-text-field'
import { getErrorMessage } from '@/lib/error-message'
import { getSupabaseClient } from '@/lib/supabase'
import type { CommunityComment } from '@/lib/types'

type DiscussionRow = {
  id: string
  chapter_id?: string
  work_id?: string
  author_id: string
  parent_comment_id: string | null
  paragraph_index: number | null
  anchor_text: string
  content: string
  created_at: string
}

type AuthorRow = { id: string; display_name: string; username: string; avatar_path: string | null }
type ChapterReaction = 'like' | 'funny' | 'love' | 'surprised' | 'angry' | 'sad'
type ChapterReactionRow = { reaction: ChapterReaction; reaction_count: number | string; reacted_by_me: boolean }

const COMMENT_PAGE_SIZE = 20

const CHAPTER_REACTIONS: { value: ChapterReaction; label: string; emoji: string }[] = [
  { value: 'like', label: 'Like', emoji: '👍' },
  { value: 'funny', label: 'Funny', emoji: '😂' },
  { value: 'love', label: 'Love', emoji: '❤️' },
  { value: 'surprised', label: 'Surprised', emoji: '😮' },
  { value: 'angry', label: 'Angry', emoji: '😠' },
  { value: 'sad', label: 'Sad', emoji: '😢' },
]

export function ChapterDiscussionPanel({
  workId,
  chapterId,
  paragraphIndex,
  anchorText,
  currentUserId,
  onCommentCreated,
  onClose,
  onLoginRequired,
  onSignUpRequired,
}: {
  workId?: string
  chapterId?: string
  paragraphIndex: number | null
  anchorText: string
  currentUserId: string | null
  onCommentCreated?: (paragraphIndex: number | null) => void
  onClose?: () => void
  onLoginRequired: () => void
  onSignUpRequired?: () => void
}) {
  const workWide = workId !== undefined
  const chapterWide = !workWide && paragraphIndex === null
  const globalDiscussion = chapterWide || workWide
  const router = useRouter()
  const [comments, setComments] = useState<CommunityComment[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [replyingTo, setReplyingTo] = useState<CommunityComment | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [reload, setReload] = useState(0)
  const [chapterReactionCounts, setChapterReactionCounts] = useState<Record<ChapterReaction, number>>({
    like: 0,
    funny: 0,
    love: 0,
    surprised: 0,
    angry: 0,
    sad: 0,
  })
  const [myChapterReaction, setMyChapterReaction] = useState<ChapterReaction | null>(null)
  const [savingChapterReaction, setSavingChapterReaction] = useState(false)
  const [chapterReactionError, setChapterReactionError] = useState<string | null>(null)
  const [commentOrder, setCommentOrder] = useState<'newest' | 'oldest'>('newest')
  const [loadedRootCount, setLoadedRootCount] = useState(0)
  const [rootCommentCount, setRootCommentCount] = useState(0)
  const [totalCommentCount, setTotalCommentCount] = useState(0)

  const loadChapterReactions = useCallback(async () => {
    if (!chapterWide || !chapterId) return
    const { data, error: reactionLoadError } = await getSupabaseClient()
      .rpc('get_creator_chapter_discussion_reactions', { p_chapter_id: chapterId })
    if (reactionLoadError) throw reactionLoadError
    const nextCounts: Record<ChapterReaction, number> = {
      like: 0,
      funny: 0,
      love: 0,
      surprised: 0,
      angry: 0,
      sad: 0,
    }
    let selectedReaction: ChapterReaction | null = null
    for (const row of (data ?? []) as ChapterReactionRow[]) {
      nextCounts[row.reaction] = Number(row.reaction_count)
      if (row.reacted_by_me) selectedReaction = row.reaction
    }
    setChapterReactionCounts(nextCounts)
    setMyChapterReaction(selectedReaction)
    setChapterReactionError(null)
  }, [chapterId, chapterWide])

  const loadComments = useCallback(async (offset = 0, append = false) => {
    if (append) setLoadingMore(true)
    else setLoading(true)
    setLoadMoreError(null)
    setError(null)
    try {
      const scopeId = workWide ? workId : chapterId
      if (!scopeId) throw new Error('The discussion is missing its work or chapter identifier.')
      const supabase = getSupabaseClient()
      const ascending = globalDiscussion ? commentOrder === 'oldest' : true
      const [scopedRows, totalRows] = workWide
        ? await Promise.all([
          supabase
          .from('creator_work_discussion_comments')
          .select('id, work_id, author_id, parent_comment_id, content, created_at', { count: 'exact' })
          .eq('work_id', scopeId)
          .is('parent_comment_id', null)
          .order('created_at', { ascending })
          .order('id', { ascending })
          .range(offset, offset + COMMENT_PAGE_SIZE - 1),
          supabase
            .from('creator_work_discussion_comments')
            .select('id', { count: 'exact', head: true })
            .eq('work_id', scopeId),
        ])
        : paragraphIndex === null
          ? await Promise.all([
            supabase
          .from('creator_chapter_comments')
          .select('id, chapter_id, author_id, parent_comment_id, paragraph_index, anchor_text, content, created_at', { count: 'exact' })
          .eq('chapter_id', scopeId)
          .is('paragraph_index', null)
          .is('parent_comment_id', null)
          .order('created_at', { ascending })
          .order('id', { ascending })
          .range(offset, offset + COMMENT_PAGE_SIZE - 1),
            supabase
              .from('creator_chapter_comments')
              .select('id', { count: 'exact', head: true })
              .eq('chapter_id', scopeId)
              .is('paragraph_index', null),
          ])
          : await Promise.all([
            supabase
          .from('creator_chapter_comments')
          .select('id, chapter_id, author_id, parent_comment_id, paragraph_index, anchor_text, content, created_at', { count: 'exact' })
          .eq('chapter_id', scopeId)
          .eq('paragraph_index', paragraphIndex)
          .is('parent_comment_id', null)
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .range(offset, offset + COMMENT_PAGE_SIZE - 1),
            supabase
              .from('creator_chapter_comments')
              .select('id', { count: 'exact', head: true })
              .eq('chapter_id', scopeId)
              .eq('paragraph_index', paragraphIndex),
          ])
      if (scopedRows.error) throw scopedRows.error
      if (totalRows.error) throw totalRows.error
      const rootRows = (scopedRows.data ?? []) as DiscussionRow[]
      const rootIds = rootRows.map((comment) => comment.id)
      const replyRows = rootIds.length
        ? workWide
          ? await supabase
            .from('creator_work_discussion_comments')
            .select('id, work_id, author_id, parent_comment_id, content, created_at')
            .in('parent_comment_id', rootIds)
            .order('created_at', { ascending: true })
          : paragraphIndex === null
            ? await supabase
              .from('creator_chapter_comments')
              .select('id, chapter_id, author_id, parent_comment_id, paragraph_index, anchor_text, content, created_at')
              .eq('chapter_id', scopeId)
              .is('paragraph_index', null)
              .in('parent_comment_id', rootIds)
              .order('created_at', { ascending: true })
            : await supabase
              .from('creator_chapter_comments')
              .select('id, chapter_id, author_id, parent_comment_id, paragraph_index, anchor_text, content, created_at')
              .eq('chapter_id', scopeId)
              .eq('paragraph_index', paragraphIndex)
              .in('parent_comment_id', rootIds)
              .order('created_at', { ascending: true })
        : { data: [], error: null }
      if (replyRows.error) throw replyRows.error
      const commentRows = [...rootRows, ...((replyRows.data ?? []) as DiscussionRow[])]
      const authorIds = Array.from(new Set(commentRows.map((comment) => comment.author_id)))
      const commentIds = commentRows.map((comment) => comment.id)
      const reactionCountBatches = await Promise.all(
        Array.from({ length: Math.ceil(commentIds.length / 100) }, (_, index) =>
          supabase.rpc(workWide ? 'get_creator_work_discussion_comment_reaction_counts' : 'get_creator_chapter_comment_reaction_counts', {
            p_comment_ids: commentIds.slice(index * 100, (index + 1) * 100),
          }),
        ),
      )
      const failedCountBatch = reactionCountBatches.find((result) => result.error)
      if (failedCountBatch?.error) throw failedCountBatch.error
      const countsData = reactionCountBatches.flatMap((result) => result.data ?? [])
      const [authorsResult, reactionsResult] = await Promise.all([
        authorIds.length
          ? supabase.from('profiles').select('id, display_name, username, avatar_path').in('id', authorIds)
          : Promise.resolve({ data: [], error: null }),
        currentUserId && commentIds.length
          ? supabase.from(workWide ? 'creator_work_discussion_comment_reactions' : 'creator_chapter_comment_reactions').select('comment_id, reaction').eq('user_id', currentUserId).in('comment_id', commentIds)
          : Promise.resolve({ data: [], error: null }),
      ])
      if (authorsResult.error) throw authorsResult.error
      if (reactionsResult.error) throw reactionsResult.error
      const authors = new Map(((authorsResult.data ?? []) as AuthorRow[]).map((author) => [author.id, author]))
      const counts = new Map<string, { likes: number; dislikes: number }>(countsData.map((row: { comment_id: string; likes: number | string; dislikes: number | string }) => [
        row.comment_id,
        { likes: Number(row.likes), dislikes: Number(row.dislikes) },
      ]))
      const myReactions = new Map((reactionsResult.data ?? []).map((row: { comment_id: string; reaction: 'like' | 'dislike' }) => [
        row.comment_id,
        row.reaction,
      ]))
      const nextComments = commentRows.map((row) => {
        const author = authors.get(row.author_id)
        const count = counts.get(row.id)
        return {
          id: row.id,
          postId: scopeId,
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
      })
      setComments((current) => {
        if (!append) return nextComments
        const existingIds = new Set(current.map((comment) => comment.id))
        return [...current, ...nextComments.filter((comment) => !existingIds.has(comment.id))]
      })
      setLoadedRootCount(offset + rootRows.length)
      setRootCommentCount(scopedRows.count ?? 0)
      setTotalCommentCount(totalRows.count ?? 0)
    } catch (loadError) {
      console.error('Failed to load discussion comments', loadError)
      if (append) setLoadMoreError(getErrorMessage(loadError, 'Could not load more discussion comments.'))
      else setError(getErrorMessage(loadError, 'Could not load discussion comments.'))
    } finally {
      if (append) setLoadingMore(false)
      else setLoading(false)
    }
  }, [chapterId, commentOrder, currentUserId, globalDiscussion, paragraphIndex, workId, workWide])

  useEffect(() => {
    let active = true
    void loadComments().catch((loadError: unknown) => {
      if (active) setError(loadError instanceof Error ? loadError.message : 'Could not load discussion comments.')
    })
    return () => {
      active = false
    }
  }, [loadComments, reload])

  useEffect(() => {
    if (!chapterWide) return
    let active = true
    void loadChapterReactions().catch((loadError: unknown) => {
      if (!active) return
      console.error('Failed to load chapter reactions', loadError)
      setChapterReactionError(getErrorMessage(loadError, 'Could not load chapter reactions.'))
    })
    return () => {
      active = false
    }
  }, [chapterWide, loadChapterReactions, reload])

  const sortedComments = [...comments].sort((left, right) => (
    commentOrder === 'newest' ? right.createdAt - left.createdAt : left.createdAt - right.createdAt
  ))
  const totalChapterReactions = Object.values(chapterReactionCounts).reduce((total, count) => total + count, 0)

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
    const scopeId = workWide ? workId : chapterId
    if (!scopeId) {
      setError('The discussion is missing its work or chapter identifier.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const { data: profile, error: profileError } = await getSupabaseClient()
        .from('profiles')
        .select('display_name, username, avatar_path')
        .eq('id', currentUserId)
        .single()
      if (profileError) throw profileError

      const { data, error: insertError } = await getSupabaseClient()
        .from(workWide ? 'creator_work_discussion_comments' : 'creator_chapter_comments')
        .insert(workWide
          ? {
            work_id: scopeId,
            author_id: currentUserId,
            parent_comment_id: replyingTo?.id ?? null,
            content,
          }
          : {
            chapter_id: scopeId,
            author_id: currentUserId,
            parent_comment_id: replyingTo?.id ?? null,
            paragraph_index: paragraphIndex,
            anchor_text: paragraphIndex === null ? '' : anchorText.slice(0, 300),
            content,
          })
        .select('id, author_id, parent_comment_id, content, created_at')
        .single()
      if (insertError) throw insertError
      const newComment: CommunityComment = {
        id: data.id,
        postId: scopeId,
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
      setTotalCommentCount((count) => count + 1)
      if (!replyingTo) {
        setRootCommentCount((count) => count + 1)
        setLoadedRootCount((count) => count + 1)
      }
      setDraft('')
      setReplyingTo(null)
      onCommentCreated?.(paragraphIndex)
    } catch (submitError) {
      console.error('Failed to post discussion comment', submitError)
      setError(getErrorMessage(submitError, 'Could not post this comment.'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleCommentKeyDown = (event: ReactKeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (
      event.key !== 'Enter'
      || event.shiftKey
      || event.nativeEvent.isComposing
      || event.nativeEvent.keyCode === 229
      || submitting
      || !draft.trim()
    ) return
    event.preventDefault()
    event.currentTarget.form?.requestSubmit()
  }

  const reactToChapter = async (reaction: ChapterReaction) => {
    if (!currentUserId) {
      onLoginRequired()
      return
    }
    if (savingChapterReaction) return
    setSavingChapterReaction(true)
    setChapterReactionError(null)
    try {
      const { error: saveError } = await getSupabaseClient().rpc('toggle_creator_chapter_discussion_reaction', {
        p_chapter_id: chapterId,
        p_reaction: reaction,
      })
      if (saveError) throw saveError
      await loadChapterReactions()
    } catch (reactionError) {
      console.error('Failed to save chapter reaction', reactionError)
      setChapterReactionError(getErrorMessage(reactionError, 'Could not save your reaction.'))
    } finally {
      setSavingChapterReaction(false)
    }
  }

  const toggleReaction = async (comment: CommunityComment, reaction: 'like' | 'dislike') => {
    if (!currentUserId) {
      onLoginRequired()
      return
    }
    const supabase = getSupabaseClient()
    const reactionTable = workWide ? 'creator_work_discussion_comment_reactions' : 'creator_chapter_comment_reactions'
    const { data: existing, error: readError } = await supabase
      .from(reactionTable)
      .select('reaction')
      .eq('comment_id', comment.id)
      .eq('user_id', currentUserId)
      .maybeSingle()
    if (readError) throw readError
    if (existing?.reaction === reaction) {
      const { error: deleteError } = await supabase.from(reactionTable).delete().eq('comment_id', comment.id).eq('user_id', currentUserId)
      if (deleteError) throw deleteError
    } else if (existing) {
      const { error: updateError } = await supabase.from(reactionTable).update({ reaction }).eq('comment_id', comment.id).eq('user_id', currentUserId)
      if (updateError) throw updateError
    } else {
      const { error: insertError } = await supabase.from(reactionTable).insert({ comment_id: comment.id, user_id: currentUserId, reaction })
      if (insertError) throw insertError
    }
    await loadComments()
  }

  const deleteComment = async (comment: CommunityComment) => {
    const { error: deleteError } = await getSupabaseClient()
      .from(workWide ? 'creator_work_discussion_comments' : 'creator_chapter_comments')
      .delete()
      .eq('id', comment.id)
      .eq('author_id', currentUserId)
    if (deleteError) throw deleteError
    const removedCommentCount = 1 + comments.filter((item) => item.parentCommentId === comment.id).length
    setComments((current) => current.filter((item) => (
      item.id !== comment.id && item.parentCommentId !== comment.id
    )))
    setTotalCommentCount((count) => Math.max(0, count - removedCommentCount))
    if (!comment.parentCommentId) {
      setRootCommentCount((count) => Math.max(0, count - 1))
      setLoadedRootCount((count) => Math.max(0, count - 1))
    }
  }

  const replyTo = (comment: CommunityComment) => {
    setReplyingTo(comment)
    requestAnimationFrame(() => document.getElementById(`reply-comment-${comment.id}`)?.focus())
  }

  const login = () => {
    onLoginRequired()
  }
  const openProfile = (userId: string) => {
    router.push(userId === currentUserId ? '/profile' : `/profile/${encodeURIComponent(userId)}`)
  }

  const commentThread = loading ? (
    <p className="py-3 text-sm text-muted-foreground" aria-live="polite">Loading discussion…</p>
  ) : error && !comments.length ? (
    <div className="py-3">
      <p role="alert" className="text-sm text-destructive">{error}</p>
      <button type="button" onClick={() => setReload((value) => value + 1)} className="mt-2 min-h-9 text-xs font-bold text-accent">Try again</button>
    </div>
  ) : (
    <CommunityCommentThread
      comments={globalDiscussion ? sortedComments : comments}
      currentUserId={currentUserId}
      onProfile={openProfile}
      onReply={replyTo}
      onReaction={toggleReaction}
      onDelete={deleteComment}
      onLoginRequired={login}
      replyTargetId={replyingTo?.id ?? null}
      replyTargetName={replyingTo?.authorName}
      replyDraft={draft}
      replyError={replyingTo ? error : null}
      onReplyDraftChange={setDraft}
      onReplySubmit={(event) => void addComment(event)}
      onReplyCancel={() => {
        setReplyingTo(null)
        setDraft('')
        setError(null)
      }}
      replySubmitting={submitting}
      reportTargetType={workWide ? 'work_comment' : 'chapter_comment'}
    />
  )
  const loadMoreButton = !loading && loadedRootCount < rootCommentCount ? (
    <div className="mt-4 flex justify-center">
      <button
        type="button"
        onClick={() => void loadComments(loadedRootCount, true)}
        disabled={loadingMore}
        className="min-h-10 rounded-full border border-border px-5 text-xs font-bold text-accent hover:bg-secondary disabled:opacity-60"
      >
        {loadingMore ? 'Loading comments…' : 'Load more comments'}
      </button>
      {loadMoreError && <p role="alert" className="basis-full text-center text-xs text-destructive">{loadMoreError}</p>}
    </div>
  ) : null

  const commentComposer = currentUserId ? replyingTo ? null : (
    <form onSubmit={(event) => void addComment(event)} className="border-t border-border pt-4">
      <label htmlFor={`chapter-comment-input-${paragraphIndex ?? 'chapter'}`} className="sr-only">
        {workWide ? 'Write a comment about this story' : chapterWide ? 'Write a comment about this chapter' : 'Write a comment about this paragraph'}
      </label>
      <MentionTextField
        as="textarea"
        id={`chapter-comment-input-${paragraphIndex ?? 'chapter'}`}
        value={draft}
        currentUserId={currentUserId}
        onChange={setDraft}
        onKeyDown={handleCommentKeyDown}
        maxLength={500}
        rows={globalDiscussion ? 3 : 2}
        placeholder={workWide ? 'Share your thoughts about this story…' : chapterWide ? 'Share your thoughts about this chapter…' : 'Add to the discussion…'}
        className="w-full resize-y rounded-xl border border-border bg-background p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {error && <p role="alert" className="mt-1 text-xs text-destructive">{error}</p>}
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">{draft.length}/500</span>
        <button type="submit" disabled={submitting || !draft.trim()} className="min-h-10 rounded-full bg-accent px-4 text-xs font-bold text-accent-foreground disabled:opacity-50">
          {submitting ? 'Posting…' : 'Comment'}
        </button>
      </div>
    </form>
  ) : globalDiscussion ? (
    <div className="border-t border-border pt-4">
      <div className="rounded-xl border border-border bg-background p-3">
        <textarea
          aria-label={workWide ? 'Sign up to join the story discussion' : 'Sign up to join the chapter discussion'}
          disabled
          rows={2}
          placeholder={workWide ? 'Sign up to join the story discussion…' : 'Sign up to join the chapter discussion…'}
          className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={onSignUpRequired ?? onLoginRequired}
            className="min-h-10 rounded-full bg-accent px-4 text-xs font-bold text-accent-foreground"
          >
            Sign up to comment
          </button>
        </div>
      </div>
    </div>
  ) : (
    <button type="button" onClick={login} className="w-full border-t border-border pt-3 text-left text-sm font-semibold text-accent">
      Log in to join the discussion
    </button>
  )

  return (
    <section
      aria-label={workWide ? 'Story discussion' : chapterWide ? 'Chapter discussion' : `Comments on paragraph ${paragraphIndex! + 1}`}
      className={chapterWide ? 'w-full' : 'rounded-2xl border border-border bg-card p-4 shadow-xl sm:p-5'}
    >
      {chapterWide && (
        <div className="mb-8 rounded-2xl border border-border bg-secondary/35 px-4 py-6 text-center sm:px-6">
          <h3 className="font-serif text-lg font-bold">What did you think of this chapter?</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {totalChapterReactions} {totalChapterReactions === 1 ? 'reaction' : 'reactions'}
          </p>
          <div className="mx-auto mt-4 grid max-w-2xl grid-cols-3 gap-2 sm:grid-cols-6">
            {CHAPTER_REACTIONS.map((reaction) => (
              <button
                key={reaction.value}
                type="button"
                aria-pressed={myChapterReaction === reaction.value}
                aria-label={`${reaction.label}, ${chapterReactionCounts[reaction.value]} reactions`}
                disabled={savingChapterReaction}
                onClick={() => void reactToChapter(reaction.value)}
                className={`flex min-h-20 flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 transition-colors hover:bg-background/80 disabled:opacity-60 ${myChapterReaction === reaction.value ? 'bg-background text-accent ring-1 ring-accent' : ''}`}
              >
                <span className="text-2xl leading-none" aria-hidden="true">{reaction.emoji}</span>
                <span className="text-xs font-bold">{chapterReactionCounts[reaction.value]}</span>
                <span className="text-[11px] text-muted-foreground">{reaction.label}</span>
              </button>
            ))}
          </div>
          {chapterReactionError && <p role="alert" className="mt-3 text-xs text-destructive">{chapterReactionError}</p>}
        </div>
      )}
      <header className={`flex items-start gap-3 ${chapterWide ? 'border-b border-border pb-4' : 'border-b border-border pb-3'}`}>
        <div className="min-w-0 flex-1">
          <h3 className={`font-serif font-bold ${chapterWide ? 'text-2xl' : 'text-lg'}`}>{workWide ? 'Comments' : 'Discussion'}</h3>
          {anchorText && <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{anchorText}</p>}
        </div>
        {globalDiscussion && !loading && !error && (
          <span className="shrink-0 pt-1 text-sm text-muted-foreground">
            {totalCommentCount} {totalCommentCount === 1 ? 'Comment' : 'Comments'}
          </span>
        )}
        {onClose && (
          <button type="button" onClick={onClose} className="flex size-9 shrink-0 items-center justify-center rounded-full hover:bg-muted" aria-label="Close discussion">
            <X className="size-4" />
          </button>
        )}
        {globalDiscussion && (
          <div className="flex shrink-0 items-center gap-1 rounded-lg bg-secondary/70 p-1" aria-label="Sort comments">
            {(['newest', 'oldest'] as const).map((order) => (
              <button
                key={order}
                type="button"
                aria-pressed={commentOrder === order}
                onClick={() => setCommentOrder(order)}
                className={`min-h-8 rounded-md px-3 text-xs font-bold transition-colors ${commentOrder === order ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {order === 'newest' ? 'New' : 'Old'}
              </button>
            ))}
          </div>
        )}
      </header>
      {globalDiscussion ? (
        <>
          {commentComposer}
          <aside className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-secondary/30 px-3 py-2.5 text-xs text-muted-foreground">
            <span>By commenting, you agree to follow our community rules.</span>
            <Link href="/guidelines" className="min-h-8 rounded-full bg-accent px-3 py-1.5 font-bold text-accent-foreground hover:brightness-95">
              Read rules
            </Link>
          </aside>
          <div className="mt-6">{commentThread}{loadMoreButton}</div>
        </>
      ) : (
        <>
          <div className="max-h-80 overflow-y-auto py-4">{commentThread}{loadMoreButton}</div>
          {commentComposer}
        </>
      )}
    </section>
  )
}
