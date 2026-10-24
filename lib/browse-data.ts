import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { normalizeWorkLanguage } from '@/lib/work-taxonomy'
import type { Work } from '@/lib/types'

export type BrowseCreator = {
  id: string
  displayName: string
  username: string
  roles: string[]
  bio: string
  writingLanguages: string[]
  favoriteGenres: string[]
  openForCollaboration: boolean
  followerCount: number | null
  workCount: number | null
}

export type BrowsePageData = {
  works: Work[]
  workCursor: { createdAt: string; id: string } | null
  hasMoreWorks: boolean
  creators: BrowseCreator[]
  creatorCursor: { createdAt: string; id: string } | null
  hasMoreCreators: boolean
  error: string | null
  creatorsError: string | null
}

const WORK_PAGE_SIZE = 20
const CREATOR_PAGE_SIZE = 20

function supabaseError(error: unknown, query: string) {
  if (typeof error !== 'object' || error === null) {
    return Object.assign(new Error(String(error)), { query })
  }
  const read = (field: string) => (
    field in error ? Reflect.get(error, field) : undefined
  )
  return Object.assign(new Error(String(read('message') ?? 'Unknown Supabase error')), {
    query,
    code: read('code'),
    details: read('details'),
    hint: read('hint'),
  })
}

function logBrowseError(context: string, error: unknown) {
  const fields = ['query', 'code', 'message', 'details', 'hint'] as const
  const diagnostic = Object.fromEntries(fields.map((field) => [
    field,
    typeof error === 'object' && error !== null && field in error
      ? Reflect.get(error, field)
      : undefined,
  ]))
  console.error(`${context}: ${JSON.stringify(diagnostic)}`)
}

function browseLoadError(error: unknown) {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String(Reflect.get(error, 'code'))
    : ''
  if (['PGRST204', 'PGRST205', '42P01'].includes(code)) {
    return 'Hindi pa kumpleto ang Browse database setup. I-run ang Supabase migrations mula 20261023000000 hanggang 20261023001100 ayon sa filename order.'
  }
  if (code === '42501') {
    return 'Walang pahintulot ang Browse query sa Supabase. I-run ang migrations mula 20261023000000 hanggang 20261023001100 ayon sa filename order; kung na-run na, tingnan ang Supabase grants at RLS policies.'
  }
  return 'Hindi ma-load ang mga nailathalang gawa. Tingnan ang connection at subukan ulit.'
}

