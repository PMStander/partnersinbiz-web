// __tests__/api/portal-enquiries.test.ts
import { NextRequest } from 'next/server'

const mockGet = jest.fn()
const mockDoc = jest.fn()
const mockCollection = jest.fn()
const mockWhere = jest.fn()
const mockOrderBy = jest.fn()

jest.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: mockCollection },
  adminAuth: { verifySessionCookie: jest.fn().mockResolvedValue({ uid: 'user-1' }) },
}))
jest.mock('@/lib/auth/portal-middleware', () => ({
  withPortalAuth: (handler: Function) => (req: NextRequest, ...args: any[]) => handler(req, 'user-1', ...args),
}))

beforeEach(() => {
  jest.clearAllMocks()
  const query = { where: mockWhere, orderBy: mockOrderBy, get: mockGet }
  mockWhere.mockReturnValue(query)
  mockOrderBy.mockReturnValue(query)
  mockDoc.mockReturnValue({ get: mockGet })
  mockCollection.mockReturnValue({ where: mockWhere, orderBy: mockOrderBy, doc: mockDoc })
})

describe('GET /api/v1/portal/enquiries', () => {
  it('returns enquiries for authenticated user', async () => {
    mockGet.mockResolvedValue({
      docs: [{ id: 'enq1', data: () => ({ projectType: 'web', status: 'active', userId: 'user-1' }) }],
    })
    const { GET } = await import('@/app/api/v1/portal/enquiries/route')
    const req = new NextRequest('http://localhost/api/v1/portal/enquiries', {
      headers: { Cookie: '__session=valid' },
    })
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toHaveLength(1)
    expect(body.data[0].id).toBe('enq1')
  })
})

describe('GET /api/v1/portal/enquiries/[id]', () => {
  it('returns enquiry owned by user', async () => {
    mockGet.mockResolvedValue({
      exists: true,
      id: 'enq1',
      data: () => ({ projectType: 'web', status: 'active', userId: 'user-1' }),
    })
    const { GET } = await import('@/app/api/v1/portal/enquiries/[id]/route')
    const req = new NextRequest('http://localhost/api/v1/portal/enquiries/enq1', {
      headers: { Cookie: '__session=valid' },
    })
    const res = await GET(req, { params: Promise.resolve({ id: 'enq1' }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.id).toBe('enq1')
  })

  it('returns 403 for enquiry owned by another user', async () => {
    mockGet.mockResolvedValue({
      exists: true,
      id: 'enq2',
      data: () => ({ projectType: 'web', status: 'active', userId: 'other-user' }),
    })
    const { GET } = await import('@/app/api/v1/portal/enquiries/[id]/route')
    const req = new NextRequest('http://localhost/api/v1/portal/enquiries/enq2', {
      headers: { Cookie: '__session=valid' },
    })
    const res = await GET(req, { params: Promise.resolve({ id: 'enq2' }) })
    expect(res.status).toBe(403)
  })

  it('returns 404 for missing enquiry', async () => {
    mockGet.mockResolvedValue({ exists: false })
    const { GET } = await import('@/app/api/v1/portal/enquiries/[id]/route')
    const req = new NextRequest('http://localhost/api/v1/portal/enquiries/none', {
      headers: { Cookie: '__session=valid' },
    })
    const res = await GET(req, { params: Promise.resolve({ id: 'none' }) })
    expect(res.status).toBe(404)
  })
})
