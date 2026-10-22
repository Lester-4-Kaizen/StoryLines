import { NextResponse } from 'next/server'
import { validateUsername } from '@/lib/auth/validation'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  if (!isSupabaseConfigured) {
    return NextResponse.json({ error: 'Username availability is not configured yet.' }, { status: 503 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Enter a valid username.' }, { status: 400 })
  }

  const username = typeof body === 'object' && body !== null && 'username' in body && typeof body.username === 'string'
    ? body.username.trim().toLowerCase()
    : ''
  const validationError = validateUsername(username)
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 })

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.from('profiles').select('id').eq('username', username).maybeSingle()
  if (error) {
    return NextResponse.json({ error: 'Username availability checking is not set up yet. Please try again later.' }, { status: 503 })
  }
  return NextResponse.json({ available: !data })
}
