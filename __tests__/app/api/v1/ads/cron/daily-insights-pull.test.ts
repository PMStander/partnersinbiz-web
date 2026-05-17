// __tests__/app/api/v1/ads/cron/daily-insights-pull.test.ts
import { POST } from '@/app/api/v1/ads/cron/daily-insights-pull/route'

// ---- mocks ----------------------------------------------------------------

jest.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: jest.fn(),
  },
}))

jest.mock('@/lib/ads/connections/store', () => ({
  listConnections: jest.fn(),
  decryptAccessToken: jest.fn(),
}))

jest.mock('@/lib/ads/campaigns/store', () => ({
  listCampaigns: jest.fn(),
}))

jest.mock('@/lib/ads/adsets/store', () => ({
  listAdSets: jest.fn(),
}))

jest.mock('@/lib/ads/ads/store', () => ({
  listAds: jest.fn(),
}))

jest.mock('@/lib/ads/insights/refresh', () => ({
  refreshEntityInsights: jest.fn(),
}))

// ---- helpers --------------------------------------------------------------

const { adminDb } = jest.requireMock('@/lib/firebase/admin')
const { listConnections, decryptAccessToken } = jest.requireMock('@/lib/ads/connections/store')
const { listCampaigns } = jest.requireMock('@/lib/ads/campaigns/store')
const { listAdSets } = jest.requireMock('@/lib/ads/adsets/store')
const { listAds } = jest.requireMock('@/lib/ads/ads/store')
const { refreshEntityInsights } = jest.requireMock('@/lib/ads/insights/refresh')

function makeRequest(authHeader?: string) {
  const headers: Record<string, string> = {}
  if (authHeader !== undefined) headers['authorization'] = authHeader
  return new Request('http://localhost/api/v1/ads/cron/daily-insights-pull', {
    method: 'POST',
    headers,
  }) as unknown as import('next/server').NextRequest
}

/** Build a chainable Firestore query stub that resolves to `docs`. */
function buildQueryStub(docs: { data: () => Record<string, unknown> }[]) {
  const stub = {
    where: jest.fn(),
    get: jest.fn().mockResolvedValue({ docs }),
  }
  stub.where.mockReturnValue(stub)
  return stub
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.CRON_SECRET = 'test-secret'
})

// ---- tests ----------------------------------------------------------------

describe('POST /api/v1/ads/cron/daily-insights-pull', () => {
  it('returns 401 when authorization header is missing', async () => {
    const res = await POST(makeRequest())
    const body = await res.json()
    expect(res.status).toBe(401)
    expect(body.success).toBe(false)
    expect(body.error).toMatch(/unauthorized/i)
  })

  it('returns 401 when authorization header is wrong', async () => {
    const res = await POST(makeRequest('Bearer wrong-secret'))
    const body = await res.json()
    expect(res.status).toBe(401)
    expect(body.success).toBe(false)
  })

  it('processes active Meta connections and returns counts', async () => {
    const connDocs = [{ data: () => ({ orgId: 'org_1' }) }]
    adminDb.collection.mockReturnValue(buildQueryStub(connDocs))

    const metaConn = { id: 'conn_1', platform: 'meta' }
    listConnections.mockResolvedValue([metaConn])
    decryptAccessToken.mockReturnValue('access-tok')

    listCampaigns.mockResolvedValue([
      { id: 'cmp_1', status: 'ACTIVE', providerData: { meta: { id: 'meta_cmp_1' } } },
      { id: 'cmp_2', status: 'DRAFT', providerData: { meta: { id: 'meta_cmp_2' } } }, // should be skipped
    ])
    listAdSets.mockResolvedValue([
      { id: 'set_1', status: 'PAUSED', providerData: { meta: { id: 'meta_set_1' } } },
    ])
    listAds.mockResolvedValue([
      { id: 'ad_1', status: 'ACTIVE', providerData: { meta: { id: 'meta_ad_1' } } },
      { id: 'ad_2', status: 'ACTIVE', providerData: {} }, // no meta id — should be skipped
    ])

    refreshEntityInsights.mockResolvedValue({ rowsWritten: 5, daysProcessed: 2 })

    const res = await POST(makeRequest('Bearer test-secret'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    // 3 valid targets: cmp_1, set_1, ad_1 (cmp_2 skipped for DRAFT, ad_2 skipped for missing metaId)
    expect(body.data.processed).toBe(3)
    expect(body.data.failed).toBe(0)
    expect(body.data.errors).toHaveLength(0)

    expect(refreshEntityInsights).toHaveBeenCalledTimes(3)
    expect(refreshEntityInsights).toHaveBeenCalledWith(
      expect.objectContaining({ daysBack: 2, level: 'campaign', metaObjectId: 'meta_cmp_1' }),
    )
    expect(refreshEntityInsights).toHaveBeenCalledWith(
      expect.objectContaining({ daysBack: 2, level: 'adset', metaObjectId: 'meta_set_1' }),
    )
    expect(refreshEntityInsights).toHaveBeenCalledWith(
      expect.objectContaining({ daysBack: 2, level: 'ad', metaObjectId: 'meta_ad_1' }),
    )
  })

  it('handles per-target errors without aborting the rest', async () => {
    const connDocs = [{ data: () => ({ orgId: 'org_2' }) }]
    adminDb.collection.mockReturnValue(buildQueryStub(connDocs))

    listConnections.mockResolvedValue([{ id: 'conn_2', platform: 'meta' }])
    decryptAccessToken.mockReturnValue('tok-2')

    listCampaigns.mockResolvedValue([
      { id: 'cmp_a', status: 'ACTIVE', providerData: { meta: { id: 'm_a' } } },
      { id: 'cmp_b', status: 'ACTIVE', providerData: { meta: { id: 'm_b' } } },
    ])
    listAdSets.mockResolvedValue([])
    listAds.mockResolvedValue([])

    // First call fails, second succeeds
    refreshEntityInsights
      .mockRejectedValueOnce(new Error('Meta API timeout'))
      .mockResolvedValueOnce({ rowsWritten: 2, daysProcessed: 2 })

    const res = await POST(makeRequest('Bearer test-secret'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.processed).toBe(1)
    expect(body.data.failed).toBe(1)
    expect(body.data.errors).toHaveLength(1)
    expect(body.data.errors[0]).toContain('Meta API timeout')
  })
})
