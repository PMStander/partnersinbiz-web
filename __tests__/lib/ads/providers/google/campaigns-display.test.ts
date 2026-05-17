// __tests__/lib/ads/providers/google/campaigns-display.test.ts
import {
  createDisplayCampaign,
  updateDisplayCampaign,
  pauseDisplayCampaign,
  resumeDisplayCampaign,
  removeDisplayCampaign,
} from '@/lib/ads/providers/google/campaigns-display'
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
  id: 'camp-disp-1',
  orgId: 'org-1',
  platform: 'google',
  adAccountId: '1234567890',
  name: 'Test Display Campaign',
  status: 'DRAFT',
  objective: 'TRAFFIC',
  cboEnabled: false,
  specialAdCategories: [],
  providerData: {},
  createdBy: 'uid-1',
  createdAt: null as any,
  updatedAt: null as any,
}

describe('Google Display campaign helper', () => {
  beforeEach(() => {
    ;(global.fetch as jest.Mock).mockReset()
  })

  it('createDisplayCampaign issues 2 fetch calls (budget then campaign)', async () => {
    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [{ resourceName: 'customers/1234567890/campaignBudgets/200' }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [{ resourceName: 'customers/1234567890/campaigns/777' }] }),
      })

    const result = await createDisplayCampaign({
      ...baseArgs,
      canonical: baseCanonical,
      dailyBudgetMajor: 15,
    })

    expect(result).toEqual({ resourceName: 'customers/1234567890/campaigns/777', id: '777' })
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  it('campaign body has advertisingChannelType: DISPLAY', async () => {
    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [{ resourceName: 'customers/1234567890/campaignBudgets/201' }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [{ resourceName: 'customers/1234567890/campaigns/778' }] }),
      })

    await createDisplayCampaign({ ...baseArgs, canonical: baseCanonical })

    // Second fetch call is the campaign creation
    const [, init] = (global.fetch as jest.Mock).mock.calls[1]
    const body = JSON.parse(init.body as string)
    expect(body.operations[0].create.advertisingChannelType).toBe('DISPLAY')
  })

  it('campaign body has maximizeConversions: {}', async () => {
    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [{ resourceName: 'customers/1234567890/campaignBudgets/202' }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [{ resourceName: 'customers/1234567890/campaigns/779' }] }),
      })

    await createDisplayCampaign({ ...baseArgs, canonical: baseCanonical })

    // Second fetch call is the campaign creation
    const [, init] = (global.fetch as jest.Mock).mock.calls[1]
    const body = JSON.parse(init.body as string)
    expect(body.operations[0].create.maximizeConversions).toEqual({})
  })

  it('headers include developer-token + login-customer-id when set', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ resourceName: 'customers/1234567890/campaigns/1' }] }),
    })

    await pauseDisplayCampaign({
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

  it('headers omit login-customer-id when not set', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ resourceName: 'customers/1234567890/campaigns/1' }] }),
    })

    await pauseDisplayCampaign({ ...baseArgs, resourceName: 'customers/1234567890/campaigns/1' })

    const [, init] = (global.fetch as jest.Mock).mock.calls[0]
    const headers = init.headers as Record<string, string>
    expect(headers['login-customer-id']).toBeUndefined()
  })

  it('updateDisplayCampaign no-ops when no fields supplied', async () => {
    const result = await updateDisplayCampaign({ ...baseArgs, resourceName: 'customers/1/campaigns/2' })
    expect(global.fetch).not.toHaveBeenCalled()
    expect(result.id).toBe('2')
  })

  it('removeDisplayCampaign issues {remove: resourceName} operation', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    })

    await removeDisplayCampaign({ ...baseArgs, resourceName: 'customers/1234567890/campaigns/555' })

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toMatch(/campaigns:mutate/)
    const body = JSON.parse(init.body as string)
    expect(body.operations[0]).toEqual({ remove: 'customers/1234567890/campaigns/555' })
  })

  it('throws on non-2xx response', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'INVALID_OPERATION',
    })

    await expect(
      removeDisplayCampaign({ ...baseArgs, resourceName: 'customers/1/campaigns/1' }),
    ).rejects.toThrow(/campaigns mutate failed/)
  })
})
