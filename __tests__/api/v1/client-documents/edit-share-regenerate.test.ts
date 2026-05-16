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

describe('POST /api/v1/client-documents/[id]/edit-share/regenerate-code', () => {
  it('rotates the access code and preserves the token + enabled state', async () => {
    mockDocumentGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        orgId: 'org-1',
        deleted: false,
        editShareEnabled: true,
        editShareToken: 'tok-existing',
        editAccessCode: 'OLDOLD',
      }),
    })

    const { POST } = await import('@/app/api/v1/client-documents/[id]/edit-share/regenerate-code/route')
    const req = postRequest('http://localhost/api/v1/client-documents/doc-1/edit-share/regenerate-code')
    const res = await POST(req, adminUser, { params: Promise.resolve({ id: 'doc-1' }) })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.editAccessCode).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/)
    expect(body.data.editAccessCode).not.toBe('OLDOLD')

    const updateArgs = mockDocumentUpdate.mock.calls[0][0]
    expect(updateArgs.editAccessCode).toBe(body.data.editAccessCode)
    expect(updateArgs.editAccessCodeRotatedAt).toBe('server-timestamp')
    expect(updateArgs.updatedAt).toBe('server-timestamp')
    expect(updateArgs.updatedBy).toBe('admin-1')
    expect(updateArgs.updatedByType).toBe('user')
    // Token and enabled state must NOT be in the update payload
    expect(updateArgs).not.toHaveProperty('editShareToken')
    expect(updateArgs).not.toHaveProperty('editShareEnabled')
  })

  it('returns 400 when edit share is not enabled', async () => {
    mockDocumentGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ orgId: 'org-1', deleted: false, editShareEnabled: false }),
    })

    const { POST } = await import('@/app/api/v1/client-documents/[id]/edit-share/regenerate-code/route')
    const req = postRequest('http://localhost/api/v1/client-documents/doc-1/edit-share/regenerate-code')
    const res = await POST(req, adminUser, { params: Promise.resolve({ id: 'doc-1' }) })

    expect(res.status).toBe(400)
    expect(mockDocumentUpdate).not.toHaveBeenCalled()
  })

  it('returns 404 when document missing', async () => {
    mockDocumentGet.mockResolvedValueOnce({ exists: false, data: () => undefined })

    const { POST } = await import('@/app/api/v1/client-documents/[id]/edit-share/regenerate-code/route')
    const req = postRequest('http://localhost/api/v1/client-documents/missing/edit-share/regenerate-code')
    const res = await POST(req, adminUser, { params: Promise.resolve({ id: 'missing' }) })

    expect(res.status).toBe(404)
    expect(mockDocumentUpdate).not.toHaveBeenCalled()
  })

  it('blocks client role via withAuth', async () => {
    const { POST } = await import('@/app/api/v1/client-documents/[id]/edit-share/regenerate-code/route')
    const req = postRequest('http://localhost/api/v1/client-documents/doc-1/edit-share/regenerate-code')
    const res = await POST(req, clientUser, { params: Promise.resolve({ id: 'doc-1' }) })

    expect(res.status).toBe(403)
    expect(mockDocumentGet).not.toHaveBeenCalled()
  })
})

export {}
