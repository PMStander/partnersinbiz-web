// __tests__/lib/ads/providers/google/campaigns-shopping.test.ts
import {
  createShoppingCampaign,
  updateShoppingCampaign,
  pauseShoppingCampaign,
  resumeShoppingCampaign,
  removeShoppingCampaign,
} from '@/lib/ads/providers/google/campaigns-shopping'
import type { AdCampaign } from '@/lib/ads/types'

global.fetch = jest.fn() as jest.Mock

const baseArgs = {
  customerId: '1234567890',
  accessToken: 'test-access',
  developerToken: 'test-dev',
}

// Minimal AdCampaign shape — Timestamp fields cast to any so tests don't
// require a Firestore dependency. All required interface fields are present.
const baseCanonical: AdCampaign = {
  id: 'camp-shop-1',
  orgId: 'org-1',
  platform: 'google',
  adAccountId: '1234567890',
  name: 'Test Shopping Campaign',
  status: 'DRAFT',
  objective: 'SALES',
  cboEnabled: false,
  specialAdCategories: [],
  providerData: {},
  createdBy: 'uid-1',
  createdAt: null as any,
  updatedAt: null as any,
}

const baseShoppingArgs = {
  ...baseArgs,
  canonical: baseCanonical,
  merchantId: 'merchant-123',
  feedLabel: 'US',
}

describe('Google Shopping campaign helper', () => {
  beforeEach(() => {
    ;(global.fetch as jest.Mock).mockReset()
  })

  it('createShoppingCampaign issues 2 fetch calls (budget then campaign)', async () => {
    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [{ resourceName: 'customers/1234567890/campaignBudgets/300' }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [{ resourceName: 'customers/1234567890/campaigns/888' }] }),
      })

    const result = await createShoppingCampaign({
      ...baseShoppingArgs,
      dailyBudgetMajor: 20,
    })

    expect(result).toEqual({ resourceName: 'customers/1234567890/campaigns/888', id: '888' })
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  it('campaign body has advertisingChannelType: SHOPPING', async () => {
    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [{ resourceName: 'customers/1234567890/campaignBudgets/301' }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [{ resourceName: 'customers/1234567890/campaigns/889' }] }),
      })

    await createShoppingCampaign(baseShoppingArgs)

    // Second fetch call is the campaign creation
    const [, init] = (global.fetch as jest.Mock).mock.calls[1]
    const body = JSON.parse(init.body as string)
    expect(body.operations[0].create.advertisingChannelType).toBe('SHOPPING')
  })

  it('campaign body has shoppingSetting with merchantId and feedLabel', async () => {
    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [{ resourceName: 'customers/1234567890/campaignBudgets/302' }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [{ resourceName: 'customers/1234567890/campaigns/890' }] }),
      })

    await createShoppingCampaign({
      ...baseShoppingArgs,
      merchantId: 'merchant-456',
      feedLabel: 'GB',
    })

    // Second fetch call is the campaign creation
    const [, init] = (global.fetch as jest.Mock).mock.calls[1]
    const body = JSON.parse(init.body as string)
    expect(body.operations[0].create.shoppingSetting).toEqual({
      merchantId: 'merchant-456',
      feedLabel: 'GB',
    })
  })

  it('campaign body has maximizeConversionValue: {}', async () => {
    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [{ resourceName: 'customers/1234567890/campaignBudgets/303' }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [{ resourceName: 'customers/1234567890/campaigns/891' }] }),
      })

    await createShoppingCampaign(baseShoppingArgs)

    // Second fetch call is the campaign creation
    const [, init] = (global.fetch as jest.Mock).mock.calls[1]
    const body = JSON.parse(init.body as string)
    expect(body.operations[0].create.maximizeConversionValue).toEqual({})
  })

  it('throws when merchantId is empty', async () => {
    await expect(
      createShoppingCampaign({ ...baseShoppingArgs, merchantId: '' }),
    ).rejects.toThrow('merchantId is required for Shopping campaigns')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('throws when feedLabel is empty', async () => {
    await expect(
      createShoppingCampaign({ ...baseShoppingArgs, feedLabel: '' }),
    ).rejects.toThrow('feedLabel is required for Shopping campaigns')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('headers include developer-token + login-customer-id when set', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ resourceName: 'customers/1234567890/campaigns/1' }] }),
    })

    await pauseShoppingCampaign({
      ...baseArgs,
      loginCustomerId: '9999999999',
      resourceName: 'customers/1234567890/campaigns/1',
    })

    const [, init] = (global.fetch as jest.Mock).mock.calls[0]
    const headers = init.headers as Record<string, string>
    expect(headers['developer-token']).toBe('test-dev')
    expect(headers['login-customer-id']).toBe('9999999999')
    expect(headers.Authorization).toBe('Bearer test-access')
  })

  it('removeShoppingCampaign issues {remove: resourceName} operation', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    })

    await removeShoppingCampaign({ ...baseArgs, resourceName: 'customers/1234567890/campaigns/666' })

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toMatch(/campaigns:mutate/)
    const body = JSON.parse(init.body as string)
    expect(body.operations[0]).toEqual({ remove: 'customers/1234567890/campaigns/666' })
  })

  it('throws on non-2xx response', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'INVALID_OPERATION',
    })

    await expect(
      removeShoppingCampaign({ ...baseArgs, resourceName: 'customers/1/campaigns/1' }),
    ).rejects.toThrow(/campaigns mutate failed/)
  })
})
