// __tests__/app/api/v1/ads/insights/list.test.ts
import { GET } from '@/app/api/v1/ads/insights/route'

// ---- mocks ----------------------------------------------------------------

jest.mock('@/lib/api/auth', () => ({ withAuth: (_r: string, h: any) => h }))

jest.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: jest.fn(),
  },
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

function makeRequest(url: string, headers: Record<string, string> = {}) {
  return new Request(url, { headers }) as unknown as import('next/server').NextRequest
}

beforeEach(() => jest.clearAllMocks())

// ---- tests ----------------------------------------------------------------

describe('GET /api/v1/ads/insights', () => {
  it('returns 400 when X-Org-Id header is missing', async () => {
    const stub = buildQueryStub([])
    adminDb.collection.mockReturnValue(stub)

    const res = await GET(makeRequest('http://localhost/api/v1/ads/insights'))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
    expect(body.error).toMatch(/X-Org-Id/i)
  })

  it('filters by level when ?level is provided', async () => {
    const rows = [
      { data: () => ({ orgId: 'org_1', source: 'meta_ads', level: 'campaign', metric: 'ad_spend', value: 42 }) },
    ]
    const stub = buildQueryStub(rows)
    adminDb.collection.mockReturnValue(stub)

    const res = await GET(
      makeRequest('http://localhost/api/v1/ads/insights?level=campaign', { 'X-Org-Id': 'org_1' }),
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toHaveLength(1)
    expect(body.data[0].level).toBe('campaign')

    // Verify where was called with level filter
    expect(stub.where).toHaveBeenCalledWith('level', '==', 'campaign')
  })

  it('filters by dimensionId when ?dimensionId is provided', async () => {
    const rows = [
      { data: () => ({ orgId: 'org_1', source: 'meta_ads', dimensionId: 'cmp_abc', metric: 'clicks', value: 100 }) },
    ]
    const stub = buildQueryStub(rows)
    adminDb.collection.mockReturnValue(stub)

    const res = await GET(
      makeRequest('http://localhost/api/v1/ads/insights?dimensionId=cmp_abc', { 'X-Org-Id': 'org_1' }),
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toHaveLength(1)
    expect(body.data[0].dimensionId).toBe('cmp_abc')

    expect(stub.where).toHaveBeenCalledWith('dimensionId', '==', 'cmp_abc')
  })

  it('filters by date range when ?since and ?until are provided', async () => {
    const rows = [
      { data: () => ({ orgId: 'org_1', source: 'meta_ads', date: '2026-05-10', metric: 'impressions', value: 5000 }) },
      { data: () => ({ orgId: 'org_1', source: 'meta_ads', date: '2026-05-11', metric: 'impressions', value: 6000 }) },
    ]
    const stub = buildQueryStub(rows)
    adminDb.collection.mockReturnValue(stub)

    const res = await GET(
      makeRequest('http://localhost/api/v1/ads/insights?since=2026-05-10&until=2026-05-16', {
        'X-Org-Id': 'org_1',
      }),
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toHaveLength(2)

    expect(stub.where).toHaveBeenCalledWith('date', '>=', '2026-05-10')
    expect(stub.where).toHaveBeenCalledWith('date', '<=', '2026-05-16')
  })
})
