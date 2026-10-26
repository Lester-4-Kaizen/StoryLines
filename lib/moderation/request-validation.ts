export const REPORT_MODERATION_ACTIONS = ['dismiss', 'hide_content', 'warn', 'suspend', 'ban'] as const

export type ReportModerationAction = (typeof REPORT_MODERATION_ACTIONS)[number]

export type ReportModerationInput = {
  reportId: string
  moderationAction: ReportModerationAction
  note: string
  suspendDays: number
  notifyReporters: boolean
  notifyReported: boolean
}

type ReportModerationParseResult =
  | { ok: true; data: ReportModerationInput }
  | { ok: false; error: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseReportModerationInput(value: unknown): ReportModerationParseResult {
  if (!isRecord(value) || typeof value.reportId !== 'string' || value.reportId.length === 0) {
    return { ok: false, error: 'A report and action are required.' }
  }
  if (
    typeof value.moderationAction !== 'string'
    || !REPORT_MODERATION_ACTIONS.includes(value.moderationAction as ReportModerationAction)
  ) {
    return { ok: false, error: 'A valid moderation action is required.' }
  }

  const note = typeof value.note === 'string' ? value.note : ''
  if (note.length > 1000) return { ok: false, error: 'The moderation note is too long.' }

  if (
    value.moderationAction === 'suspend'
    && value.suspendDays !== undefined
    && typeof value.suspendDays !== 'number'
  ) {
    return { ok: false, error: 'Suspension duration must be a number of days.' }
  }
  const suspendDays = typeof value.suspendDays === 'number' ? value.suspendDays : 7
  if (
    value.moderationAction === 'suspend'
    && (!Number.isInteger(suspendDays) || suspendDays < 1 || suspendDays > 365)
  ) {
    return { ok: false, error: 'Suspension must be between 1 and 365 days.' }
  }
  if (
    (value.notifyReporters !== undefined && typeof value.notifyReporters !== 'boolean')
    || (value.notifyReported !== undefined && typeof value.notifyReported !== 'boolean')
  ) {
    return { ok: false, error: 'Notification choices must be true or false.' }
  }

  return {
    ok: true,
    data: {
      reportId: value.reportId,
      moderationAction: value.moderationAction as ReportModerationAction,
      note,
      suspendDays,
      notifyReporters: value.notifyReporters !== false,
      notifyReported: value.notifyReported !== false,
    },
  }
}
