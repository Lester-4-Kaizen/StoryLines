import { describe, expect, it } from 'vitest'
import { safeNextPath } from '../../lib/auth/redirect'

describe('safeNextPath', () => {
  it.each([
    ['/settings/account', '/settings/account'],
    ['/browse?q=stories#results', '/browse?q=stories#results'],
    ['/', '/'],
  ])('keeps safe local paths: %s', (input, expected) => {
    expect(safeNextPath(input)).toBe(expected)
  })

  it.each(['https://example.com', '//example.com/path', '/\\example.com', null, ''])('rejects unsafe or empty paths: %s', (input) => {
    expect(safeNextPath(input)).toBe('/')
  })
})
