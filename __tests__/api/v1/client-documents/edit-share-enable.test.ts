import { NextRequest } from 'next/server'

const mockCollection = jest.fn()
const mockDocumentGet = jest.fn()
const mockDocumentUpdate = jest.fn()

jest.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: jest.fn(() => 'server-timestamp'),
  },
}))

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
const aiUser = { uid: 'ai-agent', role: 'ai' as const }
const clientUser = { uid: 'client-1', role: 'client' as const, orgId: 'org-1' }

function postRequest(url: string) {
  return new NextRequest(url, { method: 'POST' })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockDocumentGet.mockReset()
  mockDocumentUpdate.mockReset()
  mockDocumentUpdate.mockResolvedValue(undefined)

  const documentRef = {
    id: 'doc-1',
    get: mockDocumentGet,
    update: mockDocumentUpdate,
  }
  mockCollection.mockReturnValue({ doc: jest.fn(() => documentRef) })
})

describe('POST /api/v1/client-documents/[id]/edit-share/enable', () => {
  it('generates token + code, sets enabled, and persists update', async () => {
    mockDocumentGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ orgId: 'org-1', deleted: false }),
    })

    const { POST } = await import('@/app/api/v1/client-documents/[id]/edit-share/enable/route')
    const req = postRequest('http://localhost/api/v1/client-documents/doc-1/edit-share/enable')
    const res = await POST(req, adminUser, { params: Promise.resolve({ id: 'doc-1' }) })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.editShareToken).toMatch(/^[0-9a-f]{32}$/)
    expect(body.data.editAccessCode).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/)
    expect(body.data.editShareEnabled).toBe(true)
    expect(mockDocumentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        editShareToken: body.data.editShareToken,
        editAccessCode: body.data.editAccessCode,
        editShareEnabled: true,
        editAccessCodeRotatedAt: 'server-timestamp',
        updatedAt: 'server-timestamp',
        updatedBy: 'admin-1',
        updatedByType: 'user',
      }),
    )
  })

  it('reuses an existing editShareToken when one is present', async () => {
    mockDocumentGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ orgId: 'org-1', deleted: false, editShareToken: 'existing-token' }),
    })

    const { POST } = await import('@/app/api/v1/client-documents/[id]/edit-share/enable/route')
    const req = postRequest('http://localhost/api/v1/client-documents/doc-1/edit-share/enable')
    const res = await POST(req, adminUser, { params: Promise.resolve({ id: 'doc-1' }) })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.editShareToken).toBe('existing-token')
    expect(body.data.editAccessCode).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/)
  })

  it('returns 404 when the document does not exist', async () => {
    mockDocumentGet.mockResolvedValueOnce({ exists: false, data: () => undefined })

    const { POST } = await import('@/app/api/v1/client-documents/[id]/edit-share/enable/route')
    const req = postRequest('http://localhost/api/v1/client-documents/missing/edit-share/enable')
    const res = await POST(req, adminUser, { params: Promise.resolve({ id: 'missing' }) })

    expect(res.status).toBe(404)
    expect(mockDocumentUpdate).not.toHaveBeenCalled()
  })

  it('returns 404 when the document is soft-deleted', async () => {
    mockDocumentGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ orgId: 'org-1', deleted: true }),
    })

    const { POST } = await import('@/app/api/v1/client-documents/[id]/edit-share/enable/route')
    const req = postRequest('http://localhost/api/v1/client-documents/doc-1/edit-share/enable')
    const res = await POST(req, adminUser, { params: Promise.resolve({ id: 'doc-1' }) })

    expect(res.status).toBe(404)
    expect(mockDocumentUpdate).not.toHaveBeenCalled()
  })

  it('blocks client role via withAuth', async () => {
    const { POST } = await import('@/app/api/v1/client-documents/[id]/edit-share/enable/route')
    const req = postRequest('http://localhost/api/v1/client-documents/doc-1/edit-share/enable')
    const res = await POST(req, clientUser, { params: Promise.resolve({ id: 'doc-1' }) })

    expect(res.status).toBe(403)
    expect(mockDocumentGet).not.toHaveBeenCalled()
  })

  it('records ai actor as agent in updatedByType', async () => {
    mockDocumentGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ orgId: 'org-1', deleted: false }),
    })

    const { POST } = await import('@/app/api/v1/client-documents/[id]/edit-share/enable/route')
    const req = postRequest('http://localhost/api/v1/client-documents/doc-1/edit-share/enable')
    const res = await POST(req, aiUser, { params: Promise.resolve({ id: 'doc-1' }) })

    expect(res.status).toBe(200)
    expect(mockDocumentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ updatedBy: 'ai-agent', updatedByType: 'agent' }),
    )
  })
})

export {}
