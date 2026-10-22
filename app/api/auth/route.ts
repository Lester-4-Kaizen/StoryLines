import { NextResponse, type NextRequest } from 'next/server'
import { safeNextPath } from '@/lib/auth/redirect'
import { validateAuthInput } from '@/lib/auth/validation'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { createSupabaseServerClient } from '@/lib/supabase/server'

function callbackUrl(origin: string, next: string) {
  const callback = new URL('/auth/callback', origin)
  callback.searchParams.set('next', safeNextPath(next))
  return callback.toString()
}

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured) {
    return NextResponse.json({ error: 'Hindi pa naka-set up ang sign-in. Makipag-ugnayan sa site owner.' }, { status: 503 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Hindi mabasa ang form. Subukan ulit.' }, { status: 400 })
  }

  const validation = validateAuthInput(body)
  if (!validation.data) {
    return NextResponse.json({ error: 'Pakisuri ang mga field na naka-highlight.', fields: validation.errors }, { status: 400 })
  }

  const input = validation.data
  const supabase = await createSupabaseServerClient()

  if (input.action === 'signup') {
    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        data: {
          display_name: input.displayName,
          username: input.username,
          roles: input.roles,
          badges: input.roles,
          role: input.roles.includes('writer') ? 'writer' : input.roles.includes('artist') ? 'artist' : 'reader',
        },
        emailRedirectTo: callbackUrl(request.nextUrl.origin, input.next),
      },
    })
    if (error) {
      if (error.message.includes('profiles_username_lower_unique')) {
        return NextResponse.json(
          { error: 'May gumagamit na ng username na iyan.', fields: { username: 'Pumili ng ibang username.' } },
          { status: 409 },
        )
      }
      return NextResponse.json(      { error: 'Hindi nagawa ang account mo. Pakisuri ang details at subukan ulit.' }, { status: 400 })
    }
    return NextResponse.json({ ok: true, confirmationRequired: !data.session })
  }

  if (input.action === 'login') {
    const { error } = await supabase.auth.signInWithPassword({ email: input.email, password: input.password })
    if (error?.code === 'email_not_confirmed' || error?.message.toLowerCase().includes('email not confirmed')) {
      return NextResponse.json(
        { error: 'Kumpirmahin muna ang email mo bago mag-log in.', code: 'email_not_confirmed' },
        { status: 400 },
      )
    }
    if (error) return NextResponse.json({ error: 'Email or password is incorrect.' }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  if (input.action === 'forgot-password') {
    const { error } = await supabase.auth.resetPasswordForEmail(input.email, {
      redirectTo: callbackUrl(request.nextUrl.origin, '/reset-password'),
    })
    if (error) return NextResponse.json({ error: 'Hindi muna makapagpadala ng reset email. Subukan ulit mamaya.' }, { status: 503 })
    return NextResponse.json({ ok: true, message: 'Kung may account gamit ang email na iyan, papunta na ang reset link.' })
  }

  if (input.action === 'resend-confirmation') {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: input.email,
      options: { emailRedirectTo: callbackUrl(request.nextUrl.origin, input.next) },
    })
    if (error) return NextResponse.json({ error: 'Hindi muna makapagpadala ng confirmation email. Subukan ulit mamaya.' }, { status: 503 })
    return NextResponse.json({ ok: true, message: 'Kung kailangan ng confirmation ang email na iyan, papunta na ang bagong link.' })
  }

  const { error } = await supabase.auth.updateUser({ password: input.password })
  if (error) return NextResponse.json({ error: 'Baka expired na ang reset link. Humingi ng bago para magpatuloy.' }, { status: 400 })
  return NextResponse.json({ ok: true })
}
