import { NextRequest } from 'next/server'

const mockCollection = jest.fn()
const mockDocumentGet = jest.fn()
const mockSubcollection = jest.fn()
const mockOrderBy = jest.fn()
const mockLimit = jest.fn()
const mockSubGet = jest.fn()

jest.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: mockCollection,
  },
}))

jest.mock('@/lib/api/auth', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withAuth: (requiredRole: 'admin' | 'client', handler: any) => async (req: NextRequest, user: any, ctx?: any) => {
    const roleOk =
      user?.role === 'ai' || user?.role === 'admin' || (requiredRole === 'client' && user?.role === 'client')
    if (!roleOk) {
      return new Response(JSON.stringify({ success: false, error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return handler(req, user, ctx)
  },
}))

const adminUser = { uid: 'admin-1', role: 'admin' as const }
const clientUser = { uid: 'client-1', role: 'client' as const, orgId: 'org-1' }

function getRequest(url: string) {
  return new NextRequest(url, { method: 'GET' })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockDocumentGet.mockReset()
  mockSubGet.mockReset()

  // Chain: docRef.collection('access_log').orderBy(...).limit(...).get()
  const limitChain = { get: mockSubGet }
  mockLimit.mockReturnValue(limitChain)
  const orderByChain = { limit: mockLimit }
  mockOrderBy.mockReturnValue(orderByChain)
  const accessLogCollection = { orderBy: mockOrderBy }
  mockSubcollection.mockReturnValue(accessLogCollection)

  const documentRef = {
    id: 'doc-1',
    get: mockDocumentGet,
    collection: mockSubcollection,
  }
  mockCollection.mockReturnValue({ doc: jest.fn(() => documentRef) })
})

describe('GET /api/v1/client-documents/[id]/access-log', () => {
  it('returns access-log entries ordered by createdAt desc with default limit 20', async () => {
    mockDocumentGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ orgId: 'org-1', deleted: false }),
    })
    mockSubGet.mockResolvedValueOnce({
      docs: [
        { id: 'log-1', data: () => ({ type: 'view', email: 'a@example.com', createdAt: 't1' }) },
        { id: 'log-2', data: () => ({ type: 'code_entered', email: 'a@example.com', createdAt: 't2' }) },
      ],
    })

    const { GET } = await import('@/app/api/v1/client-documents/[id]/access-log/route')
    const req = getRequest('http://localhost/api/v1/client-documents/doc-1/access-log')
    const res = await GET(req, adminUser, { params: Promise.resolve({ id: 'doc-1' }) })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.entries).toEqual([
      { id: 'log-1', type: 'view', email: 'a@example.com', createdAt: 't1' },
      { id: 'log-2', type: 'code_entered', email: 'a@example.com', createdAt: 't2' },
    ])
    expect(mockSubcollection).toHaveBeenCalledWith('access_log')
    expect(mockOrderBy).toHaveBeenCalledWith('createdAt', 'desc')
    expect(mockLimit).toHaveBeenCalledWith(20)
  })

  it('honours ?limit=N within the 1..100 range', async () => {
    mockDocumentGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ orgId: 'org-1', deleted: false }),
    })
    mockSubGet.mockResolvedValueOnce({ docs: [] })

    const { GET } = await import('@/app/api/v1/client-documents/[id]/access-log/route')
    const req = getRequest('http://localhost/api/v1/client-documents/doc-1/access-log?limit=50')
    const res = await GET(req, adminUser, { params: Promise.resolve({ id: 'doc-1' }) })

    expect(res.status).toBe(200)
    expect(mockLimit).toHaveBeenCalledWith(50)
  })

  it('caps ?limit above 100 down to 100', async () => {
    mockDocumentGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ orgId: 'org-1', deleted: false }),
    })
    mockSubGet.mockResolvedValueOnce({ docs: [] })

    const { GET } = await import('@/app/api/v1/client-documents/[id]/access-log/route')
    const req = getRequest('http://localhost/api/v1/client-documents/doc-1/access-log?limit=500')
    const res = await GET(req, adminUser, { params: Promise.resolve({ id: 'doc-1' }) })

    expect(res.status).toBe(200)
    expect(mockLimit).toHaveBeenCalledWith(100)
  })

  it('returns 404 when the document does not exist', async () => {
    mockDocumentGet.mockResolvedValueOnce({ exists: false, data: () => undefined })

    const { GET } = await import('@/app/api/v1/client-documents/[id]/access-log/route')
    const req = getRequest('http://localhost/api/v1/client-documents/missing/access-log')
    const res = await GET(req, adminUser, { params: Promise.resolve({ id: 'missing' }) })

    expect(res.status).toBe(404)
    expect(mockSubGet).not.toHaveBeenCalled()
  })

  it('returns 404 when the document is soft-deleted', async () => {
    mockDocumentGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ orgId: 'org-1', deleted: true }),
    })

    const { GET } = await import('@/app/api/v1/client-documents/[id]/access-log/route')
    const req = getRequest('http://localhost/api/v1/client-documents/doc-1/access-log')
    const res = await GET(req, adminUser, { params: Promise.resolve({ id: 'doc-1' }) })

    expect(res.status).toBe(404)
    expect(mockSubGet).not.toHaveBeenCalled()
  })

  it('blocks client role via withAuth (admin-only)', async () => {
    const { GET } = await import('@/app/api/v1/client-documents/[id]/access-log/route')
    const req = getRequest('http://localhost/api/v1/client-documents/doc-1/access-log')
    const res = await GET(req, clientUser, { params: Promise.resolve({ id: 'doc-1' }) })

    expect(res.status).toBe(403)
    expect(mockDocumentGet).not.toHaveBeenCalled()
  })
})

export {}
