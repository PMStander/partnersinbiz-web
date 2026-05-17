import { createAdGroup, updateAdGroup, removeAdGroup } from '@/lib/ads/providers/google/adgroups'
import type { AdSet } from '@/lib/ads/types'

global.fetch = jest.fn() as any

// Minimal AdSet stub satisfying required fields
const baseCanonical: AdSet = {
  id: 'adset-001',
  orgId: 'org-001',
  campaignId: 'campaign-001',
  platform: 'google',
  name: 'Test Ad Group',
  status: 'ACTIVE',
  optimizationGoal: 'LINK_CLICKS',
  billingEvent: 'IMPRESSIONS',
  targeting: {
    geo: { countries: ['ZA'] },
    demographics: { ageMin: 18, ageMax: 65 },
  },
  placements: { feeds: true, stories: false, reels: false, marketplace: false },
  providerData: {},
  createdAt: { toDate: () => new Date() } as any,
  updatedAt: { toDate: () => new Date() } as any,
}

const baseArgs = {
  customerId: '1234567890',
  accessToken: 'test-access-token',
  developerToken: 'test-dev-token',
}

describe('Google Ads Ad Group CRUD', () => {
  beforeEach(() => {
    ;(global.fetch as jest.Mock).mockReset()
  })

  // Test 1: createAdGroup builds proper create operation with campaign + cpcBidMicros (default $0.50 → '500000')
  it('createAdGroup builds proper create operation with default $0.50 CPC → 500000 micros', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [{ resourceName: 'customers/1234567890/adGroups/9876' }],
      }),
    })

    const result = await createAdGroup({
      ...baseArgs,
      campaignResourceName: 'customers/1234567890/campaigns/5555',
      canonical: baseCanonical,
    })

    expect(result).toEqual({
      resourceName: 'customers/1234567890/adGroups/9876',
      id: '9876',
    })

    const [, init] = (global.fetch as jest.Mock).mock.calls[0]
    const body = JSON.parse(init.body)
    const createOp = body.operations[0].create
    expect(createOp.name).toBe('Test Ad Group')
    expect(createOp.campaign).toBe('customers/1234567890/campaigns/5555')
    expect(createOp.status).toBe('ENABLED')
    expect(createOp.type).toBe('SEARCH_STANDARD')
    expect(createOp.cpcBidMicros).toBe('500000')
  })

  // Test 2: createAdGroup honors defaultCpcBidMajor: 1.5 → '1500000'
  it('createAdGroup honors defaultCpcBidMajor: 1.5 → 1500000 micros', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [{ resourceName: 'customers/1234567890/adGroups/1111' }],
      }),
    })

    await createAdGroup({
      ...baseArgs,
      campaignResourceName: 'customers/1234567890/campaigns/5555',
      canonical: baseCanonical,
      defaultCpcBidMajor: 1.5,
    })

    const [, init] = (global.fetch as jest.Mock).mock.calls[0]
    const body = JSON.parse(init.body)
    expect(body.operations[0].create.cpcBidMicros).toBe('1500000')
  })

  // Test 3: Headers include developer-token + login-customer-id when set
  it('includes developer-token and login-customer-id in headers when set', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [{ resourceName: 'customers/1234567890/adGroups/2222' }],
      }),
    })

    await createAdGroup({
      ...baseArgs,
      loginCustomerId: 'mcc-999',
      campaignResourceName: 'customers/1234567890/campaigns/5555',
      canonical: baseCanonical,
    })

    const [, init] = (global.fetch as jest.Mock).mock.calls[0]
    const headers = init.headers as Record<string, string>
    expect(headers['developer-token']).toBe('test-dev-token')
    expect(headers['login-customer-id']).toBe('mcc-999')
    expect(headers.Authorization).toBe('Bearer test-access-token')
  })

  // Test 4: updateAdGroup no-ops when no fields supplied (no fetch call)
  it('updateAdGroup no-ops when no fields supplied — skips fetch', async () => {
    const result = await updateAdGroup({
      ...baseArgs,
      resourceName: 'customers/1234567890/adGroups/3333',
    })

    expect(global.fetch).not.toHaveBeenCalled()
    expect(result).toEqual({
      resourceName: 'customers/1234567890/adGroups/3333',
      id: '3333',
    })
  })

  // Test 5: updateAdGroup with name + status sends correct updateMask ('name,status')
  it('updateAdGroup with name + status sends correct updateMask', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [{ resourceName: 'customers/1234567890/adGroups/4444' }] }),
    })

    const result = await updateAdGroup({
      ...baseArgs,
      resourceName: 'customers/1234567890/adGroups/4444',
      name: 'Renamed Ad Group',
      status: 'PAUSED',
    })

    expect(result).toEqual({
      resourceName: 'customers/1234567890/adGroups/4444',
      id: '4444',
    })

    const [, init] = (global.fetch as jest.Mock).mock.calls[0]
    const body = JSON.parse(init.body)
    const updateOp = body.operations[0]
    expect(updateOp.update.name).toBe('Renamed Ad Group')
    expect(updateOp.update.status).toBe('PAUSED')
    expect(updateOp.updateMask).toBe('name,status')
  })

  // Test 6: removeAdGroup issues remove operation
  it('removeAdGroup issues remove operation with correct resourceName', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [] }),
    })

    const result = await removeAdGroup({
      ...baseArgs,
      resourceName: 'customers/1234567890/adGroups/5555',
    })

    expect(result).toEqual({
      resourceName: 'customers/1234567890/adGroups/5555',
      id: '5555',
    })

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toMatch(/adGroups:mutate/)
    const body = JSON.parse(init.body)
    expect(body.operations[0].remove).toBe('customers/1234567890/adGroups/5555')
  })

  // Test 7: Throws on non-2xx response
  it('throws on non-2xx response with error details', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => 'INVALID_ARGUMENT: campaign not found',
    })

    await expect(
      createAdGroup({
        ...baseArgs,
        campaignResourceName: 'customers/1234567890/campaigns/bad',
        canonical: baseCanonical,
      }),
    ).rejects.toThrow(/Google Ads adGroups mutate failed/)
  })
})
