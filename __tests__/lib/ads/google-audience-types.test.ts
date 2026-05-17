// __tests__/lib/ads/google-audience-types.test.ts
// Type-level + runtime tests for Google audience subtype types (Sub-3a Phase 5)

import type {
  GoogleAdsAudienceSubtype,
  GoogleAdsCustomerMatchData,
  GoogleAdsRemarketingData,
  GoogleAdsCustomSegmentData,
  GoogleAdsPredefinedAudienceData,
  GoogleAdsAudienceData,
} from '@/lib/ads/types'

describe('GoogleAdsCustomerMatchData', () => {
  it('compiles with required fields', () => {
    const d: GoogleAdsCustomerMatchData = {
      subtype: 'CUSTOMER_MATCH',
      userListResourceName: 'customers/123/userLists/456',
      uploadKeyType: 'CONTACT_INFO',
    }
    expect(d.subtype).toBe('CUSTOMER_MATCH')
    expect(d.userListResourceName).toBe('customers/123/userLists/456')
    expect(d.uploadKeyType).toBe('CONTACT_INFO')
  })
})

describe('GoogleAdsRemarketingData', () => {
  it('compiles with required fields', () => {
    const d: GoogleAdsRemarketingData = {
      subtype: 'REMARKETING',
      userListResourceName: 'customers/123/userLists/789',
      membershipLifeSpanDays: 30,
      ruleType: 'WEBSITE',
    }
    expect(d.subtype).toBe('REMARKETING')
    expect(d.membershipLifeSpanDays).toBe(30)
    expect(d.ruleType).toBe('WEBSITE')
  })
})

describe('GoogleAdsCustomSegmentData', () => {
  it('compiles with required fields', () => {
    const d: GoogleAdsCustomSegmentData = {
      subtype: 'CUSTOM_SEGMENT',
      customAudienceResourceName: 'customers/123/customAudiences/1',
      segmentType: 'KEYWORD',
      values: ['running shoes', 'marathon training'],
    }
    expect(d.subtype).toBe('CUSTOM_SEGMENT')
    expect(d.segmentType).toBe('KEYWORD')
    expect(d.values).toHaveLength(2)
  })
})

describe('GoogleAdsPredefinedAudienceData', () => {
  it('compiles for AFFINITY subtype', () => {
    const d: GoogleAdsPredefinedAudienceData = {
      subtype: 'AFFINITY',
      audienceResourceName: 'audiences/1234',
      categoryName: 'Sports & Fitness',
    }
    expect(d.subtype).toBe('AFFINITY')
    expect(d.categoryName).toBe('Sports & Fitness')
  })

  it('compiles for IN_MARKET subtype', () => {
    const d: GoogleAdsPredefinedAudienceData = {
      subtype: 'IN_MARKET',
      audienceResourceName: 'audiences/5678',
      categoryName: 'Apparel & Accessories',
    }
    expect(d.subtype).toBe('IN_MARKET')
    expect(d.audienceResourceName).toBe('audiences/5678')
  })
})

describe('GoogleAdsAudienceData discriminated union', () => {
  it('narrows correctly via subtype field', () => {
    const data: GoogleAdsAudienceData = {
      subtype: 'CUSTOMER_MATCH',
      userListResourceName: 'customers/1/userLists/2',
      uploadKeyType: 'CRM_ID',
    }

    if (data.subtype === 'CUSTOMER_MATCH') {
      // TypeScript narrows here — uploadKeyType is only on GoogleAdsCustomerMatchData
      expect(data.uploadKeyType).toBe('CRM_ID')
    } else {
      // Should never reach here in this test
      throw new Error('Unexpected subtype')
    }
  })
})
