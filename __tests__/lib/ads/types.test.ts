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

import type {
  AdCustomAudience,
  AdCustomAudienceType,
  AdCustomAudienceStatus,
  CustomerListSource,
  WebsiteCASource,
  LookalikeSource,
  AppCASource,
  EngagementCASource,
  AdSavedAudience,
  CreateAdCustomAudienceInput,
  CreateAdSavedAudienceInput,
} from '@/lib/ads/types'

describe('AdCustomAudience type discriminator', () => {
  it('supports all 5 source types', () => {
    const ts: AdCustomAudienceType[] = [
      'CUSTOMER_LIST',
      'WEBSITE',
      'LOOKALIKE',
      'APP',
      'ENGAGEMENT',
    ]
    expect(ts).toHaveLength(5)
  })

  it('CUSTOMER_LIST has source.csvStoragePath + hashCount', () => {
    const src: CustomerListSource = {
      kind: 'CUSTOMER_LIST',
      csvStoragePath: 'orgs/x/ad_audiences/customer-lists/abc.csv',
      hashCount: 1234,
      uploadedAt: { seconds: 1, nanoseconds: 0 } as any,
    }
    expect(src.hashCount).toBe(1234)
  })

  it('WEBSITE has rule with retention days + url contains rules', () => {
    const src: WebsiteCASource = {
      kind: 'WEBSITE',
      pixelId: '1234567890',
      retentionDays: 30,
      rules: [{ op: 'url_contains', value: '/pricing' }],
    }
    expect(src.retentionDays).toBe(30)
  })

  it('LOOKALIKE has sourceAudienceId + percent + country', () => {
    const src: LookalikeSource = {
      kind: 'LOOKALIKE',
      sourceAudienceId: 'crv_existing',
      percent: 1,
      country: 'US',
    }
    expect(src.percent).toBe(1)
  })

  it('APP has propertyId + event', () => {
    const src: AppCASource = {
      kind: 'APP',
      propertyId: 'prop_xyz',
      event: 'Purchase',
      retentionDays: 90,
    }
    expect(src.event).toBe('Purchase')
  })

  it('ENGAGEMENT has source + lookback', () => {
    const src: EngagementCASource = {
      kind: 'ENGAGEMENT',
      engagementType: 'PAGE',
      sourceObjectId: 'fb_page_123',
      retentionDays: 60,
    }
    expect(src.engagementType).toBe('PAGE')
  })
})

describe('AdSavedAudience shape', () => {
  it('matches the documented shape', () => {
    const s: AdSavedAudience = {
      id: 'sav_1',
      orgId: 'org_1',
      platform: 'meta',
      name: 'US adults 25-54',
      targeting: {
        geo: { countries: ['US'] },
        demographics: { ageMin: 25, ageMax: 54 },
      },
      providerData: {},
      createdBy: 'user_1',
      createdAt: { seconds: 1, nanoseconds: 0 } as any,
      updatedAt: { seconds: 1, nanoseconds: 0 } as any,
    }
    expect(s.targeting.demographics.ageMin).toBe(25)
  })
})

// ─── Phase 6: Pixel + CAPI types ────────────────────────────────────────────

import type {
  AdPixelConfig,
  CapiUserHash,
  CapiCustomData,
  AdCapiEvent,
} from '@/lib/ads/types'

describe('AdPixelConfig shape', () => {
  it('requires id, orgId, name, eventMappings, timestamps; platforms are optional', () => {
    const config: AdPixelConfig = {
      id: 'pxc_abc',
      orgId: 'org_1',
      name: 'Main Pixel',
      eventMappings: [
        { pibEventName: 'purchase', metaEventName: 'Purchase', valueField: 'total' },
      ],
      meta: { pixelId: '1234567890' },
      createdBy: 'user_1',
      createdAt: { seconds: 1, nanoseconds: 0 } as any,
      updatedAt: { seconds: 1, nanoseconds: 0 } as any,
    }
    expect(config.id).toBe('pxc_abc')
    expect(config.meta?.pixelId).toBe('1234567890')
    expect(config.google).toBeUndefined()
    expect(config.eventMappings[0].pibEventName).toBe('purchase')
  })

  it('accepts optional propertyId and capiTokenEnc on platform', () => {
    const config: AdPixelConfig = {
      id: 'pxc_xyz',
      orgId: 'org_2',
      propertyId: 'prop_1',
      name: 'Scoped Pixel',
      eventMappings: [],
      meta: {
        pixelId: '9876543210',
        capiTokenEnc: { ciphertext: 'enc', iv: 'iv1', tag: 'tag1' },
        testEventCode: 'TEST123',
      },
      createdBy: 'user_2',
      createdAt: { seconds: 2, nanoseconds: 0 } as any,
      updatedAt: { seconds: 2, nanoseconds: 0 } as any,
    }
    expect(config.propertyId).toBe('prop_1')
    expect(config.meta?.capiTokenEnc?.ciphertext).toBe('enc')
    expect(config.meta?.testEventCode).toBe('TEST123')
  })
})

