// __tests__/lib/ads/providers/google/ads.test.ts
import {
  createResponsiveSearchAd,
  updateAdGroupAd,
  removeAdGroupAd,
} from '@/lib/ads/providers/google/ads'
import type { Ad } from '@/lib/ads/types'
import type { RsaAssets } from '@/lib/ads/providers/google/ads'

global.fetch = jest.fn() as jest.Mock

const baseArgs = {
  customerId: '1234567890',
  accessToken: 'test-access',
  developerToken: 'test-dev',
}

// Minimal Ad fixture — Timestamp fields cast to any so tests don't require Firestore
const baseAd: Ad = {
  id: 'ad-1',
  orgId: 'org-1',
  adSetId: 'adset-1',
  campaignId: 'camp-1',
  platform: 'google',
  name: 'Test RSA',
  status: 'ACTIVE',
  format: 'SINGLE_IMAGE',
  creativeIds: [],
  copy: {
    primaryText: 'Primary text',
    headline: 'Headline',
  },
  providerData: {},
  createdAt: null as any,
  updatedAt: null as any,
}

const minRsaAssets: RsaAssets = {
  headlines: [
    { text: 'Headline One' },
    { text: 'Headline Two' },
    { text: 'Headline Three' },
  ],
  descriptions: [
    { text: 'First description text here.' },
    { text: 'Second description text here.' },
  ],
  finalUrls: ['https://example.com'],
}

describe('RSA helper — createResponsiveSearchAd', () => {
  beforeEach(() => {
    ;(global.fetch as jest.Mock).mockReset()
  })

  it('succeeds with 3 headlines + 2 descriptions + 1 finalUrl', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ resourceName: 'customers/1234567890/adGroupAds/999~111' }],
      }),
    })

    const result = await createResponsiveSearchAd({
      ...baseArgs,
      adGroupResourceName: 'customers/1234567890/adGroups/999',
      canonical: baseAd,
      rsaAssets: minRsaAssets,
    })

    expect(result.resourceName).toBe('customers/1234567890/adGroupAds/999~111')
    expect(result.id).toBe('999~111')
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('throws if fewer than 3 headlines supplied', async () => {
    const assets: RsaAssets = {
      ...minRsaAssets,
      headlines: [{ text: 'Only One' }, { text: 'Only Two' }],
    }
    await expect(
      createResponsiveSearchAd({
        ...baseArgs,
        adGroupResourceName: 'customers/1/adGroups/1',
        canonical: baseAd,
        rsaAssets: assets,
      }),
    ).rejects.toThrow('RSA requires 3-15 headlines, got 2')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('throws if more than 15 headlines supplied', async () => {
    const assets: RsaAssets = {
      ...minRsaAssets,
      headlines: Array.from({ length: 16 }, (_, i) => ({ text: `Headline ${i + 1}` })),
    }
    await expect(
      createResponsiveSearchAd({
        ...baseArgs,
        adGroupResourceName: 'customers/1/adGroups/1',
        canonical: baseAd,
        rsaAssets: assets,
      }),
    ).rejects.toThrow('RSA requires 3-15 headlines, got 16')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('throws if a headline exceeds 30 chars', async () => {
    const assets: RsaAssets = {
      ...minRsaAssets,
      headlines: [
        { text: 'Short' },
        { text: 'Also Short' },
        { text: 'This headline is way too long and will fail validation' },
      ],
    }
    await expect(
      createResponsiveSearchAd({
        ...baseArgs,
        adGroupResourceName: 'customers/1/adGroups/1',
        canonical: baseAd,
        rsaAssets: assets,
      }),
    ).rejects.toThrow(/Headline exceeds 30 chars/)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('throws if a description exceeds 90 chars', async () => {
    const assets: RsaAssets = {
      ...minRsaAssets,
      descriptions: [
        { text: 'Normal description.' },
        { text: 'A'.repeat(91) },
      ],
    }
    await expect(
      createResponsiveSearchAd({
        ...baseArgs,
        adGroupResourceName: 'customers/1/adGroups/1',
        canonical: baseAd,
        rsaAssets: assets,
      }),
    ).rejects.toThrow(/Description exceeds 90 chars/)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('throws if no finalUrls supplied', async () => {
    const assets: RsaAssets = { ...minRsaAssets, finalUrls: [] }
    await expect(
      createResponsiveSearchAd({
        ...baseArgs,
        adGroupResourceName: 'customers/1/adGroups/1',
        canonical: baseAd,
        rsaAssets: assets,
      }),
    ).rejects.toThrow('RSA requires at least one finalUrl')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('passes pinned headlines through in the create body', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [{ resourceName: 'customers/1234567890/adGroupAds/999~222' }],
      }),
    })

    const assets: RsaAssets = {
      headlines: [
        { text: 'Pinned One', pinnedField: 'HEADLINE_1' },
        { text: 'Pinned Two', pinnedField: 'HEADLINE_2' },
        { text: 'Unpinned Three' },
      ],
      descriptions: [
        { text: 'Desc one.', pinnedField: 'DESCRIPTION_1' },
        { text: 'Desc two.' },
      ],
      finalUrls: ['https://example.com/pinned'],
    }

    await createResponsiveSearchAd({
      ...baseArgs,
      adGroupResourceName: 'customers/1234567890/adGroups/999',
      canonical: baseAd,
      rsaAssets: assets,
    })

    const [, init] = (global.fetch as jest.Mock).mock.calls[0]
    const body = JSON.parse(init.body as string)
    const { responsiveSearchAd } = body.operations[0].create.ad
    expect(responsiveSearchAd.headlines[0]).toEqual({ text: 'Pinned One', pinnedField: 'HEADLINE_1' })
    expect(responsiveSearchAd.headlines[1]).toEqual({ text: 'Pinned Two', pinnedField: 'HEADLINE_2' })
    expect(responsiveSearchAd.headlines[2]).toEqual({ text: 'Unpinned Three' })
    expect(responsiveSearchAd.descriptions[0]).toEqual({ text: 'Desc one.', pinnedField: 'DESCRIPTION_1' })
    expect(responsiveSearchAd.descriptions[1]).toEqual({ text: 'Desc two.' })
  })
})

describe('RSA helper — removeAdGroupAd', () => {
  beforeEach(() => {
    ;(global.fetch as jest.Mock).mockReset()
  })

  it('issues a remove operation with the resource name', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    })

    const rn = 'customers/1234567890/adGroupAds/999~333'
    await removeAdGroupAd({ ...baseArgs, resourceName: rn })

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toMatch(/adGroupAds:mutate/)
    const body = JSON.parse(init.body as string)
    expect(body.operations[0]).toEqual({ remove: rn })
  })
})

