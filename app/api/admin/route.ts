import { NextResponse, type NextRequest } from 'next/server'
import { getModerationAccess } from '@/lib/admin/access'

type RequestBody = Record<string, unknown>

function isRequestBody(value: unknown): value is RequestBody {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const section = searchParams.get('section')
  const status = searchParams.get('status') ?? 'open'
  if (section === 'appeals') {
    const { supabase } = await getModerationAccess()
    const { data, error } = await supabase.rpc('get_moderation_warning_appeals')
    if (error) {
      const statusCode = error.message.includes('Staff access') ? 403 : 400
      return NextResponse.json({ error: error.message }, { status: statusCode })
    }
    return NextResponse.json({ data })
  }
  if (section !== 'reports' || !['open', 'dismissed', 'actioned'].includes(status)) {
    return NextResponse.json({ error: 'Unknown moderation filter.' }, { status: 400 })
  }
  const { supabase } = await getModerationAccess()
  const { data, error } = await supabase.rpc('admin_moderation_data', {
    p_section: section,
    p_search: searchParams.get('search') ?? '',
    p_status: status,
  })
  if (error) {
    const statusCode = error.message.includes('Staff access') ? 403 : 400
    return NextResponse.json({ error: error.message }, { status: statusCode })
  }
  return NextResponse.json({ data })
}

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 })
  }
  if (!isRequestBody(body) || !isString(body.action)) {
    return NextResponse.json({ error: 'A moderation action is required.' }, { status: 400 })
  }

  const { supabase, staffRole } = await getModerationAccess()
  let error: { message: string } | null = null

  if (body.action === 'report') {
    if (!isString(body.reportId) || !isString(body.moderationAction)) {
      return NextResponse.json({ error: 'A report and action are required.' }, { status: 400 })
    }
    const result = await supabase.rpc('moderate_community_report', {
      p_report_id: body.reportId,
      p_action: body.moderationAction,
      p_note: typeof body.note === 'string' ? body.note : '',
      p_suspend_days: typeof body.suspendDays === 'number' ? body.suspendDays : 7,
      p_notify_reporters: body.notifyReporters !== false,
      p_notify_reported: body.notifyReported !== false,
    })
    error = result.error
  } else if (body.action === 'user') {
    if (!isString(body.userId) || !isString(body.moderationAction)) {
      return NextResponse.json({ error: 'An account and action are required.' }, { status: 400 })
    }
    const result = await supabase.rpc('moderate_user_account', {
      p_user_id: body.userId,
      p_action: body.moderationAction,
      p_note: typeof body.note === 'string' ? body.note : '',
      p_suspend_days: typeof body.suspendDays === 'number' ? body.suspendDays : 7,
    })
    error = result.error
  } else if (body.action === 'content') {
    if (!isString(body.contentType) || !isString(body.contentId) || typeof body.hidden !== 'boolean') {
      return NextResponse.json({ error: 'A content item and visibility state are required.' }, { status: 400 })
    }
    const result = await supabase.rpc('set_moderation_content_visibility', {
      p_content_type: body.contentType,
      p_content_id: body.contentId,
      p_hidden: body.hidden,
      p_note: typeof body.note === 'string' ? body.note : '',
    })
    error = result.error
  } else if (body.action === 'staff-role') {
    if (staffRole !== 'admin') {
      return NextResponse.json({ error: 'Administrator access is required.' }, { status: 403 })
    }
    if (!isString(body.userId) || !isString(body.staffRole)) {
      return NextResponse.json({ error: 'An account and staff role are required.' }, { status: 400 })
    }
    const result = await supabase.rpc('set_moderation_staff_role', {
      p_user_id: body.userId,
      p_staff_role: body.staffRole,
    })
    error = result.error
  } else if (body.action === 'warning-appeal') {
    if (!isString(body.appealId) || !['upheld', 'rescinded'].includes(String(body.decision))) {
      return NextResponse.json({ error: 'An appeal and decision are required.' }, { status: 400 })
    }
    const result = await supabase.rpc('resolve_moderation_warning_appeal', {
      p_appeal_id: body.appealId,
      p_decision: body.decision,
      p_note: typeof body.note === 'string' ? body.note : '',
    })
    error = result.error
  } else {
    return NextResponse.json({ error: 'Unknown moderation action.' }, { status: 400 })
  }

  if (error) {
    const status = error.message.includes('Staff access') || error.message.includes('Administrator access') ? 403 : 400
    return NextResponse.json({ error: error.message }, { status })
  }
  return NextResponse.json({ ok: true })
}
