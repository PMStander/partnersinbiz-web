// __tests__/app/api/v1/portal/ads/campaigns/list.test.ts
//
// Passthrough mock for withPortalAuthAndRole:
//   – injects test uid / orgId / role directly into the handler
//   – bypasses Firebase auth so the route logic runs in isolation

let _testUid = 'uid_client'
let _testOrgId = 'org_1'
let _testRole: string = 'viewer'

jest.mock('@/lib/auth/portal-middleware', () => ({
  withPortalAuthAndRole: (_minRole: string, handler: any) =>
    (req: any) =>
      handler(req, _testUid, _testOrgId, _testRole),
}))

jest.mock('@/lib/ads/campaigns/store', () => ({
  listCampaigns: jest.fn(),
}))

import { GET } from '@/app/api/v1/portal/ads/campaigns/route'

const store = jest.requireMock('@/lib/ads/campaigns/store')

beforeEach(() => {
  jest.clearAllMocks()
  _testUid = 'uid_client'
  _testOrgId = 'org_1'
  _testRole = 'viewer'
})

const baseCampaigns = [
  { id: 'cmp_1', orgId: 'org_1', name: 'Alpha', status: 'DRAFT' },
  { id: 'cmp_2', orgId: 'org_1', name: 'Beta', status: 'ACTIVE' },
]

// ── Happy path ─────────────────────────────────────────────────────────────────

describe('GET /api/v1/portal/ads/campaigns', () => {
  it('returns all campaigns scoped to the orgId from auth context', async () => {
    store.listCampaigns.mockResolvedValueOnce(baseCampaigns)

    const req = new Request('http://x/api/v1/portal/ads/campaigns') as any
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toHaveLength(2)
    expect(body.data[0].id).toBe('cmp_1')

    // orgId comes from auth context — never from query params
    expect(store.listCampaigns).toHaveBeenCalledWith({ orgId: 'org_1', status: undefined })
  })

  // ── ?status filter passes through ─────────────────────────────────────────

  it('passes ?status query param to listCampaigns', async () => {
    store.listCampaigns.mockResolvedValueOnce([baseCampaigns[0]])

    const req = new Request('http://x/api/v1/portal/ads/campaigns?status=DRAFT') as any
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data).toHaveLength(1)
    expect(store.listCampaigns).toHaveBeenCalledWith({ orgId: 'org_1', status: 'DRAFT' })
  })

  // ── Viewer role is sufficient ─────────────────────────────────────────────

  it('works for viewer role (no admin required)', async () => {
    _testRole = 'viewer'
    store.listCampaigns.mockResolvedValueOnce(baseCampaigns)

    const req = new Request('http://x/api/v1/portal/ads/campaigns') as any
    const res = await GET(req)

    expect(res.status).toBe(200)
    // viewer role is passed through the handler — no 403 thrown
    expect(store.listCampaigns).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: 'org_1' }),
    )
  })
})
