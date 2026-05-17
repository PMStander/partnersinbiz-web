// __tests__/lib/ads/providers/google/shopping-ads.test.ts
import {
  createProductAd,
  updateProductAd,
  removeProductAd,
} from '@/lib/ads/providers/google/shopping-ads'
import type { Ad } from '@/lib/ads/types'

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
  name: 'Test ProductAd',
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

describe('ProductAd helper — createProductAd', () => {
  beforeEach(() => {
    ;(global.fetch as jest.Mock).mockReset()
  })

  it('happy path: body has productAd: {} + canonical adGroup + status', async () => {
    mockOk('customers/1234567890/adGroupAds/999~111')

    const result = await createProductAd({
      ...baseArgs,
      adGroupResourceName: 'customers/1234567890/adGroups/999',
      canonical: baseAd,
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
    expect(op.ad.productAd).toEqual({})
  })

  it('throws on non-2xx response', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => 'Forbidden — invalid developer token',
    })

    await expect(
      createProductAd({
        ...baseArgs,
        adGroupResourceName: 'customers/1/adGroups/1',
        canonical: baseAd,
      }),
    ).rejects.toThrow('Google Ads adGroupAds mutate failed: HTTP 403')
  })
})

describe('ProductAd helper — headers', () => {
  beforeEach(() => {
    ;(global.fetch as jest.Mock).mockReset()
  })

  it('includes developer-token and login-customer-id when set', async () => {
    mockOkEmpty()

    await removeProductAd({
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
})

describe('ProductAd helper — updateProductAd', () => {
  beforeEach(() => {
    ;(global.fetch as jest.Mock).mockReset()
  })

  it('no-ops when no fields supplied (no fetch call)', async () => {
    const rn = 'customers/1/adGroupAds/2~3'
    const result = await updateProductAd({ ...baseArgs, resourceName: rn })
    expect(global.fetch).not.toHaveBeenCalled()
    expect(result.resourceName).toBe(rn)
    expect(result.id).toBe('2~3')
  })

  it('sends correct updateMask when status is supplied', async () => {
    mockOkEmpty()

    const rn = 'customers/1234567890/adGroupAds/999~444'
    const result = await updateProductAd({
      ...baseArgs,
      resourceName: rn,
      status: 'PAUSED',
    })

    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(result.resourceName).toBe(rn)
    expect(result.id).toBe('999~444')

    const [, init] = (global.fetch as jest.Mock).mock.calls[0]
    const body = JSON.parse(init.body as string)
    const op = body.operations[0]
    expect(op.update.resourceName).toBe(rn)
    expect(op.update.status).toBe('PAUSED')
    expect(op.updateMask).toBe('status')
  })
})

describe('ProductAd helper — removeProductAd', () => {
  beforeEach(() => {
    ;(global.fetch as jest.Mock).mockReset()
  })

  it('issues a remove operation with the resource name', async () => {
    mockOkEmpty()

    const rn = 'customers/1234567890/adGroupAds/999~555'
    const result = await removeProductAd({ ...baseArgs, resourceName: rn })

    expect(result.resourceName).toBe(rn)
    expect(result.id).toBe('999~555')

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toMatch(/adGroupAds:mutate/)
    const body = JSON.parse(init.body as string)
    expect(body.operations[0]).toEqual({ remove: rn })
  })
})
