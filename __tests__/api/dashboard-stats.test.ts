// __tests__/api/dashboard-stats.test.ts
import { NextRequest } from 'next/server'

const mockGet = jest.fn()
const mockCollection = jest.fn()
const mockWhere = jest.fn()
const mockOrderBy = jest.fn()
const mockLimit = jest.fn()

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
  const query = { where: mockWhere, orderBy: mockOrderBy, limit: mockLimit, get: mockGet }
  mockWhere.mockReturnValue(query)
  mockOrderBy.mockReturnValue(query)
  mockLimit.mockReturnValue(query)
  mockCollection.mockReturnValue(query)
})

describe('GET /api/v1/dashboard/stats', () => {
  it('returns aggregate stats', async () => {
    mockGet
      .mockResolvedValueOnce({ docs: [{ id: 'c1', data: () => ({}) }, { id: 'c2', data: () => ({}) }] })
      .mockResolvedValueOnce({ docs: [
        { id: 'd1', data: () => ({ stage: 'proposal', value: 5000 }) },
        { id: 'd2', data: () => ({ stage: 'won', value: 10000 }) },
      ]})
      .mockResolvedValueOnce({ docs: [{ id: 'e1' }, { id: 'e2' }, { id: 'e3' }] })
      .mockResolvedValueOnce({ docs: [{ id: 'e1' }] })
      .mockResolvedValueOnce({ docs: [{ id: 's1' }] })
      .mockResolvedValueOnce({ docs: [{ id: 'en1' }, { id: 'en2' }] })

    const { GET } = await import('@/app/api/v1/dashboard/stats/route')
    const req = new NextRequest('http://localhost/api/v1/dashboard/stats', { headers: authHeader })
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.contacts.total).toBe(2)
    expect(body.data.deals.pipelineValue).toBe(15000)
    expect(body.data.email.sent).toBe(3)
    expect(body.data.email.opened).toBe(1)
    expect(body.data.sequences.active).toBe(1)
    expect(body.data.sequences.activeEnrollments).toBe(2)
  })
})
