// __tests__/api/dashboard-activity.test.ts
import { NextRequest } from 'next/server'

const mockGet = jest.fn()
const mockCollection = jest.fn()
const mockOrderBy = jest.fn()
const mockLimit = jest.fn()
const mockWhere = jest.fn()

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
  const query = { orderBy: mockOrderBy, limit: mockLimit, where: mockWhere, get: mockGet }
  mockOrderBy.mockReturnValue(query)
  mockLimit.mockReturnValue(query)
  mockWhere.mockReturnValue(query)
  mockCollection.mockReturnValue(query)
})

describe('GET /api/v1/dashboard/activity', () => {
  it('returns recent activities', async () => {
    mockGet.mockResolvedValue({
      docs: [
        { id: 'a1', data: () => ({ type: 'email_sent', contactId: 'c1', note: 'Sent intro', createdAt: null }) },
        { id: 'a2', data: () => ({ type: 'note', contactId: 'c2', note: 'Called', createdAt: null }) },
      ],
    })
    const { GET } = await import('@/app/api/v1/dashboard/activity/route')
    const req = new NextRequest('http://localhost/api/v1/dashboard/activity', { headers: authHeader })
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toHaveLength(2)
  })

  it('respects limit query param', async () => {
    mockGet.mockResolvedValue({ docs: [] })
    const { GET } = await import('@/app/api/v1/dashboard/activity/route')
    const req = new NextRequest('http://localhost/api/v1/dashboard/activity?limit=5', { headers: authHeader })
    await GET(req)
    expect(mockLimit).toHaveBeenCalledWith(5)
  })
})
