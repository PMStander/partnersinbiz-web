// __tests__/lib/ads/merchant-center-types.test.ts
// Sub-3a Phase 4 Batch 1 — AdMerchantCenter type shape tests (compile-time + runtime).

import type { AdMerchantCenter } from '@/lib/ads/types'
import type { Timestamp } from 'firebase-admin/firestore'

// Helper: create a minimal valid AdMerchantCenter without importing Timestamp at runtime.
function makeTimestamp(): Timestamp {
  return { seconds: 1_700_000_000, nanoseconds: 0 } as unknown as Timestamp
}

describe('AdMerchantCenter type shape', () => {
  it('AdMerchantCenter with all required fields compiles and is structurally valid', () => {
    const mc: AdMerchantCenter = {
      id: 'mc-001',
      orgId: 'org-abc',
      merchantId: '123456789',
      accessTokenRef: 'tokens/access-ref-1',
      refreshTokenRef: 'tokens/refresh-ref-1',
      feedLabels: ['AU', 'US'],
      createdAt: makeTimestamp(),
      updatedAt: makeTimestamp(),
    }
    expect(mc.id).toBe('mc-001')
    expect(mc.orgId).toBe('org-abc')
    expect(mc.merchantId).toBe('123456789')
    expect(mc.accessTokenRef).toBe('tokens/access-ref-1')
    expect(mc.refreshTokenRef).toBe('tokens/refresh-ref-1')
    expect(mc.feedLabels).toEqual(['AU', 'US'])
  })

  it('AdMerchantCenter accepts optional primaryFeedId', () => {
    const mc: AdMerchantCenter = {
      id: 'mc-002',
      orgId: 'org-abc',
      merchantId: '987654321',
      accessTokenRef: 'tokens/access-ref-2',
      refreshTokenRef: 'tokens/refresh-ref-2',
      primaryFeedId: 'feed-za-001',
      feedLabels: ['ZA'],
      createdAt: makeTimestamp(),
      updatedAt: makeTimestamp(),
    }
    expect(mc.primaryFeedId).toBe('feed-za-001')
  })

  it('feedLabels empty array is allowed', () => {
    const mc: AdMerchantCenter = {
      id: 'mc-003',
      orgId: 'org-xyz',
      merchantId: '111222333',
      accessTokenRef: 'tokens/access-ref-3',
      refreshTokenRef: 'tokens/refresh-ref-3',
      feedLabels: [],
      createdAt: makeTimestamp(),
      updatedAt: makeTimestamp(),
    }
    expect(mc.feedLabels).toHaveLength(0)
  })

  it('multiple feed labels can be stored', () => {
    const mc: AdMerchantCenter = {
      id: 'mc-004',
      orgId: 'org-xyz',
      merchantId: '444555666',
      accessTokenRef: 'tokens/access-ref-4',
      refreshTokenRef: 'tokens/refresh-ref-4',
      feedLabels: ['ZA', 'AU', 'US', 'GB', 'DE'],
      createdAt: makeTimestamp(),
      updatedAt: makeTimestamp(),
    }
    expect(mc.feedLabels).toHaveLength(5)
    expect(mc.feedLabels).toContain('DE')
  })
})
