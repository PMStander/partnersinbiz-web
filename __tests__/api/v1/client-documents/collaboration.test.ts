import { NextRequest } from 'next/server'

const mockCollection = jest.fn()
const mockDocumentGet = jest.fn()
const mockChildGet = jest.fn()
const mockChildSet = jest.fn()
const mockChildUpdate = jest.fn()
const mockChildDoc = jest.fn()

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

const aiUser = { uid: 'ai-agent', role: 'ai' as const }
const adminUser = { uid: 'admin-1', role: 'admin' as const }
const clientUser = { uid: 'client-1', role: 'client' as const, orgId: 'org-1' }

function jsonRequest(url: string, body: unknown, method = 'POST') {
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockDocumentGet.mockReset()
  mockChildGet.mockReset()
  mockChildSet.mockResolvedValue(undefined)
  mockChildUpdate.mockResolvedValue(undefined)

  const childRef = {
    id: 'child-1',
    get: mockChildGet,
    set: mockChildSet,
    update: mockChildUpdate,
  }
  const childCollection = {
    doc: mockChildDoc.mockReturnValue(childRef),
    get: mockChildGet,
  }
  const documentRef = {
    id: 'doc-1',
    get: mockDocumentGet,
    collection: jest.fn(() => childCollection),
  }

  mockCollection.mockReturnValue({ doc: jest.fn(() => documentRef) })
})

