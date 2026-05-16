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

import type {
  AdCampaign,
  AdSet,
  Ad,
  CreateAdCampaignInput,
  CreateAdSetInput,
  CreateAdInput,
} from '@/lib/ads/types'

describe('AdCampaign shape', () => {
  it('matches the documented shape', () => {
    const c: AdCampaign = {
      id: 'cmp_1',
      orgId: 'org_1',
      platform: 'meta',
      adAccountId: 'act_42',
      name: 'Test',
      objective: 'TRAFFIC',
      status: 'DRAFT',
      cboEnabled: false,
      specialAdCategories: [],
      providerData: {},
      createdBy: 'user_1',
      createdAt: { seconds: 1, nanoseconds: 0 } as any,
      updatedAt: { seconds: 1, nanoseconds: 0 } as any,
    }
    expect(c.objective).toBe('TRAFFIC')
  })
})

describe('CreateAdCampaignInput', () => {
  it('requires name, objective, adAccountId; omits id/timestamps', () => {
    const input: CreateAdCampaignInput = {
      adAccountId: 'act_42',
      name: 'New',
      objective: 'LEADS',
      status: 'DRAFT',
      cboEnabled: false,
      specialAdCategories: [],
    }
    expect(input.name).toBe('New')
  })
})

describe('AdSet shape', () => {
  it('matches the documented shape', () => {
    const a: AdSet = {
      id: 'ads_1',
      orgId: 'org_1',
      campaignId: 'cmp_1',
      platform: 'meta',
      name: 'Test',
      status: 'DRAFT',
      optimizationGoal: 'LINK_CLICKS',
      billingEvent: 'IMPRESSIONS',
      targeting: {
        geo: { countries: ['US'] },
        demographics: { ageMin: 18, ageMax: 65 },
      },
      placements: { feeds: true, stories: true, reels: false, marketplace: false },
      providerData: {},
      createdAt: { seconds: 1, nanoseconds: 0 } as any,
      updatedAt: { seconds: 1, nanoseconds: 0 } as any,
    }
    expect(a.optimizationGoal).toBe('LINK_CLICKS')
  })
})

describe('Ad shape', () => {
  it('matches the documented shape (SINGLE_IMAGE)', () => {
    const a: Ad = {
      id: 'ad_1',
      orgId: 'org_1',
      adSetId: 'ads_1',
      campaignId: 'cmp_1',
      platform: 'meta',
      name: 'Test Ad',
      status: 'DRAFT',
      format: 'SINGLE_IMAGE',
      creativeIds: [],
      inlineImageUrl: 'https://example.com/img.jpg',
      copy: {
        primaryText: 'Buy now',
        headline: 'Big sale',
        description: 'Limited time',
        callToAction: 'SHOP_NOW',
      },
      providerData: {},
      createdAt: { seconds: 1, nanoseconds: 0 } as any,
      updatedAt: { seconds: 1, nanoseconds: 0 } as any,
    }
    expect(a.format).toBe('SINGLE_IMAGE')
  })
})

import type {
  AdCreative,
  CreateAdCreativeInput,
  AdCreativeType,
  PlatformCreativeRef,
} from '@/lib/ads/types'

describe('AdCreative shape', () => {
  it('matches the documented shape', () => {
    const c: AdCreative = {
      id: 'crv_1',
      orgId: 'org_1',
      type: 'image',
      name: 'Hero image',
      storagePath: 'orgs/org_1/ad_creatives/crv_1/source.jpg',
      sourceUrl: 'https://storage.googleapis.com/.../source.jpg',
      previewUrl: 'https://storage.googleapis.com/.../preview.jpg',
      width: 1200,
      height: 1200,
      fileSize: 250000,
      mimeType: 'image/jpeg',
      status: 'READY',
      platformRefs: {
        meta: { creativeId: 'imgh_abc', syncedAt: { seconds: 1, nanoseconds: 0 } as any },
      },
      createdBy: 'user_1',
      createdAt: { seconds: 1, nanoseconds: 0 } as any,
      updatedAt: { seconds: 1, nanoseconds: 0 } as any,
    }
    expect(c.type).toBe('image')
    expect(c.platformRefs.meta?.creativeId).toBe('imgh_abc')
  })
})

describe('AdCreativeType enum', () => {
  it('includes image, video, carousel_card', () => {
    const ts: AdCreativeType[] = ['image', 'video', 'carousel_card']
    expect(ts).toHaveLength(3)
  })
})

describe('PlatformCreativeRef', () => {
  it('has creativeId + optional hash + syncedAt', () => {
    const r: PlatformCreativeRef = {
      creativeId: 'h1',
      hash: 'sha256',
      syncedAt: { seconds: 1, nanoseconds: 0 } as any,
    }
    expect(r.creativeId).toBe('h1')
  })
})
