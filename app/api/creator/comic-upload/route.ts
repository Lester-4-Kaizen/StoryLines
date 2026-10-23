import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const MAX_IMAGE_SIZE = 20 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const IMAGE_ID_PATTERN = /^[0-9a-f-]{36}$/i

async function getAuthenticatedCreator() {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    return { error: NextResponse.json({ error: 'Mag-log in para magpatuloy.' }, { status: 401 }) } as const
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('roles')
    .eq('id', user.id)
    .maybeSingle()
  if (profileError) {
    console.error('Could not check comic creator role', profileError)
    return { error: NextResponse.json({ error: 'Hindi ma-verify ang creator role mo. Subukan ulit.' }, { status: 503 }) } as const
  }
  if (!profile?.roles.includes('artist')) {
    return { error: NextResponse.json({ error: 'Kailangan ang Artist / Comics badge para sa comic images.' }, { status: 403 }) } as const
  }
  return { user, supabase } as const
}

export async function POST(request: Request) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
  const apiToken = process.env.CLOUDFLARE_IMAGES_API_TOKEN
  const deliveryHash = process.env.CLOUDFLARE_IMAGES_DELIVERY_HASH
  if (!accountId || !apiToken || !deliveryHash) {
    return NextResponse.json({ error: 'Comic uploads are not configured yet. Ask the site owner to configure Cloudflare Images.' }, { status: 503 })
  }

  const auth = await getAuthenticatedCreator()
  if ('error' in auth) return auth.error
  const { user } = auth

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Hindi valid ang upload request.' }, { status: 400 })
  }
  const values = typeof body === 'object' && body !== null ? body as Record<string, unknown> : {}
  const contentType = typeof values.contentType === 'string' ? values.contentType : ''
  const fileSize = typeof values.fileSize === 'number' ? values.fileSize : 0
  if (!ALLOWED_IMAGE_TYPES.has(contentType) || fileSize <= 0 || fileSize > MAX_IMAGE_SIZE) {
    return NextResponse.json({ error: 'Pumili ng PNG, JPG, o WEBP na hindi lalampas sa 20 MB.' }, { status: 400 })
  }

  const cloudflareForm = new FormData()
  cloudflareForm.set('requireSignedURLs', 'false')
  cloudflareForm.set('metadata', JSON.stringify({ owner_id: user.id, content_type: contentType }))

  let cloudflareResponse: Response
  try {
    cloudflareResponse = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/images/v2/direct_upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiToken}` },
      body: cloudflareForm,
      cache: 'no-store',
    })
  } catch (error) {
    console.error('Cloudflare Images upload URL request failed', error)
    return NextResponse.json({ error: 'Hindi maabot ang image service. Subukan ulit mamaya.' }, { status: 502 })
  }

  const result: unknown = await cloudflareResponse.json().catch((error: unknown) => {
    console.error('Could not parse Cloudflare Images response', error)
    return null
  })
  const resultBody = typeof result === 'object' && result !== null ? result as Record<string, unknown> : {}
  const image = typeof resultBody.result === 'object' && resultBody.result !== null ? resultBody.result as Record<string, unknown> : {}
  if (!cloudflareResponse.ok || resultBody.success !== true || typeof image.id !== 'string' || typeof image.uploadURL !== 'string') {
    console.error('Cloudflare Images did not issue an upload URL', { status: cloudflareResponse.status, errors: resultBody.errors })
    return NextResponse.json({ error: 'Hindi nakagawa ng secure upload link. Subukan ulit.' }, { status: 502 })
  }

  return NextResponse.json({
    uploadUrl: image.uploadURL,
    imageId: image.id,
    imageUrl: `https://imagedelivery.net/${encodeURIComponent(deliveryHash)}/${encodeURIComponent(image.id)}/public`,
  }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function DELETE(request: Request) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
  const apiToken = process.env.CLOUDFLARE_IMAGES_API_TOKEN
  if (!accountId || !apiToken) {
    return NextResponse.json({ error: 'Cloudflare Images is not configured.' }, { status: 503 })
  }
  const auth = await getAuthenticatedCreator()
  if ('error' in auth) return auth.error

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Hindi valid ang image request.' }, { status: 400 })
  }
  const imageId = typeof body === 'object' && body !== null && 'imageId' in body && typeof body.imageId === 'string'
    ? body.imageId
    : ''
  if (!IMAGE_ID_PATTERN.test(imageId)) {
    return NextResponse.json({ error: 'Hindi valid ang image ID.' }, { status: 400 })
  }

  const imageEndpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/images/v1/${encodeURIComponent(imageId)}`
  let imageResponse: Response
  try {
    imageResponse = await fetch(imageEndpoint, {
      headers: { Authorization: `Bearer ${apiToken}` },
      cache: 'no-store',
    })
  } catch (error) {
    console.error('Cloudflare Images lookup failed before delete', error)
    return NextResponse.json({ error: 'Hindi ma-verify ang image ownership.' }, { status: 502 })
  }
  const imagePayload: unknown = await imageResponse.json().catch(() => null)
  const payload = typeof imagePayload === 'object' && imagePayload !== null ? imagePayload as Record<string, unknown> : {}
  const image = typeof payload.result === 'object' && payload.result !== null ? payload.result as Record<string, unknown> : {}
  const metadata = typeof image.metadata === 'object' && image.metadata !== null ? image.metadata as Record<string, unknown> : {}
  if (!imageResponse.ok || metadata.owner_id !== auth.user.id) {
    return NextResponse.json({ error: 'Hindi ma-verify na sa iyo ang image na ito.' }, { status: 403 })
  }

  let deleteResponse: Response
  try {
    deleteResponse = await fetch(imageEndpoint, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${apiToken}` },
      cache: 'no-store',
    })
  } catch (error) {
    console.error('Cloudflare Images delete request failed', error)
    return NextResponse.json({ error: 'Hindi na-delete ang image. Subukan ulit.' }, { status: 502 })
  }
  if (!deleteResponse.ok) {
    console.error('Cloudflare Images rejected delete request', { status: deleteResponse.status })
    return NextResponse.json({ error: 'Hindi na-delete ang image. Subukan ulit.' }, { status: 502 })
  }
  return NextResponse.json({ ok: true })
}
