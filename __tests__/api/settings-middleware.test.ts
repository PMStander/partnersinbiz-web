// __tests__/api/settings-middleware.test.ts
import { NextRequest } from 'next/server'

const mockVerifySessionCookie = jest.fn()
const mockGet = jest.fn()
const mockDoc = jest.fn()
const mockCollection = jest.fn()

jest.mock('@/lib/firebase/admin', () => ({
  adminAuth: { verifySessionCookie: mockVerifySessionCookie },
  adminDb: { collection: mockCollection },
}))

mockCollection.mockReturnValue({ doc: mockDoc })
mockDoc.mockReturnValue({ get: mockGet })

import { withPortalAuthAndRole } from '@/lib/auth/portal-middleware'

function makeReq() {
  return new NextRequest('http://localhost/test', {
    headers: { Cookie: '__session=valid-cookie' },
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockVerifySessionCookie.mockResolvedValue({ uid: 'uid-1' })
  mockCollection.mockReturnValue({ doc: mockDoc })
})

describe('withPortalAuthAndRole', () => {
  it('returns 401 when no session cookie', async () => {
    const handler = withPortalAuthAndRole('admin', async () => new Response('ok', { status: 200 }))
    const req = new NextRequest('http://localhost/test')
    const res = await handler(req)
    expect(res.status).toBe(401)
  })

  it('returns 403 when user has no workspace membership', async () => {
    // users doc
    mockGet
      .mockResolvedValueOnce({ exists: true, data: () => ({ activeOrgId: 'org-1' }) })
      // orgMembers doc — not found
      .mockResolvedValueOnce({ exists: false })
      // organizations doc — no members array
      .mockResolvedValueOnce({ exists: true, data: () => ({ members: [] }) })

    const handler = withPortalAuthAndRole('member', async () => new Response('ok', { status: 200 }))
    const res = await handler(makeReq())
    expect(res.status).toBe(403)
  })

  it('returns 403 when role is too low', async () => {
    mockGet
      .mockResolvedValueOnce({ exists: true, data: () => ({ activeOrgId: 'org-1' }) })
      .mockResolvedValueOnce({ exists: true, data: () => ({ role: 'viewer' }) })

    const handler = withPortalAuthAndRole('admin', async () => new Response('ok', { status: 200 }))
    const res = await handler(makeReq())
    expect(res.status).toBe(403)
  })

  it('calls handler with uid, orgId, role when role meets minimum', async () => {
    mockGet
      .mockResolvedValueOnce({ exists: true, data: () => ({ activeOrgId: 'org-1' }) })
      .mockResolvedValueOnce({ exists: true, data: () => ({ role: 'admin' }) })

    let captured: { uid: string; orgId: string; role: string } | null = null
    const handler = withPortalAuthAndRole('member', async (_req, uid, orgId, role) => {
      captured = { uid, orgId, role }
      return new Response('ok', { status: 200 })
    })
    const res = await handler(makeReq())
    expect(res.status).toBe(200)
    expect(captured).toEqual({ uid: 'uid-1', orgId: 'org-1', role: 'admin' })
  })

  it('falls back to organizations/members[] when orgMembers doc is missing', async () => {
    mockGet
      .mockResolvedValueOnce({ exists: true, data: () => ({ activeOrgId: 'org-1' }) })
      .mockResolvedValueOnce({ exists: false }) // no orgMembers doc
      .mockResolvedValueOnce({ exists: true, data: () => ({ members: [{ userId: 'uid-1', role: 'owner' }] }) })

    let capturedRole = ''
    const handler = withPortalAuthAndRole('admin', async (_req, _uid, _orgId, role) => {
      capturedRole = role
      return new Response('ok', { status: 200 })
    })
    const res = await handler(makeReq())
    expect(res.status).toBe(200)
    expect(capturedRole).toBe('owner')
  })
})
