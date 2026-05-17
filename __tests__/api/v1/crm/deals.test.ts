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

const params = { params: Promise.resolve({ id: 'deal-1' }) }

function stageAuth(
  member: { uid: string; orgId: string; role: string; firstName?: string; lastName?: string },
  perms: Record<string, unknown> = {},
  opts?: { capturedDealSet?: jest.Mock; existingDeals?: Array<{ id: string; data: Record<string, unknown> }> },
) {
  ;(adminAuth.verifySessionCookie as jest.Mock).mockResolvedValue({ uid: member.uid })
  ;(adminDb.collection as jest.Mock).mockImplementation((name: string) => {
    if (name === 'users') return { doc: () => ({ get: () => Promise.resolve({ exists: true, data: () => ({ activeOrgId: member.orgId }) }) }) }
    if (name === 'orgMembers') return { doc: () => ({ get: () => Promise.resolve({ exists: true, data: () => member }) }) }
    if (name === 'organizations') return { doc: () => ({ get: () => Promise.resolve({ exists: true, data: () => ({ settings: { permissions: perms } }) }) }) }
    if (name === 'deals') {
      const setFn = opts?.capturedDealSet ?? jest.fn().mockResolvedValue(undefined)
      const docs = (opts?.existingDeals ?? []).map(d => ({ id: d.id, data: () => d.data, ref: { id: d.id } }))
      return {
        doc: jest.fn().mockReturnValue({
          id: 'auto-deal-id',
          set: setFn,
          get: jest.fn().mockResolvedValue({ exists: true, data: () => ({}) }),
          update: jest.fn().mockResolvedValue(undefined),
        }),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        get: jest.fn().mockResolvedValue({ docs, size: docs.length }),
      }
    }
    return { doc: () => ({ get: () => Promise.resolve({ exists: false }) }) }
  })
}

