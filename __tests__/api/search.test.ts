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

beforeEach(() => {
  jest.clearAllMocks()
  const query = { where: mockWhere, orderBy: mockOrderBy, limit: mockLimit, get: mockGet }
  mockWhere.mockReturnValue(query)
  mockOrderBy.mockReturnValue(query)
  mockLimit.mockReturnValue(query)
  mockCollection.mockReturnValue(query)
})

describe('GET /api/v1/search', () => {
  it('returns 400 when q is missing', async () => {
    const { GET } = await import('@/app/api/v1/search/route')
    const req = new NextRequest('http://localhost/api/v1/search')
    const res = await GET(req)
    expect(res.status).toBe(400)
  })

  it('searches across contacts, deals, emails', async () => {
    mockGet
      .mockResolvedValueOnce({ docs: [
        { id: 'c1', data: () => ({ name: 'Alice Smith', email: 'alice@example.com', company: 'Acme' }) },
        { id: 'c2', data: () => ({ name: 'Bob Jones', email: 'bob@other.com', company: 'Globex' }) },
      ]})
      .mockResolvedValueOnce({ docs: [
        { id: 'd1', data: () => ({ name: 'Alice project', value: 5000 }) },
        { id: 'd2', data: () => ({ name: 'Unrelated deal', value: 1000 }) },
      ]})
      .mockResolvedValueOnce({ docs: [
        { id: 'e1', data: () => ({ subject: 'Hello Alice', to: 'alice@example.com' }) },
      ]})

    const { GET } = await import('@/app/api/v1/search/route')
    const req = new NextRequest('http://localhost/api/v1/search?q=alice')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.contacts).toHaveLength(1)
    expect(body.data.contacts[0].id).toBe('c1')
    expect(body.data.deals).toHaveLength(1)
    expect(body.data.deals[0].id).toBe('d1')
    expect(body.data.emails).toHaveLength(1)
    expect(body.data.emails[0].id).toBe('e1')
  })

  it('returns empty results when nothing matches', async () => {
    mockGet
      .mockResolvedValueOnce({ docs: [{ id: 'c1', data: () => ({ name: 'Bob', email: 'b@b.com', company: 'B' }) }] })
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [] })

    const { GET } = await import('@/app/api/v1/search/route')
    const req = new NextRequest('http://localhost/api/v1/search?q=zzznotfound')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.contacts).toHaveLength(0)
    expect(body.data.deals).toHaveLength(0)
    expect(body.data.emails).toHaveLength(0)
  })
})
