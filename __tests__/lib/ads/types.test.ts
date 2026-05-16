// __tests__/lib/ads/types.test.ts
import {
  isAdPlatform,
  type AdPlatform,
  type AdConnection,
  type AdAccount,
} from '@/lib/ads/types'

describe('AdPlatform guard', () => {
  it('accepts the 4 supported platforms', () => {
    const accepted: AdPlatform[] = ['meta', 'google', 'linkedin', 'tiktok']
    for (const p of accepted) expect(isAdPlatform(p)).toBe(true)
  })

  it('rejects unknown values', () => {
    for (const v of ['twitter', '', null, undefined, 0]) {
      expect(isAdPlatform(v)).toBe(false)
    }
  })
})

describe('AdConnection shape', () => {
  it('matches the documented shape', () => {
    const c: AdConnection = {
      id: 'conn_1',
      orgId: 'org_1',
      platform: 'meta',
      status: 'active',
      userId: 'meta_user_123',
      scopes: ['ads_management'],
      adAccounts: [{ id: 'act_42', name: 'Test', currency: 'USD', timezone: 'America/Los_Angeles' }],
      defaultAdAccountId: 'act_42',
      tokenType: 'user',
      accessTokenEnc: { ciphertext: 'a', iv: 'b', tag: 'c' },
      expiresAt: { seconds: 1, nanoseconds: 0 } as any,
      createdAt: { seconds: 1, nanoseconds: 0 } as any,
      updatedAt: { seconds: 1, nanoseconds: 0 } as any,
    }
    expect(c.platform).toBe('meta')
  })
})

describe('AdAccount shape', () => {
  it('requires id, name, currency, timezone', () => {
    const a: AdAccount = { id: 'act_1', name: 'X', currency: 'USD', timezone: 'UTC' }
    expect(a.id).toBe('act_1')
  })

  it('allows optional businessId', () => {
    const a: AdAccount = {
      id: 'act_1',
      name: 'X',
      currency: 'USD',
      timezone: 'UTC',
      businessId: 'biz_1',
    }
    expect(a.businessId).toBe('biz_1')
  })
})
