import { NextRequest } from 'next/server'

type MockUser = { uid: string; role: 'admin'; orgId: string }
type MockHandler = (req: NextRequest, user: MockUser, ctx?: unknown) => Promise<Response>
type TrendPoint = { label: string; value: number }
type SocialStatsResponse = {
  data: {
    last30Days: number
    last30DaysSeries: TrendPoint[]
  }
}

const mockCollection = jest.fn()
const mockWhere = jest.fn()
const mockGet = jest.fn()

jest.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: mockCollection },
}))

jest.mock('@/lib/api/auth', () => ({
  withAuth: (_role: string, handler: MockHandler) => async (req: NextRequest, ctx?: unknown) =>
    handler(req, { uid: 'admin-1', role: 'admin', orgId: 'platform' }, ctx),
}))

beforeEach(() => {
  jest.clearAllMocks()
  const query = { where: mockWhere, get: mockGet }
  mockWhere.mockReturnValue(query)
  mockCollection.mockReturnValue(query)
})

describe('GET /api/v1/social/stats', () => {
  it('returns an all-zero publishing series when the org has no posts', async () => {
    mockGet.mockResolvedValue({ docs: [] })

    const { GET } = await import('@/app/api/v1/social/stats/route')
    const req = new NextRequest('http://localhost/api/v1/social/stats?orgId=org-covalonic')
    const res = await GET(req)

    expect(res.status).toBe(200)
    const body = await res.json() as SocialStatsResponse
    expect(body.data.last30Days).toBe(0)
    expect(body.data.last30DaysSeries).toHaveLength(7)
    expect(body.data.last30DaysSeries.every((point) => point.value === 0)).toBe(true)
  })
})
