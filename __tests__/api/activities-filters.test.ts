// __tests__/api/activities-filters.test.ts
//
// Tests for activity feed type and date-range filters (Item 2).

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

const ORG_ID = 'org-test-001'

// Activity fixtures
const activities = [
  { id: 'a1', orgId: ORG_ID, contactId: 'c1', type: 'note',       summary: 'note 1', createdAt: { toDate: () => new Date('2024-03-01') } },
  { id: 'a2', orgId: ORG_ID, contactId: 'c1', type: 'email_sent', summary: 'email 1', createdAt: { toDate: () => new Date('2024-06-15') } },
  { id: 'a3', orgId: ORG_ID, contactId: 'c1', type: 'call',       summary: 'call 1',  createdAt: { toDate: () => new Date('2024-09-20') } },
  { id: 'a4', orgId: ORG_ID, contactId: 'c1', type: 'note',       summary: 'note 2',  createdAt: { toDate: () => new Date('2024-12-01') } },
]

function buildQueryChain(subset: typeof activities) {
  const docs = subset.map((a) => ({ id: a.id, data: () => a }))
  const chain: Record<string, jest.Mock> = {}
  chain.where = jest.fn().mockReturnValue(chain)
  chain.orderBy = jest.fn().mockReturnValue(chain)
  chain.limit = jest.fn().mockReturnValue(chain)
  chain.offset = jest.fn().mockReturnValue(chain)
  chain.get = jest.fn().mockResolvedValue({ docs })
  return chain
}

// Track the 'in' filter applied via .where() so we can assert on it
function buildSpyQueryChain(allDocs: typeof activities) {
  const receivedWhereArgs: Array<[string, string, unknown]> = []
  const docs = allDocs.map((a) => ({ id: a.id, data: () => a }))
  const chain: Record<string, jest.Mock> = {}
  chain.where = jest.fn().mockImplementation((...args: [string, string, unknown]) => {
    receivedWhereArgs.push(args)
    return chain
  })
  chain.orderBy = jest.fn().mockReturnValue(chain)
  chain.limit = jest.fn().mockReturnValue(chain)
  chain.offset = jest.fn().mockReturnValue(chain)
  chain.get = jest.fn().mockResolvedValue({ docs })
  return { chain, receivedWhereArgs }
}

function setupAdminUser() {
  ;(adminAuth.verifyIdToken as jest.Mock).mockResolvedValue({ uid: 'admin-1' })
  ;(adminDb.collection as jest.Mock).mockImplementation((name: string) => {
    if (name === 'users') {
      return {
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({
            exists: true,
            data: () => ({ role: 'admin', orgId: ORG_ID }),
          }),
        }),
      }
    }
    return buildQueryChain(activities)
  })
}

import { GET } from '@/app/api/v1/crm/activities/route'

