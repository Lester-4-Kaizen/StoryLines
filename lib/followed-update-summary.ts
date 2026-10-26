import { getSupabaseClient } from '@/lib/supabase'

type FollowedUpdateSummaryItem = {
  key: string
  author_id: string
  created_at: string
  preview: string
}

export async function getFollowedUpdateSummary(userId: string) {
  const supabase = getSupabaseClient()
  const { data: follows, error: followsError } = await supabase
    .from('community_follows')
    .select('creator_id')
    .eq('follower_id', userId)
  if (followsError) throw followsError
  const authorIds = (follows ?? []).map((follow) => follow.creator_id)
  if (!authorIds.length) return { latestPreview: null, unreadKeys: [] as string[] }

  const [worksResult, announcementsResult, readsResult, mutesResult] = await Promise.all([
    supabase.from('creator_works')
      .select('id, author_id, title, type, status, created_at, updated_at')
      .in('author_id', authorIds)
      .neq('status', 'Draft')
      .order('updated_at', { ascending: false })
      .limit(100),
    supabase.from('community_posts')
      .select('id, author_id, created_at')
      .in('author_id', authorIds)
      .eq('type', 'update')
      .order('created_at', { ascending: false })
      .limit(100),
    supabase.from('community_followed_update_reads')
      .select('update_key')
      .eq('user_id', userId)
      .limit(1000),
    supabase.from('community_update_author_mutes')
      .select('author_id')
      .eq('user_id', userId),
  ])
  if (worksResult.error) throw worksResult.error
  if (announcementsResult.error) throw announcementsResult.error
  if (readsResult.error) throw readsResult.error
  if (mutesResult.error) throw mutesResult.error

  const works = worksResult.data ?? []
  const workIds = works.map((work) => work.id)
  const [chaptersResult, pagesResult] = await Promise.all([
    workIds.length
      ? supabase.from('creator_work_chapters')
        .select('id, work_id, chapter_number, title, updated_at')
        .in('work_id', workIds)
        .eq('is_published', true)
        .order('updated_at', { ascending: false })
        .limit(100)
      : Promise.resolve({ data: [], error: null }),
    workIds.length
      ? supabase.from('creator_comic_pages')
        .select('id, work_id, page_number, updated_at')
        .in('work_id', workIds)
        .eq('is_published', true)
        .order('updated_at', { ascending: false })
        .limit(100)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (chaptersResult.error) throw chaptersResult.error
  if (pagesResult.error) throw pagesResult.error

  const latestChapterByWork = new Map<string, (typeof chaptersResult.data)[number]>()
  for (const chapter of chaptersResult.data ?? []) {
    if (!latestChapterByWork.has(chapter.work_id)) latestChapterByWork.set(chapter.work_id, chapter)
  }
  const latestPageByWork = new Map<string, (typeof pagesResult.data)[number]>()
  for (const page of pagesResult.data ?? []) {
    if (!latestPageByWork.has(page.work_id)) latestPageByWork.set(page.work_id, page)
  }

  const updates: FollowedUpdateSummaryItem[] = []
  for (const work of works) {
    if (work.type === 'story') {
      updates.push({
        key: work.status === 'Complete' ? `complete:${work.id}` : `story:${work.id}`,
        author_id: work.author_id,
        created_at: work.status === 'Complete' ? work.updated_at : work.created_at,
        preview: work.status === 'Complete' ? 'completed a story' : `published a new story, ${work.title}`,
      })
      const chapter = latestChapterByWork.get(work.id)
      if (chapter) {
        updates.push({
          key: `chapter:${chapter.id}`,
          author_id: work.author_id,
          created_at: chapter.updated_at,
          preview: `posted Chapter ${chapter.chapter_number}${chapter.title ? `: ${chapter.title}` : ''}`,
        })
      }
    } else if (work.type === 'comic') {
      const page = latestPageByWork.get(work.id)
      updates.push({
        key: page ? `comic:${page.id}` : `comic:${work.id}`,
        author_id: work.author_id,
        created_at: page?.updated_at ?? work.updated_at,
        preview: page ? `posted a new comic episode, ${work.title}` : `published a new comic, ${work.title}`,
      })
    }
  }
  for (const announcement of announcementsResult.data ?? []) {
    updates.push({
      key: `announcement:${announcement.id}`,
      author_id: announcement.author_id,
      created_at: announcement.created_at,
      preview: 'shared an announcement',
    })
  }

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const mutedAuthors = new Set((mutesResult.data ?? []).map((mute) => mute.author_id))
  const recentUpdates = updates
    .filter((update) => new Date(update.created_at).getTime() >= weekAgo && !mutedAuthors.has(update.author_id))
    .sort((first, second) => new Date(second.created_at).getTime() - new Date(first.created_at).getTime())
  const readKeys = new Set((readsResult.data ?? []).map((read) => read.update_key))
  const unreadKeys = recentUpdates.filter((update) => !readKeys.has(update.key)).map((update) => update.key)
  const latest = recentUpdates[0]
  if (!latest) return { latestPreview: null, unreadKeys }

  const { data: author, error: authorError } = await supabase.from('profiles')
    .select('display_name')
    .eq('id', latest.author_id)
    .maybeSingle()
  if (authorError) throw authorError
  return {
    latestPreview: `${author?.display_name ?? 'An author you follow'} ${latest.preview}`,
    unreadKeys,
  }
}
