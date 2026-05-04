import { NextRequest } from 'next/server'

const mockAdd = jest.fn()
const mockGet = jest.fn()
const mockWhere = jest.fn()
const mockCollection = jest.fn()

jest.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: mockCollection },
}))
jest.mock('@/lib/api/auth', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withAuth: (_role: string, h: any) => async (req: any, ctx: any) =>
    h(req, { uid: 'u1', role: 'admin', orgId: 'o1' }, ctx),
}))
jest.mock('@/lib/api/idempotency', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withIdempotency: (h: any) => h,
}))
process.env.AI_API_KEY = 'test-key'

beforeEach(() => {
  jest.clearAllMocks()
  const query = { where: mockWhere, get: mockGet }
  mockWhere.mockReturnValue(query)
  mockCollection.mockReturnValue({ ...query, add: mockAdd })
})

describe('POST /api/v1/seo/sprints', () => {
  it('creates a sprint and seeds 42 tasks + 15 directory backlinks', async () => {
    mockAdd.mockResolvedValue({ id: 'sprint-1' })
    const { POST } = await import('@/app/api/v1/seo/sprints/route')
    const req = new NextRequest('http://localhost/api/v1/seo/sprints', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-key', 'content-type': 'application/json' },
      body: JSON.stringify({
        clientId: 'c1',
        siteUrl: 'https://example.com',
        siteName: 'Example',
      }),
    })
    const res = await POST(req)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.data.id).toBe('sprint-1')
    // 1 sprint + 42 tasks + 15 backlinks = 58 add calls
    expect(mockAdd).toHaveBeenCalledTimes(58)
  })

  it('returns 400 without required fields', async () => {
    const { POST } = await import('@/app/api/v1/seo/sprints/route')
    const req = new NextRequest('http://localhost/api/v1/seo/sprints', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-key', 'content-type': 'application/json' },
      body: JSON.stringify({ clientId: 'c1' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })
})

describe('GET /api/v1/seo/sprints', () => {
  it('lists sprints and filters out soft-deleted', async () => {
    mockGet.mockResolvedValueOnce({
      docs: [
        { id: 's1', data: () => ({ orgId: 'o1', siteName: 'Example', deleted: false, status: 'active' }) },
        { id: 's2', data: () => ({ orgId: 'o1', siteName: 'Gone', deleted: true }) },
      ],
    })
    const { GET } = await import('@/app/api/v1/seo/sprints/route')
    const req = new NextRequest('http://localhost/api/v1/seo/sprints', {
      headers: { Authorization: 'Bearer test-key' },
    })
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toHaveLength(1)
    expect(body.data[0].id).toBe('s1')
  })
})
