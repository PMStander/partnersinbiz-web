import { NextRequest } from 'next/server'

jest.mock('@/lib/firebase/admin', () => ({
  adminAuth: { verifySessionCookie: jest.fn() },
  adminDb: { collection: jest.fn() },
}))

import { adminAuth, adminDb } from '@/lib/firebase/admin'
import { seedOrgMember, callAsMember, callAsAgent } from '../../../helpers/crm'

const AI_API_KEY = 'test-ai-key-abc'
process.env.AI_API_KEY = AI_API_KEY
process.env.SESSION_COOKIE_NAME = '__session'

const routeCtx = (id: string) => ({ params: Promise.resolve({ id }) })

/**
 * Stage auth for segment list / create tests (no specific doc id).
 * segments mock supports both `.doc(id).get/update/delete` and
 * `.where(...).orderBy(...).get()` (for the list).
 */
function stageAuth(
  member: { uid: string; orgId: string; role: string; firstName?: string; lastName?: string },
  perms: Record<string, unknown> = {},
  opts?: {
    capturedSet?: jest.Mock
    existingSegments?: Array<{ id: string; data: Record<string, unknown> }>
    docId?: string
  },
) {
  ;(adminAuth.verifySessionCookie as jest.Mock).mockResolvedValue({ uid: member.uid })
  ;(adminDb.collection as jest.Mock).mockImplementation((name: string) => {
    if (name === 'users')
      return {
        doc: () => ({
          get: () => Promise.resolve({ exists: true, data: () => ({ activeOrgId: member.orgId }) }),
        }),
      }
    if (name === 'orgMembers')
      return {
        doc: () => ({
          get: () => Promise.resolve({ exists: true, data: () => member }),
        }),
      }
    if (name === 'organizations')
      return {
        doc: () => ({
          get: () =>
            Promise.resolve({ exists: true, data: () => ({ settings: { permissions: perms } }) }),
        }),
      }
    if (name === 'segments') {
      const setFn = opts?.capturedSet ?? jest.fn().mockResolvedValue(undefined)
      const docs = (opts?.existingSegments ?? []).map((s) => ({
        id: s.id,
        data: () => s.data,
      }))
      const autoDocId = opts?.docId ?? 'auto-seg-id'
      return {
        doc: jest.fn().mockReturnValue({
          id: autoDocId,
          set: setFn,
          get: jest.fn().mockResolvedValue({ exists: false }),
          update: jest.fn().mockResolvedValue(undefined),
        }),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ docs }),
        add: jest.fn().mockResolvedValue({ id: autoDocId }),
      }
    }
    return { doc: () => ({ get: () => Promise.resolve({ exists: false }) }) }
  })
}

/**
 * Stage auth for segment-by-id tests (GET/PUT/DELETE on a specific doc).
 */
function stageAuthWithSegment(
  member: { uid: string; orgId: string; role: string; firstName?: string; lastName?: string },
  existingSegment: { id: string; data: Record<string, unknown> } | null,
  perms: Record<string, unknown> = {},
  opts?: { capturedUpdate?: jest.Mock; capturedSet?: jest.Mock },
) {
  ;(adminAuth.verifySessionCookie as jest.Mock).mockResolvedValue({ uid: member.uid })
  ;(adminDb.collection as jest.Mock).mockImplementation((name: string) => {
    if (name === 'users')
      return {
        doc: () => ({
          get: () => Promise.resolve({ exists: true, data: () => ({ activeOrgId: member.orgId }) }),
        }),
      }
    if (name === 'orgMembers')
      return {
        doc: () => ({
          get: () => Promise.resolve({ exists: true, data: () => member }),
        }),
      }
    if (name === 'organizations')
      return {
        doc: () => ({
          get: () =>
            Promise.resolve({ exists: true, data: () => ({ settings: { permissions: perms } }) }),
        }),
      }
    if (name === 'segments') {
      const updateFn = opts?.capturedUpdate ?? jest.fn().mockResolvedValue(undefined)
      return {
        doc: jest.fn().mockReturnValue({
          id: existingSegment?.id ?? 'seg-1',
          get: jest.fn().mockResolvedValue({
            exists: existingSegment != null,
            id: existingSegment?.id ?? 'seg-1',
            data: () => existingSegment?.data ?? {},
          }),
          update: updateFn,
        }),
      }
    }
    return { doc: () => ({ get: () => Promise.resolve({ exists: false }) }) }
  })
}

