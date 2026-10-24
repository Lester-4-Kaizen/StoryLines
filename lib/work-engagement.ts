import { getSupabaseClient } from '@/lib/supabase'

export type RankingPeriod = 'Today' | 'This week' | 'This month' | 'All time'
export type RankingCategory = 'stories' | 'comics' | 'works' | 'creators'

export type WorkRankingEntry = {
  entity_id: string
  title: string | null
  work_type: 'story' | 'comic' | null
  creator_id: string
  creator_name: string
  creator_username: string
  creator_avatar_url: string | null
  cover_image_url: string | null
  view_count: number
  like_count: number
  follower_count: number
  score: number
  work_count: number
}

export type WorkAnalyticsEntry = {
  work_id: string
  title: string
  work_type: 'story' | 'comic'
  view_count: number
  like_count: number
  score: number
}

type RawWorkRankingEntry = Omit<WorkRankingEntry, 'view_count' | 'like_count' | 'follower_count' | 'creator_avatar_url' | 'score' | 'work_count'> & {
  view_count: number | string
  like_count: number | string
  score: number | string
  work_count: number | string
}

type RawWorkAnalyticsEntry = Omit<WorkAnalyticsEntry, 'view_count' | 'like_count' | 'score'> & {
  view_count: number | string
  like_count: number | string
  score: number | string
}

function periodValue(period: RankingPeriod) {
  if (period === 'Today') return 'today'
  if (period === 'This week') return 'week'
  if (period === 'This month') return 'month'
  return 'all'
}

export async function loadWorkRankings(category: RankingCategory, period: RankingPeriod) {
  const { data, error } = await getSupabaseClient().rpc('get_creator_work_rankings', {
    p_category: category,
    p_period: periodValue(period),
  })
  if (error) throw error
  const rows = ((data ?? []) as RawWorkRankingEntry[]).map((row) => ({
    ...row,
    view_count: Number(row.view_count),
    like_count: Number(row.like_count),
    follower_count: 0,
    creator_avatar_url: null,
    score: Number(row.score),
    work_count: Number(row.work_count),
  }))
  if (category !== 'creators' || rows.length === 0) return rows

  const supabase = getSupabaseClient()
  const creatorIds = rows.map((row) => row.creator_id)
  const [creatorStatsResult, profileResult] = await Promise.all([
    supabase.rpc('get_browse_creator_stats', { p_profile_ids: creatorIds }),
    supabase.from('profiles').select('id, avatar_path').in('id', creatorIds),
  ])
  if (creatorStatsResult.error) throw creatorStatsResult.error
  if (profileResult.error) throw profileResult.error
  const followerRows = (creatorStatsResult.data ?? []) as { profile_id: string; follower_count: number | string }[]
  const followersByCreator = new Map<string, number>(
    followerRows.map((creator) => [creator.profile_id, Number(creator.follower_count)]),
  )
  const avatarsByCreator = new Map(
    profileResult.data.map((profile) => [
      profile.id,
      profile.avatar_path
        ? supabase.storage.from('avatars').getPublicUrl(profile.avatar_path).data.publicUrl
        : null,
    ]),
  )
  return rows.map((row) => ({
    ...row,
    follower_count: followersByCreator.get(row.creator_id) ?? 0,
    creator_avatar_url: avatarsByCreator.get(row.creator_id) ?? null,
  }))
}

export async function loadMyWorkAnalytics(period: RankingPeriod) {
  const { data, error } = await getSupabaseClient().rpc('get_my_work_analytics', {
    p_period: periodValue(period),
  })
  if (error) throw error
  return ((data ?? []) as RawWorkAnalyticsEntry[]).map((row) => ({
    ...row,
    view_count: Number(row.view_count),
    like_count: Number(row.like_count),
    score: Number(row.score),
  }))
}
