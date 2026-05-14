import { hashToken } from '@/lib/notifications/push'

describe('hashToken', () => {
  it('produces a stable 32-char hex id for a given token', () => {
    const id = hashToken('fcm-token-abc')
    expect(id).toMatch(/^[a-f0-9]{32}$/)
    expect(hashToken('fcm-token-abc')).toBe(id)
  })

  it('produces different ids for different tokens', () => {
    expect(hashToken('a')).not.toBe(hashToken('b'))
  })

  it('handles empty input without throwing', () => {
    expect(() => hashToken('')).not.toThrow()
    expect(hashToken('')).toMatch(/^[a-f0-9]{32}$/)
  })
})