// ---------------------------------------------------------------------------
// GET /api/v1/crm/segments
// ---------------------------------------------------------------------------

describe('GET /api/v1/crm/segments', () => {
  beforeEach(() => jest.clearAllMocks())

  it('viewer can list segments for own org', async () => {
    const member = seedOrgMember('org-1', 'uid-viewer', { role: 'viewer' })
    stageAuth(member, {}, {
      existingSegments: [
        { id: 's1', data: { orgId: 'org-1', name: 'Hot leads', deleted: false } },
      ],
    })
    const req = callAsMember(member, 'GET', '/api/v1/crm/segments')
    const { GET } = await import('@/app/api/v1/crm/segments/route')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(Array.isArray(body.data.segments)).toBe(true)
  })

  it('agent (Bearer) can list segments', async () => {
    ;(adminDb.collection as jest.Mock).mockImplementation((name: string) => {
      if (name === 'organizations')
        return {
          doc: () => ({
            get: () => Promise.resolve({ exists: true, data: () => ({ settings: { permissions: {} } }) }),
          }),
        }
      if (name === 'segments')
        return {
          where: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          get: jest.fn().mockResolvedValue({ docs: [] }),
        }
      return { doc: () => ({ get: () => Promise.resolve({ exists: false }) }) }
    })
    const req = callAsAgent('org-1', 'GET', '/api/v1/crm/segments', undefined, AI_API_KEY)
    const { GET } = await import('@/app/api/v1/crm/segments/route')
    const res = await GET(req)
    expect(res.status).toBe(200)
  })

  it('returns 401 without auth', async () => {
    const req = new NextRequest('http://localhost/api/v1/crm/segments')
    const { GET } = await import('@/app/api/v1/crm/segments/route')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })
})

// ---------------------------------------------------------------------------
// POST /api/v1/crm/segments
// ---------------------------------------------------------------------------

