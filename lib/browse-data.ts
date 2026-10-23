import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/supabase/config'
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

function browseLoadError(error: unknown) {
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String(Reflect.get(error, 'code'))
    : ''
  if (['PGRST204', 'PGRST205', '42P01'].includes(code)) {
    return 'Hindi pa naka-set up ang published works. I-run ang 20261023000500_profile_page_data.sql sa Supabase SQL Editor.'
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
    if (worksResult.error) throw worksResult.error

    const workAuthorIds = Array.from(new Set(worksResult.data.map((work) => work.author_id)))
    const authorProfilesResult = workAuthorIds.length
      ? await supabase.from('profiles').select('id, display_name').in('id', workAuthorIds)
      : { data: [], error: null }
    if (authorProfilesResult.error) throw authorProfilesResult.error
    const pageWorks = worksResult.data.slice(0, WORK_PAGE_SIZE)
    const hasMoreWorks = worksResult.data.length > WORK_PAGE_SIZE
    const lastWork = pageWorks.at(-1)
    const pageCreators = creatorsResult.data?.slice(0, CREATOR_PAGE_SIZE) ?? []
    const hasMoreCreators = (creatorsResult.data?.length ?? 0) > CREATOR_PAGE_SIZE
    const lastCreator = pageCreators.at(-1)

    let creators: BrowseCreator[] = []
    let creatorsError: string | null = null
    if (creatorsResult.error) {
      console.error('Failed to load browse creators', creatorsResult.error)
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
          console.error('Failed to load browse creator stats', statsError)
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
          writingLanguages: creator.writing_languages ?? [],
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
        language: work.language ?? undefined,
        coverImageUrl: work.cover_image_url ?? undefined,
        authorName: authorProfilesResult.data.find((profile) => profile.id === work.author_id)?.display_name ?? 'StoryLines creator',
        status: work.status as 'Ongoing' | 'Complete',
        createdAt: new Date(work.created_at).getTime(),
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
    console.error('Failed to load browse works', error)
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