describe('CapiUserHash shape', () => {
  it('accepts all optional PII hash fields + raw fbp/fbc pass-throughs', () => {
    const hash: CapiUserHash = {
      em: 'a'.repeat(64),
      ph: 'b'.repeat(64),
      fn: 'c'.repeat(64),
      ln: 'd'.repeat(64),
      ge: 'e'.repeat(64),
      ct: 'f'.repeat(64),
      st: 'g'.repeat(64),
      country: 'h'.repeat(64),
      zp: 'i'.repeat(64),
      db: 'j'.repeat(64),
      external_id: 'k'.repeat(64),
      fbp: 'fb.1.1234.5678',
      fbc: 'fb.1.1234.AbCdEfGh',
    }
    expect(hash.em).toHaveLength(64)
    expect(hash.fbp).toBe('fb.1.1234.5678')
    expect(hash.fbc).toBe('fb.1.1234.AbCdEfGh')
  })

  it('allows an empty hash (all fields undefined)', () => {
    const hash: CapiUserHash = {}
    expect(Object.keys(hash)).toHaveLength(0)
  })
})

describe('CapiCustomData shape', () => {
  it('accepts value, currency, content_ids, content_type, num_items', () => {
    const cd: CapiCustomData = {
      value: 49.99,
      currency: 'USD',
      content_ids: ['sku_1', 'sku_2'],
      content_type: 'product',
      num_items: 2,
    }
    expect(cd.value).toBe(49.99)
    expect(cd.content_ids).toHaveLength(2)
  })

  it('allows an empty object (all optional)', () => {
    const cd: CapiCustomData = {}
    expect(cd.value).toBeUndefined()
  })
})

describe('AdCapiEvent shape', () => {
  it('matches the documented shape with fanout results', () => {
    const event: AdCapiEvent = {
      id: 'evt_dedup_123',
      orgId: 'org_1',
      pixelConfigId: 'pxc_abc',
      propertyId: 'prop_1',
      eventName: 'Purchase',
      eventTime: { seconds: 1716000000, nanoseconds: 0 } as any,
      userHash: { em: 'a'.repeat(64), fbp: 'fb.1.1234.5678' },
      customData: { value: 99.0, currency: 'USD' },
      actionSource: 'website',
      eventSourceUrl: 'https://example.com/checkout',
      optOut: false,
      fanout: {
        meta: { status: 'sent', metaResponseId: '1', sentAt: { seconds: 1, nanoseconds: 0 } as any },
        google: { status: 'skipped', sentAt: { seconds: 1, nanoseconds: 0 } as any },
        linkedin: { status: 'failed', error: 'Not configured', sentAt: { seconds: 1, nanoseconds: 0 } as any },
      },
      createdAt: { seconds: 1, nanoseconds: 0 } as any,
    }
    expect(event.id).toBe('evt_dedup_123')
    expect(event.fanout.meta?.status).toBe('sent')
    expect(event.fanout.google?.status).toBe('skipped')
    expect(event.fanout.linkedin?.error).toBe('Not configured')
    expect(event.fanout.tiktok).toBeUndefined()
  })

  it('actionSource accepts all 5 canonical values', () => {
    const sources: AdCapiEvent['actionSource'][] = [
      'website', 'email', 'phone_call', 'system_generated', 'other',
    ]
    expect(sources).toHaveLength(5)
  })
})
