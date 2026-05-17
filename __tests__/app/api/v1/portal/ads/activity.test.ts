// __tests__/app/api/v1/portal/ads/activity.test.ts
//
// Same passthrough mock pattern as sibling campaigns/approve.test.ts:
//   – injects test uid / orgId / role into the handler directly so the route
//     logic runs without Firebase auth.

let _testUid = 'uid_client'
let _testOrgId = 'org_1'
let _testRole: string = 'viewer'

jest.mock('@/lib/auth/portal-middleware', () => ({
  withPortalAuthAndRole: (_minRole: string, handler: any) =>
    (req: any) => handler(req, _testUid, _testOrgId, _testRole),
}))

// Stub Firestore admin — the route uses adminDb.collection(...).where(...).orderBy(...).limit(...).get()
const mockGet = jest.fn()
const mockLimit = jest.fn((..._args: any[]) => ({ get: mockGet }))
const mockStartAfter = jest.fn((..._args: any[]) => ({ limit: mockLimit }))
const mockOrderBy = jest.fn((..._args: any[]) => ({ limit: mockLimit, startAfter: mockStartAfter }))
const mockWhere = jest.fn((..._args: any[]) => ({ orderBy: mockOrderBy }))
const mockCollection = jest.fn((..._args: any[]) => ({ where: mockWhere }))

jest.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: (name: string) => mockCollection(name) },
}))

import { GET } from '@/app/api/v1/portal/ads/activity/route'

beforeEach(() => {
  jest.clearAllMocks()
  _testUid = 'uid_client'
  _testOrgId = 'org_1'
  _testRole = 'viewer'
})

function makeReq(url = 'http://x/api/v1/portal/ads/activity') {
  return new Request(url, { method: 'GET' }) as any
}

function makeDocs(docs: Array<{ id: string; data: Record<string, unknown> }>) {
  return {
    docs: docs.map((d) => ({ id: d.id, data: () => d.data })),
  }
}

describe('GET /api/v1/portal/ads/activity', () => {
  it('returns only ad-scoped entries (filters out non-ad activity)', async () => {
    mockGet.mockResolvedValueOnce(
      makeDocs([
        { id: 'a1', data: { orgId: 'org_1', type: 'ad_campaign.created',  actorName: 'Pip', createdAt: new Date('2026-05-15T10:00:00Z') } },
        { id: 'a2', data: { orgId: 'org_1', type: 'contact.updated',      actorName: 'Peet', createdAt: new Date('2026-05-15T09:00:00Z') } },
        { id: 'a3', data: { orgId: 'org_1', type: 'ad_set.launched',      actorName: 'Pip', createdAt: new Date('2026-05-15T08:00:00Z') } },
      ]),
    )

    const res = await GET(makeReq())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.entries).toHaveLength(2)
    expect(body.data.entries.map((e: any) => e.id)).toEqual(['a1', 'a3'])
    expect(mockCollection).toHaveBeenCalledWith('activity')
    expect(mockWhere).toHaveBeenCalledWith('orgId', '==', 'org_1')
  })

  it('is tenant-isolated — the orgId filter is always applied with the auth orgId', async () => {
    _testOrgId = 'org_other'
    mockGet.mockResolvedValueOnce(makeDocs([]))

    const res = await GET(makeReq())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.entries).toEqual([])
    expect(mockWhere).toHaveBeenCalledWith('orgId', '==', 'org_other')
  })

  it('respects the limit query param (clamped to [1,100], applies after ad-only filter)', async () => {
    // 6 docs, all ad-type — request limit=2 → expect 2 entries returned.
    mockGet.mockResolvedValueOnce(
      makeDocs(
        Array.from({ length: 6 }, (_, i) => ({
          id: `a${i + 1}`,
          data: {
            orgId: 'org_1',
            type: 'ad.created',
            actorName: 'Pip',
            createdAt: new Date(`2026-05-15T1${i}:00:00Z`),
          },
        })),
      ),
    )

    const res = await GET(makeReq('http://x/api/v1/portal/ads/activity?limit=2'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.entries).toHaveLength(2)
    // Overfetch should pass limit*3 (=6) into Firestore.
    expect(mockLimit).toHaveBeenCalledWith(6)
  })
})