export async function getBrowsePageData(): Promise<BrowsePageData> {
  if (!isSupabaseConfigured) {
    return {
      works: [],
      workCursor: null,
      hasMoreWorks: false,
      creators: [],
      creatorCursor: null,
      hasMoreCreators: false,
      error: 'Hindi pa naka-configure ang browse database.',
      creatorsError: 'Hindi pa naka-configure ang browse database.',
    }
  }

  const supabase = await createSupabaseServerClient()
  try {
    const [worksResult, creatorsResult] = await Promise.all([
      supabase
        .from('creator_works')
        .select('id, author_id, title, type, synopsis, genre, moods, language, status, cover_image_url, created_at')
        .in('type', ['story', 'comic'])
        .neq('status', 'Draft')
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(WORK_PAGE_SIZE + 1),
      supabase
        .from('profiles')
        .select('id, display_name, username, roles, bio, writing_languages, favorite_genres, open_for_collaboration, created_at')
        .overlaps('roles', ['writer', 'artist'])
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(CREATOR_PAGE_SIZE + 1),
    ])
    if (worksResult.error) throw supabaseError(worksResult.error, 'creator_works')

    const workAuthorIds = Array.from(new Set(worksResult.data.map((work) => work.author_id)))
    const authorProfilesResult = workAuthorIds.length
      ? await supabase.from('profiles').select('id, display_name').in('id', workAuthorIds)
      : { data: [], error: null }
    if (authorProfilesResult.error) throw supabaseError(authorProfilesResult.error, 'profiles (work authors)')
    const { data: engagementRows, error: engagementError } = worksResult.data.length
      ? await supabase.rpc('get_creator_work_engagement_counts', {
        p_work_ids: worksResult.data.slice(0, WORK_PAGE_SIZE).map((work) => work.id),
      })
      : { data: [], error: null }
    if (engagementError) {
      console.warn('Browse work engagement counts are unavailable; apply 20261025001000_work_engagement_and_rankings.sql.')
    }
    const engagementByWorkId = new Map<string, { views: number; likes: number }>((engagementRows ?? []).map((row: {
      work_id: string
      view_count: number | string
      like_count: number | string
    }) => [row.work_id, { views: Number(row.view_count), likes: Number(row.like_count) }]))
    const pageWorks = worksResult.data.slice(0, WORK_PAGE_SIZE)
    const hasMoreWorks = worksResult.data.length > WORK_PAGE_SIZE
    const lastWork = pageWorks.at(-1)
    const pageCreators = creatorsResult.data?.slice(0, CREATOR_PAGE_SIZE) ?? []
    const hasMoreCreators = (creatorsResult.data?.length ?? 0) > CREATOR_PAGE_SIZE
    const lastCreator = pageCreators.at(-1)

    let creators: BrowseCreator[] = []
    let creatorsError: string | null = null
    if (creatorsResult.error) {
      logBrowseError('Failed to load browse creators', supabaseError(creatorsResult.error, 'profiles (browse creators)'))
      creatorsError = browseLoadError(creatorsResult.error)
    } else if (pageCreators.length) {
      const { data: stats, error: statsError } = await supabase.rpc('get_browse_creator_stats', {
        p_profile_ids: pageCreators.map((creator) => creator.id),
      })
      let statsById = new Map<string, { follower_count: number | string; work_count: number | string }>()
      if (statsError) {
        const missingFunction = typeof statsError === 'object' && statsError !== null && 'code' in statsError
          && String(Reflect.get(statsError, 'code')) === 'PGRST202'
        if (missingFunction) {
          console.warn('Browse creator statistics are unavailable; apply 20261023001000_browse_creator_stats.sql.')
          creatorsError = 'Naka-display ang directory, pero kailangan munang i-run ang 20261023001000_browse_creator_stats.sql para lumabas ang follower at work counts.'
        } else {
          logBrowseError('Failed to load browse creator stats', supabaseError(statsError, 'get_browse_creator_stats'))
          creatorsError = 'Naka-display ang directory, pero hindi ma-load ang follower at work counts. Subukan ulit.'
        }
      } else {
        statsById = new Map<string, { follower_count: number | string; work_count: number | string }>(
          (stats ?? []).map((item: { profile_id: string; follower_count: number | string; work_count: number | string }) => [item.profile_id, item]),
        )
      }
      creators = pageCreators.map((creator) => {
        const creatorStats = statsById.get(creator.id)
        return {
          id: creator.id,
          displayName: creator.display_name,
          username: creator.username,
          roles: creator.roles ?? [],
          bio: creator.bio ?? '',
          writingLanguages: Array.from(new Set((creator.writing_languages ?? []).filter(Boolean).map(normalizeWorkLanguage))),
          favoriteGenres: creator.favorite_genres ?? [],
          openForCollaboration: creator.open_for_collaboration ?? false,
          followerCount: creatorStats ? Number(creatorStats.follower_count) : null,
          workCount: creatorStats ? Number(creatorStats.work_count) : null,
        }
      })
    }

    return {
      works: pageWorks.map((work) => ({
        id: work.id,
        authorId: work.author_id,
        title: work.title,
        type: work.type as 'story' | 'comic',
        synopsis: work.synopsis,
        genre: work.genre ?? undefined,
        moods: work.moods ?? [],
        language: work.language ? normalizeWorkLanguage(work.language) : undefined,
        coverImageUrl: work.cover_image_url ?? undefined,
        authorName: authorProfilesResult.data.find((profile) => profile.id === work.author_id)?.display_name ?? 'StoryLines creator',
        status: work.status as 'Ongoing' | 'Complete',
        createdAt: new Date(work.created_at).getTime(),
        viewCount: engagementByWorkId.get(work.id)?.views,
        likeCount: engagementByWorkId.get(work.id)?.likes,
      })),
      workCursor: hasMoreWorks && lastWork ? { createdAt: lastWork.created_at, id: lastWork.id } : null,
      hasMoreWorks,
      creators,
      creatorCursor: hasMoreCreators && lastCreator ? { createdAt: lastCreator.created_at, id: lastCreator.id } : null,
      hasMoreCreators,
      error: null,
      creatorsError,
    }
  } catch (error) {
    logBrowseError('Failed to load browse works', error)
    return {
      works: [],
      workCursor: null,
      hasMoreWorks: false,
      creators: [],
      creatorCursor: null,
      hasMoreCreators: false,
      error: browseLoadError(error),
      creatorsError: null,
    }
  }
}
