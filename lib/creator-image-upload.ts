import { getSupabaseClient } from '@/lib/supabase'

const MAX_IMAGE_SIZE = 20 * 1024 * 1024
const ACCEPTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const COVER_BUCKET = 'work-covers'

export type UploadedCreatorImage = {
  storagePath: string
  imageUrl: string
}

export function validateCreatorImage(file: File) {
  if (!ACCEPTED_IMAGE_TYPES.has(file.type) || file.size <= 0 || file.size > MAX_IMAGE_SIZE) {
    throw new Error('Pumili ng PNG, JPG, o WEBP na hindi lalampas sa 20 MB.')
  }
}

export async function uploadCreatorCover(file: File): Promise<UploadedCreatorImage> {
  validateCreatorImage(file)
  const supabase = getSupabaseClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError) throw userError
  if (!user) throw new Error('Mag-log in ulit bago mag-upload ng cover image.')

  const extension = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/png' ? 'png' : 'webp'
  const storagePath = `${user.id}/${crypto.randomUUID()}.${extension}`
  const { error: uploadError } = await supabase.storage.from(COVER_BUCKET).upload(storagePath, file, {
    cacheControl: '31536000',
    contentType: file.type,
    upsert: false,
  })
  if (uploadError) throw uploadError
  const imageUrl = supabase.storage.from(COVER_BUCKET).getPublicUrl(storagePath).data.publicUrl
  return { storagePath, imageUrl }
}

export async function deleteCreatorCoverByUrl(imageUrl: string) {
  const storagePath = creatorCoverStoragePathFromUrl(imageUrl)
  if (!storagePath) return
  const { error } = await getSupabaseClient().storage.from(COVER_BUCKET).remove([storagePath])
  if (error) throw error
}

export function creatorCoverStoragePathFromUrl(imageUrl: string) {
  try {
    const url = new URL(imageUrl)
    const pathPrefix = '/storage/v1/object/public/work-covers/'
    if (!url.pathname.includes(pathPrefix)) return null
    const storagePath = decodeURIComponent(url.pathname.slice(url.pathname.indexOf(pathPrefix) + pathPrefix.length))
    return /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(?:jpg|png|webp)$/i.test(storagePath) ? storagePath : null
  } catch {
    return null
  }
}