describe('POST /api/v1/crm/segments', () => {
  beforeEach(() => jest.clearAllMocks())

  it('admin can create a segment with attribution', async () => {
    const admin = seedOrgMember('org-1', 'uid-admin', { role: 'admin', firstName: 'Ada', lastName: 'Min' })
    const captured = jest.fn().mockResolvedValue(undefined)
    stageAuth(admin, {}, { capturedSet: captured, docId: 'new-seg-id' })
    const req = callAsMember(admin, 'POST', '/api/v1/crm/segments', {
      name: 'Top clients',
      description: 'High value',
      filters: {},
    })
    const { POST } = await import('@/app/api/v1/crm/segments/route')
    const res = await POST(req)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.id).toBeDefined()
  })

  it('admin POST writes createdByRef and updatedByRef', async () => {
    const admin = seedOrgMember('org-1', 'uid-admin', { role: 'admin', firstName: 'Ada', lastName: 'Min' })
    const captured = jest.fn().mockResolvedValue(undefined)
    stageAuth(admin, {}, { capturedSet: captured })
    const req = callAsMember(admin, 'POST', '/api/v1/crm/segments', {
      name: 'Segment A',
      filters: {},
    })
    const { POST } = await import('@/app/api/v1/crm/segments/route')
    const res = await POST(req)
    expect(res.status).toBe(201)
    const body = await res.json()
    // The route returns the id in the response body — check attribution via response
    expect(body.data.createdByRef.displayName).toBe('Ada Min')
    expect(body.data.createdByRef.kind).toBe('human')
    expect(body.data.updatedByRef.displayName).toBe('Ada Min')
    expect(body.data.orgId).toBe('org-1')
  })

  it('member cannot POST (403)', async () => {
    const member = seedOrgMember('org-1', 'uid-1', { role: 'member' })
    stageAuth(member)
    const req = callAsMember(member, 'POST', '/api/v1/crm/segments', { name: 'Test', filters: {} })
    const { POST } = await import('@/app/api/v1/crm/segments/route')
    const res = await POST(req)
    expect(res.status).toBe(403)
  })

  it('viewer cannot POST (403)', async () => {
    const viewer = seedOrgMember('org-1', 'uid-v', { role: 'viewer' })
    stageAuth(viewer)
    const req = callAsMember(viewer, 'POST', '/api/v1/crm/segments', { name: 'Test', filters: {} })
    const { POST } = await import('@/app/api/v1/crm/segments/route')
    const res = await POST(req)
    expect(res.status).toBe(403)
  })

  it('POST without name returns 400', async () => {
    const admin = seedOrgMember('org-1', 'uid-admin', { role: 'admin' })
    stageAuth(admin)
    const req = callAsMember(admin, 'POST', '/api/v1/crm/segments', { filters: {} })
    const { POST } = await import('@/app/api/v1/crm/segments/route')
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('POST with too many tags returns 400 (sanitizeFilters limit)', async () => {
    const admin = seedOrgMember('org-1', 'uid-admin', { role: 'admin' })
    stageAuth(admin)
    const req = callAsMember(admin, 'POST', '/api/v1/crm/segments', {
      name: 'Big segment',
      filters: { tags: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k'] }, // 11 → over limit
    })
    const { POST } = await import('@/app/api/v1/crm/segments/route')
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('agent POST writes AGENT_PIP_REF and omits createdBy uid', async () => {
    ;(adminDb.collection as jest.Mock).mockImplementation((name: string) => {
      if (name === 'organizations')
        return {
          doc: () => ({
            get: () => Promise.resolve({ exists: true, data: () => ({ settings: { permissions: {} } }) }),
          }),
        }
      if (name === 'segments') {
        const setFn = jest.fn().mockResolvedValue(undefined)
        return {
          doc: jest.fn().mockReturnValue({ id: 'agent-seg', set: setFn }),
          add: jest.fn().mockResolvedValue({ id: 'agent-seg' }),
        }
      }
      return { doc: () => ({ get: () => Promise.resolve({ exists: false }) }) }
    })
    const req = callAsAgent('org-1', 'POST', '/api/v1/crm/segments', {
      name: 'Agent segment',
      filters: {},
    }, AI_API_KEY)
    const { POST } = await import('@/app/api/v1/crm/segments/route')
    const res = await POST(req)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.data.createdByRef.uid).toBe('agent:pip')
    expect(body.data.createdByRef.kind).toBe('agent')
    expect(body.data.createdBy).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// GET /api/v1/crm/segments/[id]
// ---------------------------------------------------------------------------

describe('GET /api/v1/crm/segments/[id]', () => {
  beforeEach(() => jest.clearAllMocks())

  it('viewer can GET segment in own org', async () => {
    const viewer = seedOrgMember('org-1', 'uid-v', { role: 'viewer' })
    stageAuthWithSegment(viewer, { id: 'seg-1', data: { orgId: 'org-1', name: 'Test' } })
    const req = callAsMember(viewer, 'GET', '/api/v1/crm/segments/seg-1')
    const { GET } = await import('@/app/api/v1/crm/segments/[id]/route')
    const res = await GET(req, routeCtx('seg-1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.segment.id).toBe('seg-1')
  })

  it('viewer GET cross-org segment → 404', async () => {
    const viewer = seedOrgMember('org-1', 'uid-v', { role: 'viewer' })
    stageAuthWithSegment(viewer, { id: 'seg-x', data: { orgId: 'org-2', name: 'Other' } })
    const req = callAsMember(viewer, 'GET', '/api/v1/crm/segments/seg-x')
    const { GET } = await import('@/app/api/v1/crm/segments/[id]/route')
    const res = await GET(req, routeCtx('seg-x'))
    expect(res.status).toBe(404)
  })
})

// ---------------------------------------------------------------------------
// PUT /api/v1/crm/segments/[id]
// ---------------------------------------------------------------------------

describe('PUT /api/v1/crm/segments/[id]', () => {
  beforeEach(() => jest.clearAllMocks())

  it('admin can update segment with updatedByRef', async () => {
    const admin = seedOrgMember('org-1', 'uid-admin', { role: 'admin', firstName: 'Ada', lastName: 'Min' })
    const captured = jest.fn().mockResolvedValue(undefined)
    stageAuthWithSegment(
      admin,
      { id: 'seg-1', data: { orgId: 'org-1', name: 'Old name' } },
      {},
      { capturedUpdate: captured },
    )
    const req = callAsMember(admin, 'PUT', '/api/v1/crm/segments/seg-1', { name: 'New name' })
    const { PUT } = await import('@/app/api/v1/crm/segments/[id]/route')
    const res = await PUT(req, routeCtx('seg-1'))
    expect(res.status).toBeLessThan(300)
    const patch = captured.mock.calls[0][0]
    expect(patch.name).toBe('New name')
    expect(patch.updatedByRef.displayName).toBe('Ada Min')
    expect(patch.updatedByRef.kind).toBe('human')
  })

  it('member cannot PUT (403)', async () => {
    const member = seedOrgMember('org-1', 'uid-1', { role: 'member' })
    stageAuthWithSegment(member, { id: 'seg-1', data: { orgId: 'org-1', name: 'X' } })
    const req = callAsMember(member, 'PUT', '/api/v1/crm/segments/seg-1', { name: 'Y' })
    const { PUT } = await import('@/app/api/v1/crm/segments/[id]/route')
    const res = await PUT(req, routeCtx('seg-1'))
    expect(res.status).toBe(403)
  })

  it('admin PUT cross-org segment → 404', async () => {
    const admin = seedOrgMember('org-1', 'uid-admin', { role: 'admin' })
    stageAuthWithSegment(admin, { id: 'seg-x', data: { orgId: 'org-2', name: 'X' } })
    const req = callAsMember(admin, 'PUT', '/api/v1/crm/segments/seg-x', { name: 'Y' })
    const { PUT } = await import('@/app/api/v1/crm/segments/[id]/route')
    const res = await PUT(req, routeCtx('seg-x'))
    expect(res.status).toBe(404)
  })

  it('agent PUT uses AGENT_PIP_REF for updatedByRef, omits updatedBy', async () => {
    const admin = seedOrgMember('org-1', 'uid-admin', { role: 'admin' })
    const captured = jest.fn().mockResolvedValue(undefined)
    stageAuthWithSegment(
      admin,
      { id: 'seg-1', data: { orgId: 'org-1', name: 'Seg' } },
      {},
      { capturedUpdate: captured },
    )
    const req = callAsAgent('org-1', 'PUT', '/api/v1/crm/segments/seg-1', { name: 'Agent update' }, AI_API_KEY)
    const { PUT } = await import('@/app/api/v1/crm/segments/[id]/route')
    const res = await PUT(req, routeCtx('seg-1'))
    expect(res.status).toBeLessThan(300)
    const patch = captured.mock.calls[0][0]
    expect(patch.updatedByRef.uid).toBe('agent:pip')
    expect(patch.updatedByRef.kind).toBe('agent')
    expect(patch.updatedBy).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// DELETE /api/v1/crm/segments/[id]
// ---------------------------------------------------------------------------

describe('DELETE /api/v1/crm/segments/[id]', () => {
  beforeEach(() => jest.clearAllMocks())

  it('admin can soft-delete segment with attribution', async () => {
    const admin = seedOrgMember('org-1', 'uid-admin', { role: 'admin', firstName: 'Ada', lastName: 'Min' })
    const captured = jest.fn().mockResolvedValue(undefined)
    stageAuthWithSegment(
      admin,
      { id: 'seg-1', data: { orgId: 'org-1', name: 'To delete' } },
      {},
      { capturedUpdate: captured },
    )
    const req = callAsMember(admin, 'DELETE', '/api/v1/crm/segments/seg-1')
    const { DELETE } = await import('@/app/api/v1/crm/segments/[id]/route')
    const res = await DELETE(req, routeCtx('seg-1'))
    expect(res.status).toBeLessThan(300)
    const patch = captured.mock.calls[0][0]
    expect(patch.deleted).toBe(true)
    expect(patch.updatedByRef.displayName).toBe('Ada Min')
  })

  it('member cannot DELETE (403)', async () => {
    const member = seedOrgMember('org-1', 'uid-1', { role: 'member' })
    stageAuthWithSegment(member, { id: 'seg-1', data: { orgId: 'org-1' } })
    const req = callAsMember(member, 'DELETE', '/api/v1/crm/segments/seg-1')
    const { DELETE } = await import('@/app/api/v1/crm/segments/[id]/route')
    const res = await DELETE(req, routeCtx('seg-1'))
    expect(res.status).toBe(403)
  })

  it('admin DELETE cross-org segment → 404', async () => {
    const admin = seedOrgMember('org-1', 'uid-admin', { role: 'admin' })
    stageAuthWithSegment(admin, { id: 'seg-x', data: { orgId: 'org-2' } })
    const req = callAsMember(admin, 'DELETE', '/api/v1/crm/segments/seg-x')
    const { DELETE } = await import('@/app/api/v1/crm/segments/[id]/route')
    const res = await DELETE(req, routeCtx('seg-x'))
    expect(res.status).toBe(404)
  })
})
