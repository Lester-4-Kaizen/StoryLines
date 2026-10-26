export type ModerationStatus = {
  status: 'active' | 'suspended' | 'banned'
  warningCount: number
  suspendedUntil: string | null
  latestMessage: string | null
}

export function parseModerationStatus(value: unknown): ModerationStatus {
  if (!value || typeof value !== 'object') {
    throw new Error('The moderation status response was invalid.')
  }

  const record = value as Record<string, unknown>
  if (
    (record.status !== 'active' && record.status !== 'suspended' && record.status !== 'banned')
    || typeof record.warningCount !== 'number'
    || !Number.isInteger(record.warningCount)
    || record.warningCount < 0
    || (record.suspendedUntil !== null && typeof record.suspendedUntil !== 'string')
    || (record.latestMessage !== null && typeof record.latestMessage !== 'string')
  ) {
    throw new Error('The moderation status response was incomplete.')
  }

  return {
    status: record.status,
    warningCount: record.warningCount,
    suspendedUntil: record.suspendedUntil,
    latestMessage: record.latestMessage,
  }
}