describe('GET /api/v1/crm/deals', () => {
  it('returns list of deals', async () => {
    const member = seedOrgMember('org-test', 'uid-viewer', { role: 'viewer' })
    stageAuth(member, {}, {
      existingDeals: [{ id: 'd1', data: { title: 'Big deal', stage: 'discovery', deleted: false } }],
    })
    const req = callAsMember(member, 'GET', '/api/v1/crm/deals')
    const { GET } = await import('@/app/api/v1/crm/deals/route')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(Array.isArray(body.data)).toBe(true)
  })

  it('returns 401 without auth', async () => {
    const req = new NextRequest('http://localhost/api/v1/crm/deals')
    const { GET } = await import('@/app/api/v1/crm/deals/route')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('returns deals via Bearer (agent)', async () => {
    ;(adminDb.collection as jest.Mock).mockImplementation((name: string) => {
      if (name === 'organizations') {
        return {
          doc: () => ({
            get: () => Promise.resolve({ exists: true, data: () => ({ settings: { permissions: {} } }) }),
          }),
        }
      }
      if (name === 'deals') {
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
    const req = callAsAgent('org-agent', 'GET', '/api/v1/crm/deals', undefined, AI_API_KEY)
    const { GET } = await import('@/app/api/v1/crm/deals/route')
    const res = await GET(req)
    expect(res.status).toBe(200)
  })
})

describe('POST /api/v1/crm/deals', () => {
  const validDeal = {
    contactId: 'c1',
    title: 'New Website',
    value: 5000,
    currency: 'USD',
    stage: 'discovery',
    notes: '',
  }

  it('creates deal and returns 201', async () => {
    const member = seedOrgMember('org-test', 'uid-member', { role: 'member' })
    stageAuth(member)
    const req = callAsMember(member, 'POST', '/api/v1/crm/deals', validDeal)
    const { POST } = await import('@/app/api/v1/crm/deals/route')
    const res = await POST(req)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.data.id).toBe('auto-deal-id')
  })

  it('returns 400 when title is missing', async () => {
    const member = seedOrgMember('org-test', 'uid-member', { role: 'member' })
    stageAuth(member)
    const req = callAsMember(member, 'POST', '/api/v1/crm/deals', { ...validDeal, title: '' })
    const { POST } = await import('@/app/api/v1/crm/deals/route')
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 when currency is invalid', async () => {
    const member = seedOrgMember('org-test', 'uid-member', { role: 'member' })
    stageAuth(member)
    const req = callAsMember(member, 'POST', '/api/v1/crm/deals', { ...validDeal, currency: 'GBP' })
    const { POST } = await import('@/app/api/v1/crm/deals/route')
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 403 when viewer tries to POST', async () => {
    const member = seedOrgMember('org-test', 'uid-viewer', { role: 'viewer' })
    stageAuth(member)
    const req = callAsMember(member, 'POST', '/api/v1/crm/deals', validDeal)
    const { POST } = await import('@/app/api/v1/crm/deals/route')
    const res = await POST(req)
    expect(res.status).toBe(403)
  })

  it('writes createdByRef and updatedByRef on POST (member)', async () => {
    const member = seedOrgMember('org-1', 'uid-1', { role: 'member', firstName: 'Alice', lastName: 'B' })
    const captured = jest.fn().mockResolvedValue(undefined)
    stageAuth(member, {}, { capturedDealSet: captured })
    const req = callAsMember(member, 'POST', '/api/v1/crm/deals', {
      contactId: 'contact-1', title: 'Big deal', value: 1000, currency: 'ZAR', stage: 'discovery',
    })
    const { POST } = await import('@/app/api/v1/crm/deals/route')
    const res = await POST(req)
    expect(res.status).toBeLessThan(300)
    const data = captured.mock.calls[0][0]
    expect(data.createdByRef.displayName).toBe('Alice B')
    expect(data.createdByRef.kind).toBe('human')
    expect(data.updatedByRef.displayName).toBe('Alice B')
    expect(data.orgId).toBe('org-1')
  })

  it('writes ownerRef when POST body has ownerUid', async () => {
    const member = seedOrgMember('org-1', 'uid-1', { role: 'member', firstName: 'Alice', lastName: 'B' })
    const captured = jest.fn().mockResolvedValue(undefined)
    ;(adminAuth.verifySessionCookie as jest.Mock).mockResolvedValue({ uid: member.uid })
    ;(adminDb.collection as jest.Mock).mockImplementation((name: string) => {
      if (name === 'users') return { doc: () => ({ get: () => Promise.resolve({ exists: true, data: () => ({ activeOrgId: 'org-1' }) }) }) }
      if (name === 'orgMembers') return {
        doc: jest.fn().mockImplementation((id: string) => ({
          get: () => Promise.resolve(
            id === 'org-1_uid-1' ? { exists: true, data: () => member }
              : id === 'org-1_uid-2' ? { exists: true, data: () => ({ uid: 'uid-2', firstName: 'Bob', lastName: 'C' }) }
              : { exists: false },
          ),
        })),
      }
      if (name === 'organizations') return { doc: () => ({ get: () => Promise.resolve({ exists: true, data: () => ({ settings: { permissions: {} } }) }) }) }
      if (name === 'deals') return {
        doc: jest.fn().mockReturnValue({ id: 'deal-x', set: captured }),
      }
      return { doc: () => ({ get: () => Promise.resolve({ exists: false }) }) }
    })
    const req = callAsMember(member, 'POST', '/api/v1/crm/deals', {
      contactId: 'c1', title: 'D', value: 0, currency: 'ZAR', stage: 'discovery', ownerUid: 'uid-2',
    })
    const { POST } = await import('@/app/api/v1/crm/deals/route')
    const res = await POST(req)
    expect(res.status).toBeLessThan(300)
    const data = captured.mock.calls[0][0]
    expect(data.ownerUid).toBe('uid-2')
    expect(data.ownerRef.displayName).toBe('Bob C')
  })

  it('agent POST uses AGENT_PIP_REF and omits createdBy uid', async () => {
    const member = seedOrgMember('org-1', 'uid-1', { role: 'member' })
    const captured = jest.fn().mockResolvedValue(undefined)
    stageAuth(member, {}, { capturedDealSet: captured })
    const req = callAsAgent('org-1', 'POST', '/api/v1/crm/deals', {
      contactId: 'c1', title: 'Agent deal', value: 0, currency: 'ZAR', stage: 'discovery',
    })
    const { POST } = await import('@/app/api/v1/crm/deals/route')
    const res = await POST(req)
    expect(res.status).toBeLessThan(300)
    const data = captured.mock.calls[0][0]
    expect(data.createdByRef.uid).toBe('agent:pip')
    expect(data.createdByRef.kind).toBe('agent')
    expect(data.createdBy).toBeUndefined()
  })

  it('webhook deal.created payload uses explicit fields (no body spread)', async () => {
    jest.mock('@/lib/webhooks/dispatch', () => ({
      dispatchWebhook: jest.fn().mockResolvedValue(undefined),
    }))
    const member = seedOrgMember('org-1', 'uid-1', { role: 'member', firstName: 'Alice', lastName: 'B' })
    const captured = jest.fn().mockResolvedValue(undefined)
    stageAuth(member, {}, { capturedDealSet: captured })
    const { dispatchWebhook } = await import('@/lib/webhooks/dispatch')
    ;(dispatchWebhook as jest.Mock).mockClear()

    const req = callAsMember(member, 'POST', '/api/v1/crm/deals', {
      contactId: 'c1', title: 'WH test', value: 500, currency: 'USD', stage: 'discovery',
      sneaky_extra_field: 'leaked',  // should NOT appear in webhook payload
    })
    const { POST } = await import('@/app/api/v1/crm/deals/route')
    await POST(req)
    expect(dispatchWebhook).toHaveBeenCalledWith(
      'org-1',
      'deal.created',
      expect.not.objectContaining({ sneaky_extra_field: expect.anything() }),
    )
    // Also verify the keys present
    const payload = (dispatchWebhook as jest.Mock).mock.calls[0][2]
    expect(Object.keys(payload).sort()).toEqual(
      expect.arrayContaining(['id', 'title', 'value', 'stage', 'contactId', 'createdByRef'])
    )
  })
})

describe('PUT /api/v1/crm/deals/:id', () => {
  it('updates deal', async () => {
    ;(adminDb.collection as jest.Mock).mockImplementation((name: string) => {
      if (name === 'users') return { doc: () => ({ get: () => Promise.resolve({ exists: true, data: () => ({ activeOrgId: 'org-test', role: 'admin' }) }) }) }
      if (name === 'organizations') return { doc: () => ({ get: () => Promise.resolve({ exists: true, data: () => ({ settings: { permissions: {} } }) }) }) }
      if (name === 'deals') {
        return {
          doc: jest.fn().mockReturnValue({
            id: 'deal-1',
            get: jest.fn().mockResolvedValue({ exists: true, data: () => ({ title: 'Deal', deleted: false, orgId: 'org-test' }) }),
            update: jest.fn().mockResolvedValue(undefined),
          }),
        }
      }
      return { doc: () => ({ get: () => Promise.resolve({ exists: false }) }) }
    })
    const req = callAsAgent('org-test', 'PUT', '/api/v1/crm/deals/deal-1', { stage: 'proposal' }, AI_API_KEY)
    const { PUT } = await import('@/app/api/v1/crm/deals/[id]/route')
    const res = await PUT(req, params)
    expect(res.status).toBe(200)
  })
})

describe('DELETE /api/v1/crm/deals/:id', () => {
  it('soft-deletes deal', async () => {
    ;(adminDb.collection as jest.Mock).mockImplementation((name: string) => {
      if (name === 'users') return { doc: () => ({ get: () => Promise.resolve({ exists: true, data: () => ({ activeOrgId: 'org-test', role: 'admin' }) }) }) }
      if (name === 'organizations') return { doc: () => ({ get: () => Promise.resolve({ exists: true, data: () => ({ settings: { permissions: {} } }) }) }) }
      if (name === 'deals') {
        return {
          doc: jest.fn().mockReturnValue({
            id: 'deal-1',
            get: jest.fn().mockResolvedValue({ exists: true, data: () => ({ title: 'Deal', deleted: false, orgId: 'org-test' }) }),
            update: jest.fn().mockResolvedValue(undefined),
          }),
        }
      }
      return { doc: () => ({ get: () => Promise.resolve({ exists: false }) }) }
    })
    const req = callAsAgent('org-test', 'DELETE', '/api/v1/crm/deals/deal-1', undefined, AI_API_KEY)
    const { DELETE } = await import('@/app/api/v1/crm/deals/[id]/route')
    const res = await DELETE(req, params)
    expect(res.status).toBe(200)
  })
})
