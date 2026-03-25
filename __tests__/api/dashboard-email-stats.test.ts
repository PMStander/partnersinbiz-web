// __tests__/api/dashboard-email-stats.test.ts
import { NextRequest } from 'next/server'

const mockGet = jest.fn()
const mockCollection = jest.fn()
const mockWhere = jest.fn()
const mockOrderBy = jest.fn()

jest.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: mockCollection },
}))
jest.mock('@/lib/auth/middleware', () => ({
  withAuth: (_role: string, handler: Function) => handler,
}))

process.env.AI_API_KEY = 'test-key'
const authHeader = { Authorization: 'Bearer test-key' }

beforeEach(() => {
  jest.clearAllMocks()
  const query = { where: mockWhere, orderBy: mockOrderBy, get: mockGet }
  mockWhere.mockReturnValue(query)
  mockOrderBy.mockReturnValue(query)
  mockCollection.mockReturnValue(query)
})

describe('GET /api/v1/dashboard/email-stats', () => {
  it('returns email funnel and contact sources', async () => {
    mockGet
      .mockResolvedValueOnce({ docs: Array(10).fill({ id: 'e', data: () => ({}) }) })
      .mockResolvedValueOnce({ docs: Array(4).fill({ id: 'e', data: () => ({}) }) })
      .mockResolvedValueOnce({ docs: Array(2).fill({ id: 'e', data: () => ({}) }) })
      .mockResolvedValueOnce({ docs: Array(1).fill({ id: 'e', data: () => ({}) }) })
      .mockResolvedValueOnce({
        docs: [
          { id: 'c1', data: () => ({ source: 'website' }) },
          { id: 'c2', data: () => ({ source: 'referral' }) },
          { id: 'c3', data: () => ({ source: 'website' }) },
          { id: 'c4', data: () => ({ source: null }) },
        ],
      })

    const { GET } = await import('@/app/api/v1/dashboard/email-stats/route')
    const req = new NextRequest('http://localhost/api/v1/dashboard/email-stats', { headers: authHeader })
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.funnel.sent).toBe(10)
    expect(body.data.funnel.opened).toBe(4)
    expect(body.data.funnel.clicked).toBe(2)
    expect(body.data.funnel.failed).toBe(1)
    expect(body.data.funnel.openRate).toBe(40)
    expect(body.data.funnel.clickRate).toBe(20)
    expect(body.data.sources).toEqual(expect.arrayContaining([
      { source: 'website', count: 2 },
      { source: 'referral', count: 1 },
    ]))
  })
})
