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

const ORG_ID = 'org-test-001'

function adminReq(search = '') {
  return new NextRequest(`http://localhost/api/v1/crm/activities${search}`, {
    method: 'GET',
    headers: {
      authorization: 'Bearer test-key',
      'x-org-id': ORG_ID,
    },
  })
}

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

/** Build a collection mock that handles organizations + activities arms. */
function mockCollections(activitiesChain: ReturnType<typeof buildQueryChain>) {
  ;(adminDb.collection as jest.Mock).mockImplementation((name: string) => {
    if (name === 'organizations') {
      return {
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({
            exists: true,
            data: () => ({ settings: { permissions: {} } }),
          }),
        }),
      }
    }
    // 'activities' and any other collection
    return activitiesChain
  })
}

import { GET } from '@/app/api/v1/crm/activities/route'

describe('GET /api/v1/crm/activities — filters', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('filter by single type returns only that type', async () => {
    const noteDocs = activities.filter((a) => a.type === 'note')
    mockCollections(buildQueryChain(noteDocs))

    const res = await GET(adminReq(`?orgId=${ORG_ID}&type=note`))
    expect(res.status).toBe(200)
    const json = await res.json()
    const ids = (json.data.activities as Array<{ id: string }>).map((a) => a.id)
    expect(ids).toEqual(expect.arrayContaining(['a1', 'a4']))
    expect(ids).not.toContain('a2')
    expect(ids).not.toContain('a3')
  })

  it('filter by multiple types (comma-separated) returns all matching', async () => {
    const { chain, receivedWhereArgs } = buildSpyQueryChain(
      activities.filter((a) => a.type === 'note' || a.type === 'email_sent')
    )
    mockCollections(chain)

    const res = await GET(adminReq(`?orgId=${ORG_ID}&type=note,email_sent`))
    expect(res.status).toBe(200)

    // Verify Firestore received an 'in' filter
    const inFilter = receivedWhereArgs.find(([, op]) => op === 'in')
    expect(inFilter).toBeDefined()
    expect(inFilter![2]).toEqual(expect.arrayContaining(['note', 'email_sent']))

    const json = await res.json()
    const ids = (json.data.activities as Array<{ id: string }>).map((a) => a.id)
    expect(ids).toEqual(expect.arrayContaining(['a1', 'a2', 'a4']))
    expect(ids).not.toContain('a3')
  })

  it('dateFrom — Firestore receives the createdAt >= filter', async () => {
    // The route delegates date filtering to Firestore; simulate Firestore returning
    // only docs after the cutoff (as it would with a real index).
    const afterJune = activities.filter((a) => a.createdAt.toDate() >= new Date('2024-06-01'))
    const { chain, receivedWhereArgs } = buildSpyQueryChain(afterJune)
    mockCollections(chain)

    const res = await GET(adminReq(`?orgId=${ORG_ID}&dateFrom=2024-06-01`))
    expect(res.status).toBe(200)

    // Confirm the route passed a >= filter on createdAt to Firestore
    const rangeFilter = receivedWhereArgs.find(([field, op]) => field === 'createdAt' && op === '>=')
    expect(rangeFilter).toBeDefined()

    const json = await res.json()
    const ids = (json.data.activities as Array<{ id: string }>).map((a) => a.id)
    // a1 (March) is not in the simulated result set
    expect(ids).not.toContain('a1')
    expect(ids).toEqual(expect.arrayContaining(['a2', 'a3', 'a4']))
  })

  it('dateFrom + dateTo — Firestore receives both range filters', async () => {
    // Simulate Firestore returning only docs within the range
    const inRange = activities.filter((a) => {
      const d = a.createdAt.toDate()
      return d >= new Date('2024-05-01') && d <= new Date('2024-10-01')
    })
    const { chain, receivedWhereArgs } = buildSpyQueryChain(inRange)
    mockCollections(chain)

    const res = await GET(adminReq(`?orgId=${ORG_ID}&dateFrom=2024-05-01&dateTo=2024-10-01`))
    expect(res.status).toBe(200)

    // Confirm both range filters were sent to Firestore
    const fromFilter = receivedWhereArgs.find(([field, op]) => field === 'createdAt' && op === '>=')
    const toFilter   = receivedWhereArgs.find(([field, op]) => field === 'createdAt' && op === '<=')
    expect(fromFilter).toBeDefined()
    expect(toFilter).toBeDefined()

    const json = await res.json()
    const ids = (json.data.activities as Array<{ id: string }>).map((a) => a.id)
    // Only a2 (June) and a3 (September) are in range
    expect(ids).toEqual(expect.arrayContaining(['a2', 'a3']))
    expect(ids).not.toContain('a1')
    expect(ids).not.toContain('a4')
  })
})
