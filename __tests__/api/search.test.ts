import { NextRequest } from 'next/server'

const mockGet = jest.fn()
const mockCollection = jest.fn()
const mockWhere = jest.fn()
const mockOrderBy = jest.fn()
const mockLimit = jest.fn()

jest.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: mockCollection, collectionGroup: mockCollection },
}))
jest.mock('@/lib/api/auth', () => ({
  withAuth: (_role: string, handler: Function) =>
    (req: any, context?: any) => handler(req, { uid: 'ai-agent', role: 'ai' }, context),
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

  it('searches across contacts, projects, tasks, invoices', async () => {
    mockGet
      .mockResolvedValueOnce({ docs: [
        {
          id: 'c1',
          data: () => ({ name: 'Alice Smith', email: 'alice@example.com', company: 'Acme', deleted: false }),
          ref: { parent: { parent: null } },
        },
      ]})
      .mockResolvedValueOnce({ docs: [
        {
          id: 'p1',
          data: () => ({ name: 'Alice project', description: 'desc', deleted: false }),
          ref: { parent: { parent: null } },
        },
      ]})
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [] })

    const { GET } = await import('@/app/api/v1/search/route')
    const req = new NextRequest('http://localhost/api/v1/search?q=alice')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.results).toBeDefined()
    expect(body.data.total).toBeGreaterThanOrEqual(1)
    const contactResult = body.data.results.find((r: any) => r.id === 'c1')
    expect(contactResult).toBeDefined()
    expect(contactResult.type).toBe('contact')
  })

  it('returns empty results when nothing matches', async () => {
    mockGet
      .mockResolvedValueOnce({ docs: [{ id: 'c1', data: () => ({ name: 'Bob', email: 'b@b.com', company: 'B', deleted: false }), ref: { parent: { parent: null } } }] })
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [] })
      .mockResolvedValueOnce({ docs: [] })

    const { GET } = await import('@/app/api/v1/search/route')
    const req = new NextRequest('http://localhost/api/v1/search?q=zzznotfound')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.results).toHaveLength(0)
    expect(body.data.total).toBe(0)
  })
})
