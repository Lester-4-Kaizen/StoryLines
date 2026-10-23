import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const CLOUDFLARE_IMAGE_ID = /^[0-9a-f-]{36}$/i

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function getStoragePaths(
  admin: ReturnType<typeof createClient>,
  bucket: string,
  userId: string,
) {
  const folders = [userId]
  const paths: string[] = []

  while (folders.length) {
    const folder = folders.pop()
    if (!folder) continue

    let offset = 0
    while (true) {
      const { data, error } = await admin.storage.from(bucket).list(folder, {
        limit: 1000,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      })
      if (error) throw new Error(`Could not inspect the ${bucket} media folder: ${error.message}`)

      for (const item of data) {
        const path = `${folder}/${item.name}`
        if (item.id) paths.push(path)
        else folders.push(path)
      }

      if (data.length < 1000) break
      offset += data.length
    }
  }

  return paths
}

async function getCloudflareImageIds(
  admin: ReturnType<typeof createClient>,
  userId: string,
) {
  const imageIds = new Set<string>()
  const workIds: string[] = []
  let workOffset = 0
  while (true) {
    const { data: works, error: worksError } = await admin
      .from('creator_works')
      .select('id, cover_image_url')
      .eq('author_id', userId)
      .range(workOffset, workOffset + 999)
    if (worksError) throw new Error(`Could not inspect the account's published media: ${worksError.message}`)

    for (const work of works ?? []) {
      workIds.push(work.id)
      if (!work.cover_image_url) continue
      try {
        const url = new URL(work.cover_image_url)
        const segments = url.pathname.split('/').filter(Boolean)
        const id = url.hostname === 'imagedelivery.net' ? segments[1] : null
        if (id && CLOUDFLARE_IMAGE_ID.test(id)) imageIds.add(id)
      } catch {
        continue
      }
    }
    if ((works?.length ?? 0) < 1000) break
    workOffset += works?.length ?? 0
  }

  for (let index = 0; index < workIds.length; index += 100) {
    const workPage = workIds.slice(index, index + 100)
    let pageOffset = 0
    while (true) {
      const { data: pages, error: pagesError } = await admin
        .from('creator_comic_pages')
        .select('image_id')
        .in('work_id', workPage)
        .range(pageOffset, pageOffset + 999)
      if (pagesError) throw new Error(`Could not inspect the account's comic media: ${pagesError.message}`)
      for (const page of pages ?? []) {
        if (CLOUDFLARE_IMAGE_ID.test(page.image_id)) imageIds.add(page.image_id)
      }
      if ((pages?.length ?? 0) < 1000) break
      pageOffset += pages?.length ?? 0
    }
  }

  return [...imageIds]
}

async function verifyCloudflareImages(
  imageIds: string[],
  accountId: string,
  apiToken: string,
  userId: string,
) {
  for (let index = 0; index < imageIds.length; index += 10) {
    await Promise.all(imageIds.slice(index, index + 10).map(async (imageId) => {
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/images/v1/${encodeURIComponent(imageId)}`,
        { headers: { Authorization: `Bearer ${apiToken}` }, cache: 'no-store' },
      )
      if (response.status === 404) return
      if (!response.ok) throw new Error(`Could not verify a Cloudflare image before account cleanup (HTTP ${response.status}).`)

      const body: unknown = await response.json()
      const result = typeof body === 'object' && body !== null && 'result' in body
        ? Reflect.get(body, 'result')
        : null
      const metadata = typeof result === 'object' && result !== null && 'metadata' in result
        ? Reflect.get(result, 'metadata')
        : null
      if (typeof metadata !== 'object' || metadata === null || Reflect.get(metadata, 'owner_id') !== userId) {
        throw new Error('Could not verify ownership of all Cloudflare images. No account data was deleted.')
      }
    }))
  }
}

async function deleteCloudflareImages(imageIds: string[], accountId: string, apiToken: string) {
  for (let index = 0; index < imageIds.length; index += 10) {
    await Promise.all(imageIds.slice(index, index + 10).map(async (imageId) => {
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/images/v1/${encodeURIComponent(imageId)}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${apiToken}` },
          cache: 'no-store',
        },
      )
      if (!response.ok && response.status !== 404) {
        throw new Error(`Cloudflare could not delete an account image (HTTP ${response.status}). Retry account deletion to continue cleanup.`)
      }
    }))
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405)

  const authorization = request.headers.get('Authorization')
  const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!accessToken) return jsonResponse({ error: 'Log in again before deleting your account.' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Account deletion is missing Supabase server credentials.')
    return jsonResponse({ error: 'Account deletion is not configured. Contact the site owner.' }, 503)
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonResponse({ error: 'Invalid account deletion request.' }, 400)
  }
  if (
    typeof body !== 'object'
    || body === null
    || !('confirmation' in body)
    || Reflect.get(body, 'confirmation') !== 'DELETE'
  ) {
    return jsonResponse({ error: 'Type DELETE to confirm permanent account removal.' }, 400)
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: userResult, error: userError } = await admin.auth.getUser(accessToken)
  if (userError || !userResult.user) {
    return jsonResponse({ error: 'Your session expired. Log in again and retry.' }, 401)
  }

  const userId = userResult.user.id
  const accountId = Deno.env.get('CLOUDFLARE_ACCOUNT_ID')
  const cloudflareToken = Deno.env.get('CLOUDFLARE_IMAGES_API_TOKEN')

  try {
    const [imageIds, avatarPaths, communityImagePaths] = await Promise.all([
      getCloudflareImageIds(admin, userId),
      getStoragePaths(admin, 'avatars', userId),
      getStoragePaths(admin, 'community-post-images', userId),
    ])

    if (imageIds.length && (!accountId || !cloudflareToken)) {
      return jsonResponse({
        error: 'Cloudflare cleanup is not configured, so your account and media were left unchanged. Ask the site owner to configure account cleanup.',
      }, 503)
    }

    if (imageIds.length && accountId && cloudflareToken) {
      await verifyCloudflareImages(imageIds, accountId, cloudflareToken, userId)
      await deleteCloudflareImages(imageIds, accountId, cloudflareToken)
    }

    for (const [bucket, paths] of [
      ['avatars', avatarPaths],
      ['community-post-images', communityImagePaths],
    ] as const) {
      for (let index = 0; index < paths.length; index += 100) {
        const { error } = await admin.storage.from(bucket).remove(paths.slice(index, index + 100))
        if (error) throw new Error(`Could not remove account media from ${bucket}: ${error.message}`)
      }
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(userId)
    if (deleteError) throw new Error(`Account data is cleaned, but Auth could not finish deleting the account: ${deleteError.message}`)

    return jsonResponse({ ok: true })
  } catch (error) {
    console.error('Account deletion cleanup failed', {
      userId,
      message: error instanceof Error ? error.message : String(error),
    })
    return jsonResponse({
      error: error instanceof Error
        ? error.message
        : 'Hindi natapos ang account cleanup. Walang account data na inalis. Subukan ulit.',
    }, 500)
  }
})
