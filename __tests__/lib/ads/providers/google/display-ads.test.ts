// __tests__/lib/ads/providers/google/display-ads.test.ts
import {
  createResponsiveDisplayAd,
  updateAdGroupAd,
  removeAdGroupAd,
} from '@/lib/ads/providers/google/display-ads'
import type { Ad } from '@/lib/ads/types'
import type { RdaAssets } from '@/lib/ads/providers/google/display-types'

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
  name: 'Test RDA',
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

const minRdaAssets: RdaAssets = {
  marketingImages: ['https://example.com/marketing.jpg'],
  squareMarketingImages: ['https://example.com/square.jpg'],
  headlines: ['Buy Now'],
  longHeadlines: ['The best deal you will find today'],
  descriptions: ['Get the best value today'],
  businessName: 'Acme Corp',
  finalUrls: ['https://example.com'],
}

function mockOk(resourceName: string) {
  ;(global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    json: async () => ({
      results: [{ resourceName }],
    }),
  })
}

function mockOkEmpty() {
  ;(global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    json: async () => ({ results: [] }),
  })
}

describe('RDA helper — createResponsiveDisplayAd', () => {
  beforeEach(() => {
    ;(global.fetch as jest.Mock).mockReset()
  })

  it('happy path: min counts (1 marketing image / 1 square / 1 headline / 1 long headline / 1 description / businessName / 1 url)', async () => {
    mockOk('customers/1234567890/adGroupAds/999~111')

    const result = await createResponsiveDisplayAd({
      ...baseArgs,
      adGroupResourceName: 'customers/1234567890/adGroups/999',
      canonical: baseAd,
      rdaAssets: minRdaAssets,
    })

    expect(result.resourceName).toBe('customers/1234567890/adGroupAds/999~111')
    expect(result.id).toBe('999~111')
    expect(global.fetch).toHaveBeenCalledTimes(1)

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toMatch(/adGroupAds:mutate/)
    const body = JSON.parse(init.body as string)
    const op = body.operations[0].create
    expect(op.adGroup).toBe('customers/1234567890/adGroups/999')
    expect(op.status).toBe('ENABLED')
    expect(op.ad.finalUrls).toEqual(['https://example.com'])
    const rda = op.ad.responsiveDisplayAd
    expect(rda.marketingImages).toEqual([{ asset: 'https://example.com/marketing.jpg' }])
    expect(rda.squareMarketingImages).toEqual([{ asset: 'https://example.com/square.jpg' }])
    expect(rda.headlines).toEqual([{ text: 'Buy Now' }])
    expect(rda.longHeadlines).toEqual([{ text: 'The best deal you will find today' }])
    expect(rda.descriptions).toEqual([{ text: 'Get the best value today' }])
    expect(rda.businessName).toBe('Acme Corp')
  })

  it('includes logoImages in payload when supplied', async () => {
    mockOk('customers/1234567890/adGroupAds/999~222')

    const assets: RdaAssets = {
      ...minRdaAssets,
      logoImages: ['https://example.com/logo.jpg'],
      squareLogoImages: ['https://example.com/sqlogo.jpg'],
    }

    await createResponsiveDisplayAd({
      ...baseArgs,
      adGroupResourceName: 'customers/1234567890/adGroups/999',
      canonical: baseAd,
      rdaAssets: assets,
    })

    const [, init] = (global.fetch as jest.Mock).mock.calls[0]
    const body = JSON.parse(init.body as string)
    const rda = body.operations[0].create.ad.responsiveDisplayAd
    expect(rda.logoImages).toEqual([{ asset: 'https://example.com/logo.jpg' }])
    expect(rda.squareLogoImages).toEqual([{ asset: 'https://example.com/sqlogo.jpg' }])
  })

  it('omits logoImages from payload when not supplied', async () => {
    mockOk('customers/1234567890/adGroupAds/999~333')

    await createResponsiveDisplayAd({
      ...baseArgs,
      adGroupResourceName: 'customers/1234567890/adGroups/999',
      canonical: baseAd,
      rdaAssets: minRdaAssets,
    })

    const [, init] = (global.fetch as jest.Mock).mock.calls[0]
    const body = JSON.parse(init.body as string)
    const rda = body.operations[0].create.ad.responsiveDisplayAd
    expect(rda.logoImages).toBeUndefined()
    expect(rda.squareLogoImages).toBeUndefined()
  })

  it('includes callToActionText in payload when supplied', async () => {
    mockOk('customers/1234567890/adGroupAds/999~444')

    const assets: RdaAssets = {
      ...minRdaAssets,
      callToActionText: 'LEARN_MORE',
    }

    await createResponsiveDisplayAd({
      ...baseArgs,
      adGroupResourceName: 'customers/1234567890/adGroups/999',
      canonical: baseAd,
      rdaAssets: assets,
    })

    const [, init] = (global.fetch as jest.Mock).mock.calls[0]
    const body = JSON.parse(init.body as string)
    const rda = body.operations[0].create.ad.responsiveDisplayAd
    expect(rda.callToActionText).toBe('LEARN_MORE')
  })

  it('throws (no fetch) when validateRdaAssets fails — 0 marketing images', async () => {
    const assets: RdaAssets = {
      ...minRdaAssets,
      marketingImages: [],
    }

    await expect(
      createResponsiveDisplayAd({
        ...baseArgs,
        adGroupResourceName: 'customers/1/adGroups/1',
        canonical: baseAd,
        rdaAssets: assets,
      }),
    ).rejects.toThrow('RDA requires 1-15 marketing images, got 0')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('throws (no fetch) when headlines > 5', async () => {
    const assets: RdaAssets = {
      ...minRdaAssets,
      headlines: ['A', 'B', 'C', 'D', 'E', 'F'],
    }

    await expect(
      createResponsiveDisplayAd({
        ...baseArgs,
        adGroupResourceName: 'customers/1/adGroups/1',
        canonical: baseAd,
        rdaAssets: assets,
      }),
    ).rejects.toThrow('RDA requires 1-5 headlines, got 6')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('throws on non-2xx response', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => 'Forbidden — invalid developer token',
    })

    await expect(
      createResponsiveDisplayAd({
        ...baseArgs,
        adGroupResourceName: 'customers/1/adGroups/1',
        canonical: baseAd,
        rdaAssets: minRdaAssets,
      }),
    ).rejects.toThrow('Google Ads adGroupAds mutate failed: HTTP 403')
  })
})

describe('RDA helper — removeAdGroupAd', () => {
  beforeEach(() => {
    ;(global.fetch as jest.Mock).mockReset()
  })

  it('issues a remove operation with the resource name', async () => {
    mockOkEmpty()

    const rn = 'customers/1234567890/adGroupAds/999~555'
    const result = await removeAdGroupAd({ ...baseArgs, resourceName: rn })

    expect(result.resourceName).toBe(rn)
    expect(result.id).toBe('999~555')

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toMatch(/adGroupAds:mutate/)
    const body = JSON.parse(init.body as string)
    expect(body.operations[0]).toEqual({ remove: rn })
  })
})

describe('RDA helper — headers', () => {
  beforeEach(() => {
    ;(global.fetch as jest.Mock).mockReset()
  })

  it('includes developer-token and login-customer-id when set', async () => {
    mockOkEmpty()

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
  })

  it('omits login-customer-id when not provided', async () => {
    mockOkEmpty()

    await removeAdGroupAd({
      ...baseArgs,
      resourceName: 'customers/1234567890/adGroupAds/1~1',
    })

    const [, init] = (global.fetch as jest.Mock).mock.calls[0]
    const headers = init.headers as Record<string, string>
    expect(headers['login-customer-id']).toBeUndefined()
  })
})

describe('RDA helper — updateAdGroupAd', () => {
  beforeEach(() => {
    ;(global.fetch as jest.Mock).mockReset()
  })

  it('no-ops when no fields supplied (no fetch call)', async () => {
    const rn = 'customers/1/adGroupAds/2~3'
    const result = await updateAdGroupAd({ ...baseArgs, resourceName: rn })
    expect(global.fetch).not.toHaveBeenCalled()
    expect(result.resourceName).toBe(rn)
    expect(result.id).toBe('2~3')
  })
})