describe('RSA helper — headers', () => {
  beforeEach(() => {
    ;(global.fetch as jest.Mock).mockReset()
  })

  it('includes developer-token and optional login-customer-id in request headers', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    })

    await removeAdGroupAd({
      ...baseArgs,
      loginCustomerId: '9999999999',
      resourceName: 'customers/1234567890/adGroupAds/1~1',
    })

    const [, init] = (global.fetch as jest.Mock).mock.calls[0]
    const headers = init.headers as Record<string, string>
    expect(headers['developer-token']).toBe('test-dev')
    expect(headers['login-customer-id']).toBe('9999999999')
    expect(headers.Authorization).toBe('Bearer test-access')
    expect(headers['login-customer-id']).toBeDefined()
  })

  it('omits login-customer-id when not provided', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    })

    await removeAdGroupAd({
      ...baseArgs,
      resourceName: 'customers/1234567890/adGroupAds/1~1',
    })

    const [, init] = (global.fetch as jest.Mock).mock.calls[0]
    const headers = init.headers as Record<string, string>
    expect(headers['login-customer-id']).toBeUndefined()
  })
})

describe('RSA helper — updateAdGroupAd', () => {
  beforeEach(() => {
    ;(global.fetch as jest.Mock).mockReset()
  })

  it('no-ops when no fields supplied', async () => {
    const rn = 'customers/1/adGroupAds/2~3'
    const result = await updateAdGroupAd({ ...baseArgs, resourceName: rn })
    expect(global.fetch).not.toHaveBeenCalled()
    expect(result.resourceName).toBe(rn)
  })
})
