// __tests__/lib/ads/providers/google/campaigns.test.ts
import {
  createSearchCampaign,
  updateCampaign,
  pauseCampaign,
  resumeCampaign,
  removeCampaign,
} from '@/lib/ads/providers/google/campaigns'
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
  id: 'camp-1',
  orgId: 'org-1',
  platform: 'google',
  adAccountId: '1234567890',
  name: 'Test Search Campaign',
  status: 'DRAFT',
  objective: 'TRAFFIC',
  cboEnabled: false,
  specialAdCategories: [],
  providerData: {},
  createdBy: 'uid-1',
  createdAt: null as any,
  updatedAt: null as any,
}

describe('Google Search campaign helper', () => {
  beforeEach(() => {
    ;(global.fetch as jest.Mock).mockReset()
  })

  it('createSearchCampaign creates budget then campaign in 2 calls', async () => {
    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [{ resourceName: 'customers/1234567890/campaignBudgets/100' }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [{ resourceName: 'customers/1234567890/campaigns/555' }] }),
      })

    const result = await createSearchCampaign({
      ...baseArgs,
      canonical: baseCanonical,
      dailyBudgetMajor: 25,
    })

    expect(result).toEqual({ resourceName: 'customers/1234567890/campaigns/555', id: '555' })
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  it('sends developer-token + login-customer-id headers when provided', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ resourceName: 'customers/1234567890/campaigns/1' }] }),
    })

    await pauseCampaign({
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

  it('omits login-customer-id header when not provided', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ resourceName: 'customers/1234567890/campaigns/1' }] }),
    })

    await pauseCampaign({ ...baseArgs, resourceName: 'customers/1234567890/campaigns/1' })

    const [, init] = (global.fetch as jest.Mock).mock.calls[0]
    const headers = init.headers as Record<string, string>
    expect(headers['login-customer-id']).toBeUndefined()
  })

  it('updateCampaign no-ops when no fields supplied', async () => {
    const result = await updateCampaign({ ...baseArgs, resourceName: 'customers/1/campaigns/2' })
    expect(global.fetch).not.toHaveBeenCalled()
    expect(result.id).toBe('2')
  })

  it('removeCampaign issues remove operation', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    })

    await removeCampaign({ ...baseArgs, resourceName: 'customers/1234567890/campaigns/555' })

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
      removeCampaign({ ...baseArgs, resourceName: 'customers/1/campaigns/1' }),
    ).rejects.toThrow(/campaigns mutate failed/)
  })

  it('resumeCampaign sends status=ENABLED', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    })

    await resumeCampaign({ ...baseArgs, resourceName: 'customers/1/campaigns/1' })

    const [, init] = (global.fetch as jest.Mock).mock.calls[0]
    const body = JSON.parse(init.body as string)
    expect(body.operations[0].update.status).toBe('ENABLED')
    expect(body.operations[0].updateMask).toBe('status')
  })

  it('createSearchCampaign throws when budget returns no resourceName', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),  // empty — no resourceName
    })

    await expect(
      createSearchCampaign({ ...baseArgs, canonical: baseCanonical }),
    ).rejects.toThrow('Budget creation returned no resourceName')
  })
})
