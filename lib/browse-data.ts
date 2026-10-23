import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import type { Work } from '@/lib/types'

export type BrowsePageData = { works: Work[]; error: string | null }

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
    return { works: [], error: 'Hindi pa naka-configure ang browse database.' }
  }

  const supabase = await createSupabaseServerClient()
  try {
    const { data, error } = await supabase
      .from('creator_works')
      .select('id, author_id, title, type, synopsis, genre, language, status, created_at')
      .in('type', ['story', 'comic'])
      .neq('status', 'Draft')
      .order('created_at', { ascending: false })
      .limit(60)
    if (error) throw error

    return {
      works: data.map((work) => ({
        id: work.id,
        authorId: work.author_id,
        title: work.title,
        type: work.type as 'story' | 'comic',
        synopsis: work.synopsis,
        genre: work.genre ?? undefined,
        language: work.language ?? undefined,
        status: work.status as 'Ongoing' | 'Complete',
        createdAt: new Date(work.created_at).getTime(),
      })),
      error: null,
    }
  } catch (error) {
    console.error('Failed to load browse works', error)
    return { works: [], error: browseLoadError(error) }
  }
}
