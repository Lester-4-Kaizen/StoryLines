import 'server-only'
import { cache } from 'react'
import { notFound, redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const getModerationAccess = cache(async () => {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError) throw userError
  if (!user) redirect('/login?next=%2Fadmin')

  const { data: staffRole, error: roleError } = await supabase.rpc('get_my_moderation_role')
  if (roleError) throw roleError
  if (staffRole !== 'moderator' && staffRole !== 'admin') notFound()

  const { data: accountStatus, error: statusError } = await supabase.rpc('get_my_account_status')
  if (statusError) throw statusError
  if (accountStatus === 'suspended' || accountStatus === 'banned') {
    redirect(`/account-restricted?status=${accountStatus}`)
  }

  return { supabase, user, staffRole }
})

export async function getModerationPageData(section: string, search = '', status = 'open') {
  const { supabase } = await getModerationAccess()
  const [{ data, error }, messageResult] = await Promise.all([
    supabase.rpc('admin_moderation_data', {
      p_section: section,
      p_search: search,
      p_status: status,
    }),
    section === 'reports' || section === 'overview'
      ? supabase.rpc('admin_message_moderation_data', {
        p_search: search,
        p_status: status,
      })
      : Promise.resolve({ data: null, error: null }),
  ])
  if (error) throw error
  if (messageResult.error) throw messageResult.error
  let reportData = data
  if (section === 'reports' && Array.isArray(reportData)) {
    reportData = await addWorkDiscussionReportDetails(reportData, supabase)
  } else if (section === 'overview' && reportData && typeof reportData === 'object' && !Array.isArray(reportData)) {
    const overview = reportData as { reports?: unknown[] }
    reportData = {
      ...reportData,
      reports: await addWorkDiscussionReportDetails(overview.reports ?? [], supabase),
    }
  }
  if (!messageResult.data || (section !== 'reports' && section !== 'overview')) return reportData

  const messageData = messageResult.data as {
    reports?: unknown
    stats?: { openReports?: number; urgentReports?: number; resolvedThisWeek?: number }
    activity?: { date: string; reports: number }[]
  }
  const messageReports = Array.isArray(messageData.reports) ? messageData.reports : []
  const sortReports = (reports: unknown[]) => reports.sort((left, right) => {
    const leftReport = left as { reason?: string; createdAt?: string; reportCount?: number }
    const rightReport = right as { reason?: string; createdAt?: string; reportCount?: number }
    const urgency = (report: typeof leftReport) => report.reason === 'violence_self_harm'
      || report.reason === 'harassment'
      || (report.createdAt ? Date.now() - new Date(report.createdAt).getTime() > 24 * 60 * 60 * 1000 : false)
      ? 1
      : 0
    return urgency(rightReport) - urgency(leftReport)
      || (rightReport.reportCount ?? 0) - (leftReport.reportCount ?? 0)
      || new Date(leftReport.createdAt ?? 0).getTime() - new Date(rightReport.createdAt ?? 0).getTime()
  })

  if (section === 'reports') {
    return sortReports([...(Array.isArray(reportData) ? reportData : []), ...messageReports])
  }

  if (!reportData || typeof reportData !== 'object' || Array.isArray(reportData)) return reportData
  const overview = reportData as {
    reports?: unknown[]
    stats?: Record<string, number>
    activity?: { date: string; reports: number }[]
  }
  const messageStats = messageData.stats ?? {}
  const activityCounts = new Map((messageData.activity ?? []).map((day) => [day.date, day.reports]))
  return {
    ...overview,
    reports: sortReports([...(overview.reports ?? []), ...messageReports]).slice(0, 8),
    stats: {
      ...overview.stats,
      openReports: (overview.stats?.openReports ?? 0) + (messageStats.openReports ?? 0),
      urgentReports: (overview.stats?.urgentReports ?? 0) + (messageStats.urgentReports ?? 0),
      resolvedThisWeek: (overview.stats?.resolvedThisWeek ?? 0) + (messageStats.resolvedThisWeek ?? 0),
    },
    activity: (overview.activity ?? []).map((day) => ({
      ...day,
      reports: day.reports + (activityCounts.get(day.date) ?? 0),
    })),
  }
}

async function addWorkDiscussionReportDetails(reports: unknown[], supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>) {
  const targetIds = reports.flatMap((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return []
    const report = value as { targetType?: unknown; targetId?: unknown }
    return report.targetType === 'work_comment' && typeof report.targetId === 'string'
      ? [report.targetId]
      : []
  })
  if (!targetIds.length) return reports

  const uniqueIds = Array.from(new Set(targetIds))
  const pages = Array.from({ length: Math.ceil(uniqueIds.length / 100) }, (_, index) => (
    uniqueIds.slice(index * 100, (index + 1) * 100)
  ))
  const results = await Promise.all(pages.map((p_comment_ids) => (
    supabase.rpc('get_work_discussion_report_details', { p_comment_ids })
  )))
  const failedResult = results.find((result) => result.error)
  if (failedResult?.error) throw failedResult.error
  const details = new Map(results.flatMap((result) => (
    (result.data ?? []) as { id: string; content: string; work_title: string }[]
  )).map((item) => [
    item.id,
    item,
  ]))
  return reports.map((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value
    const report = value as { targetType?: unknown; targetId?: unknown }
    if (report.targetType !== 'work_comment' || typeof report.targetId !== 'string') return value
    const detail = details.get(report.targetId)
    return detail
      ? { ...value, content: detail.content, context: `Story discussion · ${detail.work_title}` }
      : value
  })
}
