export function isSupabaseStorageImage(source: string) {
  const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!configuredUrl) return false
  try {
    const sourceUrl = new URL(source)
    const storageUrl = new URL(configuredUrl)
    return sourceUrl.origin === storageUrl.origin && sourceUrl.pathname.startsWith('/storage/v1/object/public/')
  } catch {
    return false
  }
}