describe('GET /api/v1/crm/activities — filters', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('filter by single type returns only that type', async () => {
    ;(adminAuth.verifyIdToken as jest.Mock).mockResolvedValue({ uid: 'admin-1' })

    const noteDocs = activities.filter((a) => a.type === 'note')
    ;(adminDb.collection as jest.Mock).mockImplementation((name: string) => {
      if (name === 'users') {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
              exists: true,
              data: () => ({ role: 'admin', orgId: ORG_ID }),
            }),
          }),
        }
      }
      return buildQueryChain(noteDocs)
    })

    const res = await GET(adminReq(`?orgId=${ORG_ID}&type=note`))
    expect(res.status).toBe(200)
    const json = await res.json()
    const ids = (json.data as Array<{ id: string }>).map((a) => a.id)
    expect(ids).toEqual(expect.arrayContaining(['a1', 'a4']))
    expect(ids).not.toContain('a2')
    expect(ids).not.toContain('a3')
  })

  it('filter by multiple types (comma-separated) returns all matching', async () => {
    ;(adminAuth.verifyIdToken as jest.Mock).mockResolvedValue({ uid: 'admin-1' })

    const { chain, receivedWhereArgs } = buildSpyQueryChain(
      activities.filter((a) => a.type === 'note' || a.type === 'email_sent')
    )
    ;(adminDb.collection as jest.Mock).mockImplementation((name: string) => {
      if (name === 'users') {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
              exists: true,
              data: () => ({ role: 'admin', orgId: ORG_ID }),
            }),
          }),
        }
      }
      return chain
    })

    const res = await GET(adminReq(`?orgId=${ORG_ID}&type=note,email_sent`))
    expect(res.status).toBe(200)

    // Verify Firestore received an 'in' filter
    const inFilter = receivedWhereArgs.find(([, op]) => op === 'in')
    expect(inFilter).toBeDefined()
    expect(inFilter![2]).toEqual(expect.arrayContaining(['note', 'email_sent']))

    const json = await res.json()
    const ids = (json.data as Array<{ id: string }>).map((a) => a.id)
    expect(ids).toEqual(expect.arrayContaining(['a1', 'a2', 'a4']))
    expect(ids).not.toContain('a3')
  })

  it('dateFrom filters out older activities (in-memory fallback path)', async () => {
    ;(adminAuth.verifyIdToken as jest.Mock).mockResolvedValue({ uid: 'admin-1' })

    // Simulate Firestore throwing on range filter so in-memory path is exercised.
    // With ?orgId and no contactId/type, .where calls are:
    //   1: orgId ==  (equality — fine)
    //   2: createdAt >= dateFrom  (range — this is where we want to throw)
    const chain: Record<string, jest.Mock> = {}
    let callCount = 0
    chain.where = jest.fn().mockImplementation(() => {
      callCount++
      // Throw on the 2nd .where (the dateFrom range filter)
      if (callCount >= 2) throw new Error('Firestore index required')
      return chain
    })
    chain.orderBy = jest.fn().mockReturnValue(chain)
    chain.limit = jest.fn().mockReturnValue(chain)
    chain.offset = jest.fn().mockReturnValue(chain)
    chain.get = jest.fn().mockResolvedValue({
      docs: activities.map((a) => ({ id: a.id, data: () => a })),
    })

    ;(adminDb.collection as jest.Mock).mockImplementation((name: string) => {
      if (name === 'users') {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
              exists: true,
              data: () => ({ role: 'admin', orgId: ORG_ID }),
            }),
          }),
        }
      }
      return chain
    })

    const res = await GET(adminReq(`?orgId=${ORG_ID}&dateFrom=2024-06-01`))
    expect(res.status).toBe(200)
    const json = await res.json()
    const ids = (json.data as Array<{ id: string }>).map((a) => a.id)
    // a1 (March) should be filtered out
    expect(ids).not.toContain('a1')
    expect(ids).toEqual(expect.arrayContaining(['a2', 'a3', 'a4']))
  })

  it('dateFrom + dateTo returns only activities in range (in-memory fallback path)', async () => {
    ;(adminAuth.verifyIdToken as jest.Mock).mockResolvedValue({ uid: 'admin-1' })

    const chain: Record<string, jest.Mock> = {}
    let callCount = 0
    chain.where = jest.fn().mockImplementation(() => {
      callCount++
      // Throw on the 2nd .where (dateFrom range filter — triggers full in-memory path for both dates)
      if (callCount >= 2) throw new Error('Firestore index required')
      return chain
    })
    chain.orderBy = jest.fn().mockReturnValue(chain)
    chain.limit = jest.fn().mockReturnValue(chain)
    chain.offset = jest.fn().mockReturnValue(chain)
    chain.get = jest.fn().mockResolvedValue({
      docs: activities.map((a) => ({ id: a.id, data: () => a })),
    })

    ;(adminDb.collection as jest.Mock).mockImplementation((name: string) => {
      if (name === 'users') {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
              exists: true,
              data: () => ({ role: 'admin', orgId: ORG_ID }),
            }),
          }),
        }
      }
      return chain
    })

    const res = await GET(adminReq(`?orgId=${ORG_ID}&dateFrom=2024-05-01&dateTo=2024-10-01`))
    expect(res.status).toBe(200)
    const json = await res.json()
    const ids = (json.data as Array<{ id: string }>).map((a) => a.id)
    // Only a2 (June) and a3 (September) are in range
    expect(ids).toEqual(expect.arrayContaining(['a2', 'a3']))
    expect(ids).not.toContain('a1')
    expect(ids).not.toContain('a4')
  })
})
