import { GET } from '@/app/api/v1/crm/activities/route'
import { NextRequest } from 'next/server'

jest.mock('@/lib/firebase/admin', () => ({
  adminAuth: { verifyIdToken: jest.fn(), verifySessionCookie: jest.fn() },
  adminDb: { collection: jest.fn() },
}))

import { adminDb, adminAuth } from '@/lib/firebase/admin'
process.env.AI_API_KEY = 'test-key'

function adminReq(search = '') {
  return new NextRequest(`http://localhost/api/v1/crm/activities${search}`, {
    method: 'GET',
    headers: { authorization: 'Bearer test-key' },
  })
}

function clientReq(search = '') {
  return new NextRequest(`http://localhost/api/v1/crm/activities${search}`, {
    method: 'GET',
    headers: { cookie: '__session=fake-session-cookie' },
  })
}

interface ActivityFixture {
  id: string
  orgId: string
  contactId: string
  type: string
  summary: string
}

function buildQueryChain(activities: ActivityFixture[]) {
  const docs = activities.map((a) => ({ id: a.id, data: () => a }))
  const chain: Record<string, jest.Mock> = {}
  chain.where = jest.fn().mockReturnValue(chain)
  chain.orderBy = jest.fn().mockReturnValue(chain)
  chain.limit = jest.fn().mockReturnValue(chain)
  chain.offset = jest.fn().mockReturnValue(chain)
  chain.get = jest.fn().mockResolvedValue({ docs })
  return chain
}

describe('GET /api/v1/crm/activities', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns 400 when client lacks contactId/orgId binding (no orgId on user)', async () => {
    ;(adminAuth.verifySessionCookie as jest.Mock).mockResolvedValueOnce({ uid: 'u1' })
    const userDocGet = jest.fn().mockResolvedValue({
      exists: true,
      data: () => ({ role: 'client' }), // no orgId
    })
    ;(adminDb.collection as jest.Mock).mockImplementation((name: string) => {
      if (name === 'users') {
        return { doc: jest.fn().mockReturnValue({ get: userDocGet }) }
      }
      return buildQueryChain([])
    })
    const res = await GET(clientReq(''))
    expect(res.status).toBe(403)
  })

  it('admin without contactId or orgId returns 400', async () => {
    ;(adminDb.collection as jest.Mock).mockReturnValue(buildQueryChain([]))
    const res = await GET(adminReq(''))
    expect(res.status).toBe(400)
  })

  it('with contactId, returns activities for that contact scoped to org', async () => {
    const acts: ActivityFixture[] = [
      { id: 'a1', orgId: 'org-A', contactId: 'c1', type: 'note', summary: 'note 1' },
      { id: 'a2', orgId: 'org-A', contactId: 'c1', type: 'email_sent', summary: 'email' },
    ]
    const chain = buildQueryChain(acts)
    const contactDoc = jest.fn().mockResolvedValue({
      exists: true,
      data: () => ({ orgId: 'org-A' }),
    })
    ;(adminDb.collection as jest.Mock).mockImplementation((name: string) => {
      if (name === 'contacts') {
        return { doc: jest.fn().mockReturnValue({ get: contactDoc }) }
      }
      return chain
    })
    const res = await GET(adminReq('?contactId=c1&orgId=org-A'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toHaveLength(2)
    expect(chain.where).toHaveBeenCalledWith('orgId', '==', 'org-A')
    expect(chain.where).toHaveBeenCalledWith('contactId', '==', 'c1')
  })

  it('with orgId only, returns all org activities', async () => {
    const acts: ActivityFixture[] = [
      { id: 'a1', orgId: 'org-A', contactId: 'c1', type: 'note', summary: 'n1' },
      { id: 'a2', orgId: 'org-A', contactId: 'c2', type: 'note', summary: 'n2' },
      { id: 'a3', orgId: 'org-A', contactId: 'c3', type: 'note', summary: 'n3' },
    ]
    const chain = buildQueryChain(acts)
    ;(adminDb.collection as jest.Mock).mockReturnValue(chain)
    const res = await GET(adminReq('?orgId=org-A'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toHaveLength(3)
  })

  it('client cross-org access denied (contactId belongs to another org)', async () => {
    ;(adminAuth.verifySessionCookie as jest.Mock).mockResolvedValueOnce({ uid: 'u1' })
    const userDocGet = jest.fn().mockResolvedValue({
      exists: true,
      data: () => ({ role: 'client', orgId: 'org-A' }),
    })
    const contactDoc = jest.fn().mockResolvedValue({
      exists: true,
      data: () => ({ orgId: 'org-B' }), // different org
    })
    ;(adminDb.collection as jest.Mock).mockImplementation((name: string) => {
      if (name === 'users') {
        return { doc: jest.fn().mockReturnValue({ get: userDocGet }) }
      }
      if (name === 'contacts') {
        return { doc: jest.fn().mockReturnValue({ get: contactDoc }) }
      }
      return buildQueryChain([])
    })
    const res = await GET(clientReq('?contactId=c1'))
    expect(res.status).toBe(403)
  })

  it('respects pagination params (limit, page)', async () => {
    const chain = buildQueryChain([])
    ;(adminDb.collection as jest.Mock).mockReturnValue(chain)
    const res = await GET(adminReq('?orgId=org-A&limit=25&page=3'))
    expect(res.status).toBe(200)
    expect(chain.limit).toHaveBeenCalledWith(25)
    expect(chain.offset).toHaveBeenCalledWith(50) // (3-1) * 25
  })

  it('caps limit at 200', async () => {
    const chain = buildQueryChain([])
    ;(adminDb.collection as jest.Mock).mockReturnValue(chain)
    const res = await GET(adminReq('?orgId=org-A&limit=500'))
    expect(res.status).toBe(200)
    expect(chain.limit).toHaveBeenCalledWith(200)
  })

  it('filters out soft-deleted activities', async () => {
    const docs = [
      { id: 'a1', data: () => ({ orgId: 'org-A', contactId: 'c1', type: 'note', summary: 'k', deleted: false }) },
      { id: 'a2', data: () => ({ orgId: 'org-A', contactId: 'c1', type: 'note', summary: 'gone', deleted: true }) },
    ]
    const chain: Record<string, jest.Mock> = {}
    chain.where = jest.fn().mockReturnValue(chain)
    chain.orderBy = jest.fn().mockReturnValue(chain)
    chain.limit = jest.fn().mockReturnValue(chain)
    chain.offset = jest.fn().mockReturnValue(chain)
    chain.get = jest.fn().mockResolvedValue({ docs })
    ;(adminDb.collection as jest.Mock).mockReturnValue(chain)
    const res = await GET(adminReq('?orgId=org-A'))
    const body = await res.json()
    expect(body.data).toHaveLength(1)
    expect(body.data[0].id).toBe('a1')
  })
})
