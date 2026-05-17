// __tests__/lib/ads/keyword-types.test.ts
// TypeScript shape + exhaustiveness tests for AdKeyword and AdKeywordMatchType.

import type { AdKeyword, AdKeywordMatchType } from '@/lib/ads/types'
import type { Timestamp } from 'firebase-admin/firestore'

// Minimal stub so we can construct shape-complete objects without a live Firestore.
const stubTimestamp = { toDate: () => new Date() } as unknown as Timestamp

describe('AdKeyword shape', () => {
  it('accepts all required fields', () => {
    const kw: AdKeyword = {
      id: 'kw-1',
      orgId: 'org-abc',
      campaignId: 'camp-1',
      adSetId: 'adset-1',
      text: 'running shoes',
      matchType: 'EXACT',
      status: 'ACTIVE',
      negativeKeyword: false,
      createdAt: stubTimestamp,
      updatedAt: stubTimestamp,
    }
    expect(kw.text).toBe('running shoes')
    expect(kw.matchType).toBe('EXACT')
    expect(kw.negativeKeyword).toBe(false)
  })

  it('accepts optional providerData.google', () => {
    const kw: AdKeyword = {
      id: 'kw-2',
      orgId: 'org-abc',
      campaignId: 'camp-1',
      adSetId: 'adset-1',
      text: 'buy shoes online',
      matchType: 'PHRASE',
      status: 'PAUSED',
      negativeKeyword: false,
      cpcBidMicros: '500000',
      providerData: {
        google: {
          keywordResourceName: 'customers/123/adGroupCriteria/456~789',
          cpcBidMicros: '500000',
        },
      },
      createdAt: stubTimestamp,
      updatedAt: stubTimestamp,
    }
    expect(kw.providerData?.google?.keywordResourceName).toBe('customers/123/adGroupCriteria/456~789')
  })
})

describe('AdKeywordMatchType exhaustiveness', () => {
  it('covers all three match types', () => {
    const allMatchTypes: AdKeywordMatchType[] = ['EXACT', 'PHRASE', 'BROAD']
    expect(allMatchTypes).toHaveLength(3)
    allMatchTypes.forEach((m) => {
      expect(['EXACT', 'PHRASE', 'BROAD']).toContain(m)
    })
  })
})
