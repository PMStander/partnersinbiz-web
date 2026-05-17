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

// Suppress logActivity and dispatchWebhook noise in tests
jest.mock('@/lib/activity/log', () => ({ logActivity: jest.fn().mockResolvedValue(undefined) }))
jest.mock('@/lib/webhooks/dispatch', () => ({ dispatchWebhook: jest.fn().mockResolvedValue(undefined) }))

function stageAuth(
  member: { uid: string; orgId: string; role: string; firstName?: string; lastName?: string },
  perms: Record<string, unknown> = {},
  contactsBehavior?: {
    list?: () => Promise<{ docs: Array<{ id: string; data: () => unknown }> }>
    capturedDocSet?: jest.Mock
  },
) {
  ;(adminAuth.verifySessionCookie as jest.Mock).mockResolvedValue({ uid: member.uid })
  ;(adminDb.collection as jest.Mock).mockImplementation((name: string) => {
    if (name === 'users') {
      return {
        doc: () => ({
          get: () =>
            Promise.resolve({
              exists: true,
              data: () => ({ activeOrgId: member.orgId }),
            }),
        }),
      }
    }
    if (name === 'orgMembers') {
      return {
        doc: () => ({
          get: () =>
            Promise.resolve({
              exists: true,
              data: () => member,
            }),
        }),
      }
    }
    if (name === 'organizations') {
      return {
        doc: () => ({
          get: () =>
            Promise.resolve({
              exists: true,
              data: () => ({ settings: { permissions: perms } }),
            }),
        }),
      }
    }
    if (name === 'contacts') {
      const setFn = contactsBehavior?.capturedDocSet ?? jest.fn().mockResolvedValue(undefined)
      return {
        doc: jest.fn().mockReturnValue({
          id: 'auto-id-123',
          set: setFn,
          get: jest.fn().mockResolvedValue({ exists: true, data: () => ({}) }),
        }),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        get: contactsBehavior?.list ?? (() => Promise.resolve({ docs: [] })),
      }
    }
    return { doc: () => ({ get: () => Promise.resolve({ exists: false }) }) }
  })
}

describe('GET /api/v1/crm/contacts', () => {
  it('returns list of contacts', async () => {
    const member = seedOrgMember('org-test', 'uid-viewer', { role: 'viewer' })
    stageAuth(member, {}, {
      list: () =>
        Promise.resolve({
          docs: [{ id: 'c1', data: () => ({ name: 'John', email: 'john@test.com', deleted: false }) }],
        }),
    })
    const req = callAsMember(member, 'GET', '/api/v1/crm/contacts')
    const { GET } = await import('@/app/api/v1/crm/contacts/route')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(Array.isArray(body.data)).toBe(true)
  })

  it('returns 401 without auth', async () => {
    // No cookie, no Bearer — middleware returns 401
    const req = new NextRequest('http://localhost/api/v1/crm/contacts')
    const { GET } = await import('@/app/api/v1/crm/contacts/route')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('returns contacts via Bearer (agent)', async () => {
    ;(adminDb.collection as jest.Mock).mockImplementation((name: string) => {
      if (name === 'organizations') {
        return {
          doc: () => ({
            get: () => Promise.resolve({ exists: true, data: () => ({ settings: { permissions: {} } }) }),
          }),
        }
      }
      if (name === 'contacts') {
        return {
          where: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          offset: jest.fn().mockReturnThis(),
          get: () => Promise.resolve({ docs: [] }),
        }
      }
      return { doc: () => ({ get: () => Promise.resolve({ exists: false }) }) }
    })
    const req = callAsAgent('org-agent', 'GET', '/api/v1/crm/contacts', undefined, AI_API_KEY)
    const { GET } = await import('@/app/api/v1/crm/contacts/route')
    const res = await GET(req)
    expect(res.status).toBe(200)
  })
})

describe('POST /api/v1/crm/contacts', () => {
  const validContact = {
    name: 'Jane Doe',
    email: 'jane@example.com',
    phone: '',
    company: 'Acme',
    website: '',
    source: 'manual',
    type: 'lead',
    stage: 'new',
    tags: [],
    notes: '',
    assignedTo: '',
  }

  it('creates a contact and returns 201', async () => {
    const member = seedOrgMember('org-test', 'uid-member', { role: 'member' })
    stageAuth(member)
    const req = callAsMember(member, 'POST', '/api/v1/crm/contacts', validContact)
    const { POST } = await import('@/app/api/v1/crm/contacts/route')
    const res = await POST(req)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.data.id).toBe('auto-id-123')
  })

  it('returns 400 when name is missing', async () => {
    const member = seedOrgMember('org-test', 'uid-member', { role: 'member' })
    stageAuth(member)
    const req = callAsMember(member, 'POST', '/api/v1/crm/contacts', { ...validContact, name: '' })
    const { POST } = await import('@/app/api/v1/crm/contacts/route')
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 when email is invalid', async () => {
    const member = seedOrgMember('org-test', 'uid-member', { role: 'member' })
    stageAuth(member)
    const req = callAsMember(member, 'POST', '/api/v1/crm/contacts', { ...validContact, email: 'not-email' })
    const { POST } = await import('@/app/api/v1/crm/contacts/route')
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 when stage is invalid', async () => {
    const member = seedOrgMember('org-test', 'uid-member', { role: 'member' })
    stageAuth(member)
    const req = callAsMember(member, 'POST', '/api/v1/crm/contacts', { ...validContact, stage: 'invalid' })
    const { POST } = await import('@/app/api/v1/crm/contacts/route')
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 403 when viewer tries to POST', async () => {
    const member = seedOrgMember('org-test', 'uid-viewer', { role: 'viewer' })
    stageAuth(member)
    const req = callAsMember(member, 'POST', '/api/v1/crm/contacts', validContact)
    const { POST } = await import('@/app/api/v1/crm/contacts/route')
    const res = await POST(req)
    expect(res.status).toBe(403)
  })

  it('writes createdByRef snapshot on POST (member)', async () => {
    const member = seedOrgMember('org-1', 'uid-1', { role: 'member', firstName: 'Alice', lastName: 'B' })
    const captured = jest.fn().mockResolvedValue(undefined)
    stageAuth(member, {}, { capturedDocSet: captured })
    const req = callAsMember(member, 'POST', '/api/v1/crm/contacts', {
      name: 'Test Contact', email: 'test@example.com', source: 'manual',
    })
    const { POST } = await import('@/app/api/v1/crm/contacts/route')
    const res = await POST(req)
    expect(res.status).toBeLessThan(300)
    const writtenData = captured.mock.calls[0][0]
    expect(writtenData.createdByRef.displayName).toBe('Alice B')
    expect(writtenData.createdByRef.kind).toBe('human')
    expect(writtenData.orgId).toBe('org-1')
  })
})