describe('client document collaboration API', () => {
  it('creates an anchored comment on the current version', async () => {
    mockDocumentGet.mockResolvedValueOnce({
      exists: true,
      id: 'doc-1',
      data: () => ({ orgId: 'org-1', currentVersionId: 'version-1', deleted: false }),
    })

    const { POST } = await import('@/app/api/v1/client-documents/[id]/comments/route')
    const req = jsonRequest('http://localhost/api/v1/client-documents/doc-1/comments', {
      text: 'Please soften this.',
      blockId: 'summary',
      userName: 'Client One',
      anchor: { type: 'text', text: 'This is too hard sell', offset: 4 },
    })

    const res = await POST(req, clientUser, { params: Promise.resolve({ id: 'doc-1' }) })
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body.data).toEqual({ id: 'child-1' })
    expect(mockChildSet).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: 'doc-1',
        versionId: 'version-1',
        blockId: 'summary',
        text: 'Please soften this.',
        userId: 'client-1',
        userName: 'Client One',
        userRole: 'client',
        status: 'open',
        agentPickedUp: false,
      }),
    )
  })

  it('lists comments for an accessible document', async () => {
    mockDocumentGet.mockResolvedValueOnce({
      exists: true,
      id: 'doc-1',
      data: () => ({ orgId: 'org-1', currentVersionId: 'version-1', deleted: false }),
    })
    mockChildGet.mockResolvedValueOnce({
      docs: [{ id: 'comment-1', data: () => ({ text: 'Looks good', status: 'open' }) }],
    })

    const { GET } = await import('@/app/api/v1/client-documents/[id]/comments/route')
    const req = new NextRequest('http://localhost/api/v1/client-documents/doc-1/comments')
    const res = await GET(req, clientUser, { params: Promise.resolve({ id: 'doc-1' }) })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data).toEqual([{ id: 'comment-1', text: 'Looks good', status: 'open' }])
  })

  it('rejects invalid comment anchors', async () => {
    mockDocumentGet.mockResolvedValueOnce({
      exists: true,
      id: 'doc-1',
      data: () => ({ orgId: 'org-1', currentVersionId: 'version-1', deleted: false }),
    })

    const { POST } = await import('@/app/api/v1/client-documents/[id]/comments/route')
    const req = jsonRequest('http://localhost/api/v1/client-documents/doc-1/comments', {
      text: 'Please check',
      anchor: { type: 'text' },
    })

    const res = await POST(req, clientUser, { params: Promise.resolve({ id: 'doc-1' }) })

    expect(res.status).toBe(400)
    expect(mockChildSet).not.toHaveBeenCalled()
  })

  it('resolves an accessible comment', async () => {
    mockDocumentGet.mockResolvedValueOnce({
      exists: true,
      id: 'doc-1',
      data: () => ({ orgId: 'org-1', currentVersionId: 'version-1', deleted: false }),
    })
    mockChildGet.mockResolvedValueOnce({
      exists: true,
      id: 'comment-1',
      data: () => ({ status: 'open' }),
    })

    const { PATCH } = await import('@/app/api/v1/client-documents/[id]/comments/[commentId]/route')
    const req = jsonRequest(
      'http://localhost/api/v1/client-documents/doc-1/comments/comment-1',
      { status: 'resolved' },
      'PATCH',
    )
    const res = await PATCH(req, clientUser, { params: Promise.resolve({ id: 'doc-1', commentId: 'comment-1' }) })

    expect(res.status).toBe(200)
    expect(mockChildUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'resolved',
        resolvedBy: 'client-1',
        resolvedAt: 'server-timestamp',
      }),
    )
  })

  it('creates a suggestion on the current version', async () => {
    mockDocumentGet.mockResolvedValueOnce({
      exists: true,
      id: 'doc-1',
      data: () => ({ orgId: 'org-1', currentVersionId: 'version-1', deleted: false }),
    })

    const { POST } = await import('@/app/api/v1/client-documents/[id]/suggestions/route')
    const req = jsonRequest('http://localhost/api/v1/client-documents/doc-1/suggestions', {
      blockId: 'summary',
      kind: 'replace_text',
      original: 'Old line',
      proposed: 'Better line',
    })

    const res = await POST(req, clientUser, { params: Promise.resolve({ id: 'doc-1' }) })

    expect(res.status).toBe(201)
    expect(mockChildSet).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: 'doc-1',
        versionId: 'version-1',
        blockId: 'summary',
        kind: 'replace_text',
        original: 'Old line',
        proposed: 'Better line',
        status: 'open',
        createdBy: 'client-1',
      }),
    )
  })

  it('lists suggestions for an accessible document', async () => {
    mockDocumentGet.mockResolvedValueOnce({
      exists: true,
      id: 'doc-1',
      data: () => ({ orgId: 'org-1', currentVersionId: 'version-1', deleted: false }),
    })
    mockChildGet.mockResolvedValueOnce({
      docs: [{ id: 'suggestion-1', data: () => ({ status: 'open', kind: 'insert_text' }) }],
    })

    const { GET } = await import('@/app/api/v1/client-documents/[id]/suggestions/route')
    const req = new NextRequest('http://localhost/api/v1/client-documents/doc-1/suggestions')
    const res = await GET(req, clientUser, { params: Promise.resolve({ id: 'doc-1' }) })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data).toEqual([{ id: 'suggestion-1', status: 'open', kind: 'insert_text' }])
  })

  it('rejects invalid suggestion kinds', async () => {
    mockDocumentGet.mockResolvedValueOnce({
      exists: true,
      id: 'doc-1',
      data: () => ({ orgId: 'org-1', currentVersionId: 'version-1', deleted: false }),
    })

    const { POST } = await import('@/app/api/v1/client-documents/[id]/suggestions/route')
    const req = jsonRequest('http://localhost/api/v1/client-documents/doc-1/suggestions', {
      blockId: 'summary',
      kind: 'rewrite_everything',
      proposed: 'Better line',
    })

    const res = await POST(req, clientUser, { params: Promise.resolve({ id: 'doc-1' }) })

    expect(res.status).toBe(400)
    expect(mockChildSet).not.toHaveBeenCalled()
  })

  it('blocks clients from accepting suggestions', async () => {
    const { POST } = await import('@/app/api/v1/client-documents/[id]/suggestions/[suggestionId]/accept/route')
    const req = new NextRequest('http://localhost/api/v1/client-documents/doc-1/suggestions/s1/accept', {
      method: 'POST',
    })

    const res = await POST(req, clientUser, { params: Promise.resolve({ id: 'doc-1', suggestionId: 's1' }) })

    expect(res.status).toBe(403)
    expect(mockChildUpdate).not.toHaveBeenCalled()
  })

  it('allows internal users to accept suggestions', async () => {
    mockDocumentGet.mockResolvedValueOnce({
      exists: true,
      id: 'doc-1',
      data: () => ({ orgId: 'org-1', currentVersionId: 'version-1', deleted: false }),
    })
    mockChildGet.mockResolvedValueOnce({
      exists: true,
      id: 'suggestion-1',
      data: () => ({ status: 'open' }),
    })

    const { POST } = await import('@/app/api/v1/client-documents/[id]/suggestions/[suggestionId]/accept/route')
    const req = new NextRequest('http://localhost/api/v1/client-documents/doc-1/suggestions/suggestion-1/accept', {
      method: 'POST',
    })
    const res = await POST(req, adminUser, { params: Promise.resolve({ id: 'doc-1', suggestionId: 'suggestion-1' }) })

    expect(res.status).toBe(200)
    expect(mockChildUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'accepted',
        resolvedBy: 'admin-1',
        resolvedAt: 'server-timestamp',
      }),
    )
  })

  it('allows agents to reject suggestions', async () => {
    mockDocumentGet.mockResolvedValueOnce({
      exists: true,
      id: 'doc-1',
      data: () => ({ orgId: 'org-1', currentVersionId: 'version-1', deleted: false }),
    })
    mockChildGet.mockResolvedValueOnce({
      exists: true,
      id: 'suggestion-1',
      data: () => ({ status: 'open' }),
    })

    const { POST } = await import('@/app/api/v1/client-documents/[id]/suggestions/[suggestionId]/reject/route')
    const req = new NextRequest('http://localhost/api/v1/client-documents/doc-1/suggestions/suggestion-1/reject', {
      method: 'POST',
    })
    const res = await POST(req, aiUser, { params: Promise.resolve({ id: 'doc-1', suggestionId: 'suggestion-1' }) })

    expect(res.status).toBe(200)
    expect(mockChildUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'rejected',
        resolvedBy: 'ai-agent',
        resolvedAt: 'server-timestamp',
      }),
    )
  })
})

export {}
