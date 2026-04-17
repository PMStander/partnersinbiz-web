import { hashIp } from '@/lib/analytics/ip-hash'

describe('hashIp', () => {
  it('returns a 64-char hex string', () => {
    const result = hashIp('192.168.1.1')
    expect(result).toMatch(/^[0-9a-f]{64}$/)
  })

  it('returns same hash for same IP', () => {
    expect(hashIp('10.0.0.1')).toBe(hashIp('10.0.0.1'))
  })

  it('returns different hashes for different IPs', () => {
    expect(hashIp('1.1.1.1')).not.toBe(hashIp('2.2.2.2'))
  })

  it('handles unknown gracefully', () => {
    expect(hashIp('unknown')).toMatch(/^[0-9a-f]{64}$/)
  })
})
