import { describe, expect, it } from 'vitest'
import { parseReportModerationInput } from '../../lib/moderation/request-validation'

describe('parseReportModerationInput', () => {
  it('accepts a valid report action and applies notification defaults', () => {
    expect(parseReportModerationInput({
      reportId: 'report-123',
      moderationAction: 'hide_content',
    })).toEqual({
      ok: true,
      data: {
        reportId: 'report-123',
        moderationAction: 'hide_content',
        note: '',
        suspendDays: 7,
        notifyReporters: true,
        notifyReported: true,
      },
    })
  })

  it('preserves an explicit notification choice and valid suspension period', () => {
    expect(parseReportModerationInput({
      reportId: 'report-123',
      moderationAction: 'suspend',
      suspendDays: 30,
      note: 'Repeated harassment',
      notifyReporters: false,
    })).toEqual({
      ok: true,
      data: {
        reportId: 'report-123',
        moderationAction: 'suspend',
        suspendDays: 30,
        note: 'Repeated harassment',
        notifyReporters: false,
        notifyReported: true,
      },
    })
  })

  it.each([
    ['missing report ID', { moderationAction: 'dismiss' }],
    ['unknown action', { reportId: 'report-123', moderationAction: 'restore' }],
    ['non-object input', null],
    ['array input', []],
  ])('rejects %s', (_description, input) => {
    expect(parseReportModerationInput(input).ok).toBe(false)
  })

  it.each([0, -1, 366, 1.5, '30'])('rejects an invalid suspension period: %s', (suspendDays) => {
    const result = parseReportModerationInput({
      reportId: 'report-123',
      moderationAction: 'suspend',
      suspendDays,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/suspension/i)
  })

  it('rejects malformed notification choices', () => {
    const result = parseReportModerationInput({
      reportId: 'report-123',
      moderationAction: 'dismiss',
      notifyReporters: 'false',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('Notification choices')
  })

  it('rejects an overlong moderation note', () => {
    const result = parseReportModerationInput({
      reportId: 'report-123',
      moderationAction: 'warn',
      note: 'x'.repeat(1001),
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('too long')
  })
})
