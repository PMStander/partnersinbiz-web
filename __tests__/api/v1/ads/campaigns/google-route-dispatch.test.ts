// __tests__/api/v1/ads/campaigns/google-route-dispatch.test.ts
// Verifies POST /api/v1/ads/campaigns branches Search vs Display based on
// body.googleAds.campaignType. Additive — Sub-3a Phase 3 Batch 3.

import { POST } from '@/app/api/v1/ads/campaigns/route'

// ─── Auth bypass ────────────────────────────────────────────────────────────
jest.mock('@/lib/api/auth', () => ({ withAuth: (_r: string, h: any) => h }))

// ─── requireMetaContext — always returns a valid meta context ────────────────
jest.mock('@/lib/ads/api-helpers', () => ({
  requireMetaContext: jest.fn(),
}))

// ─── Campaign store ──────────────────────────────────────────────────────────
jest.mock('@/lib/ads/campaigns/store', () => ({
  createCampaign: jest.fn(),
  updateCampaign: jest.fn(),
}))

// ─── Google connection helpers ───────────────────────────────────────────────
jest.mock('@/lib/ads/connections/store', () => ({
  getConnection: jest.fn(),
  decryptAccessToken: jest.fn(),
}))
jest.mock('@/lib/integrations/google_ads/oauth', () => ({
  readDeveloperToken: jest.fn(),
}))

// ─── Google campaign providers ───────────────────────────────────────────────
jest.mock('@/lib/ads/providers/google/campaigns', () => ({
  createSearchCampaign: jest.fn(),
}))
jest.mock('@/lib/ads/providers/google/campaigns-display', () => ({
  createDisplayCampaign: jest.fn(),
}))

// ─── Imports after mocks ─────────────────────────────────────────────────────
const { requireMetaContext } = jest.requireMock('@/lib/ads/api-helpers')
const { createCampaign, updateCampaign } = jest.requireMock('@/lib/ads/campaigns/store')
const { getConnection, decryptAccessToken } = jest.requireMock('@/lib/ads/connections/store')
const { readDeveloperToken } = jest.requireMock('@/lib/integrations/google_ads/oauth')
const { createSearchCampaign } = jest.requireMock('@/lib/ads/providers/google/campaigns')
const { createDisplayCampaign } = jest.requireMock('@/lib/ads/providers/google/campaigns-display')

// ─── Shared stubs ────────────────────────────────────────────────────────────
const fakeCtx = {
  orgId: 'org-001',
  adAccountId: 'act_123',
  accessToken: 'ctx-token',
  connection: {},
}
const fakeCampaign = {
  id: 'camp-001',
  name: 'Test Campaign',
  objective: 'BRAND_AWARENESS',
  status: 'DRAFT',
  providerData: {},
  orgId: 'org-001',
}
const fakeConn = {
  meta: { google: { loginCustomerId: '1234567890' } },
  accessTokenEnc: {},
}
const fakeResult = { resourceName: 'customers/1234567890/campaigns/999', id: '999' }

function makeReq(body: object) {
  return new Request('http://x/api/v1/ads/campaigns', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Org-Id': 'org-001' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  requireMetaContext.mockResolvedValue(fakeCtx)
  createCampaign.mockResolvedValue(fakeCampaign)
  updateCampaign.mockResolvedValue(undefined)
  getConnection.mockResolvedValue(fakeConn)
  decryptAccessToken.mockReturnValue('access-token')
  readDeveloperToken.mockReturnValue('dev-token')
  createSearchCampaign.mockResolvedValue(fakeResult)
  createDisplayCampaign.mockResolvedValue(fakeResult)
})

describe('POST /api/v1/ads/campaigns — Google dispatch branching', () => {
  // Test 1: DISPLAY campaignType → createDisplayCampaign called, not Search
  it('calls createDisplayCampaign when googleAds.campaignType is DISPLAY', async () => {
    const res = await POST(
      makeReq({
        platform: 'google',
        input: { name: 'Display Campaign', objective: 'BRAND_AWARENESS' },
        googleAds: { campaignType: 'DISPLAY', dailyBudgetMajor: 20 },
      }) as any,
      { uid: 'user-001' } as any,
    )

    expect(res.status).toBe(201)
    expect(createDisplayCampaign).toHaveBeenCalledTimes(1)
    expect(createSearchCampaign).not.toHaveBeenCalled()

    const call = createDisplayCampaign.mock.calls[0][0]
    expect(call.customerId).toBe('1234567890')
    expect(call.dailyBudgetMajor).toBe(20)
    expect(call.canonical).toEqual(fakeCampaign)
  })

  // Test 2: No campaignType → createSearchCampaign called (default)
  it('calls createSearchCampaign when googleAds.campaignType is absent (default)', async () => {
    const res = await POST(
      makeReq({
        platform: 'google',
        input: { name: 'Search Campaign', objective: 'LINK_CLICKS' },
        googleAds: { dailyBudgetMajor: 5 },
      }) as any,
      { uid: 'user-001' } as any,
    )

    expect(res.status).toBe(201)
    expect(createSearchCampaign).toHaveBeenCalledTimes(1)
    expect(createDisplayCampaign).not.toHaveBeenCalled()
  })

  // Test 3: campaignType = 'SEARCH' explicitly → createSearchCampaign called
  it('calls createSearchCampaign when googleAds.campaignType is SEARCH explicitly', async () => {
    const res = await POST(
      makeReq({
        platform: 'google',
        input: { name: 'Explicit Search Campaign', objective: 'LINK_CLICKS' },
        googleAds: { campaignType: 'SEARCH' },
      }) as any,
      { uid: 'user-001' } as any,
    )

    expect(res.status).toBe(201)
    expect(createSearchCampaign).toHaveBeenCalledTimes(1)
    expect(createDisplayCampaign).not.toHaveBeenCalled()
  })
})
