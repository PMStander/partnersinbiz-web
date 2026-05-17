// __tests__/app/api/v1/ads/insights/summary.test.ts
import { GET } from '@/app/api/v1/ads/insights/summary/route'

// ---- mocks ----------------------------------------------------------------

jest.mock('@/lib/api/auth', () => ({ withAuth: (_r: string, h: any) => h }))

jest.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: jest.fn() },
}))

// ---- helpers --------------------------------------------------------------

const { adminDb } = jest.requireMock('@/lib/firebase/admin')

/** Build a chainable Firestore query stub that resolves to `docs`. */
function buildQueryStub(docs: { data: () => Record<string, unknown> }[]) {
  const stub = {
    where: jest.fn(),
    get: jest.fn().mockResolvedValue({ docs }),
  }
  stub.where.mockReturnValue(stub)
  return stub
}

function makeRequest(orgId?: string) {
  const headers: Record<string, string> = {}
  if (orgId) headers['X-Org-Id'] = orgId
  return new Request('http://localhost/api/v1/ads/insights/summary', {
    headers,
  }) as unknown as import('next/server').NextRequest
}

beforeEach(() => jest.clearAllMocks())

// ---- tests ----------------------------------------------------------------

describe('GET /api/v1/ads/insights/summary', () => {
  it('returns 400 when X-Org-Id header is missing', async () => {
    const res = await GET(makeRequest())
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
    expect(body.error).toMatch(/X-Org-Id/i)
  })

  it('aggregates spend, impressions, and conversions across 3 windows', async () => {
    // Each sumWindow call gets its own stub (5 calls total: todaySpend, weekSpend,
    // monthSpend, weekImpressions, weekConversions).
    const todayDocs = [{ data: () => ({ value: 12.5 }) }, { data: () => ({ value: 7.5 }) }]
    const weekDocs = [{ data: () => ({ value: 100 }) }]
    const monthDocs = [{ data: () => ({ value: 400 }) }]
    const impressionsDocs = [{ data: () => ({ value: 1000 }) }, { data: () => ({ value: 500 }) }]
    const convDocs = [{ data: () => ({ value: 10 }) }]

    adminDb.collection
      .mockReturnValueOnce(buildQueryStub(todayDocs))        // todaySpend
      .mockReturnValueOnce(buildQueryStub(weekDocs))         // weekSpend
      .mockReturnValueOnce(buildQueryStub(monthDocs))        // monthSpend
      .mockReturnValueOnce(buildQueryStub(impressionsDocs))  // weekImpressions
      .mockReturnValueOnce(buildQueryStub(convDocs))         // weekConversions

    const res = await GET(makeRequest('org_1'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.today.spend).toBeCloseTo(20)
    expect(body.data.week.spend).toBe(100)
    expect(body.data.week.impressions).toBe(1500)
    expect(body.data.week.conversions).toBe(10)
    expect(body.data.month.spend).toBe(400)

    // Verify each stub was queried for the right metric
    // (5 collection() calls — one per sumWindow invocation)
    expect(adminDb.collection).toHaveBeenCalledTimes(5)
    expect(adminDb.collection).toHaveBeenCalledWith('metrics')
  })

  it('returns zeros for all windows when metrics collection is empty', async () => {
    const emptyStub = buildQueryStub([])
    adminDb.collection.mockReturnValue(emptyStub)

    const res = await GET(makeRequest('org_empty'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.today.spend).toBe(0)
    expect(body.data.week.spend).toBe(0)
    expect(body.data.week.impressions).toBe(0)
    expect(body.data.week.conversions).toBe(0)
    expect(body.data.month.spend).toBe(0)
  })
})
