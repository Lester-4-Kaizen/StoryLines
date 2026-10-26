import { describe, expect, it } from 'vitest'
import { parseModerationStatus } from '../../lib/moderation/status'

describe('parseModerationStatus', () => {
  it('parses a complete account status response', () => {
    expect(parseModerationStatus({
      status: 'suspended',
      warningCount: 2,
      suspendedUntil: '2026-10-30T12:00:00Z',
      latestMessage: 'Your account has been suspended.',
    })).toEqual({
      status: 'suspended',
      warningCount: 2,
      suspendedUntil: '2026-10-30T12:00:00Z',
      latestMessage: 'Your account has been suspended.',
    })
  })

  it.each([
    null,
    {},
    { status: 'deleted', warningCount: 0, suspendedUntil: null, latestMessage: null },
    { status: 'active', warningCount: -1, suspendedUntil: null, latestMessage: null },
    { status: 'active', warningCount: 0.5, suspendedUntil: null, latestMessage: null },
    { status: 'active', warningCount: 0, suspendedUntil: 123, latestMessage: null },
    { status: 'active', warningCount: 0, suspendedUntil: null, latestMessage: false },
  ])('rejects malformed status responses', (input) => {
    expect(() => parseModerationStatus(input)).toThrow()
  })
})
