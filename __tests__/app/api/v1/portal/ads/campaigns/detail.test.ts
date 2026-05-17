// __tests__/app/api/v1/portal/ads/campaigns/detail.test.ts
//
// Passthrough mock for withPortalAuthAndRole:
//   – injects test uid / orgId / role directly into the handler
//   – returns handler(req, uid, orgId, role, ctx) so the route logic runs without Firebase auth

let _testUid = 'uid_client'
let _testOrgId = 'org_1'
let _testRole: string = 'viewer'

jest.mock('@/lib/auth/portal-middleware', () => ({
  withPortalAuthAndRole: (_minRole: string, handler: any) =>
    (req: any, uid?: string, orgId?: string, role?: string, ctx?: any) =>
      handler(req, _testUid, _testOrgId, _testRole, ctx),
}))

jest.mock('@/lib/ads/campaigns/store', () => ({
  getCampaign: jest.fn(),
}))

import { GET } from '@/app/api/v1/portal/ads/campaigns/[id]/route'

const store = jest.requireMock('@/lib/ads/campaigns/store')

beforeEach(() => {
  jest.clearAllMocks()
  _testUid = 'uid_client'
  _testOrgId = 'org_1'
  _testRole = 'viewer'
})

const baseCampaign = {
  id: 'cmp_1',
  orgId: 'org_1',
  name: 'My Campaign',
  status: 'DRAFT',
  reviewState: 'none',
}

function makeReq() {
  return new Request('http://x', { method: 'GET' }) as any
}

function makeCtx(id = 'cmp_1') {
  return { params: Promise.resolve({ id }) }
}

// ── Happy path ─────────────────────────────────────────────────────────────────

describe('GET /api/v1/portal/ads/campaigns/[id]', () => {
  it('returns the campaign when org matches', async () => {
    store.getCampaign.mockResolvedValueOnce(baseCampaign)

    const res = await GET(makeReq(), undefined, undefined, undefined, makeCtx())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data).toMatchObject({ id: 'cmp_1', orgId: 'org_1', name: 'My Campaign' })
    expect(store.getCampaign).toHaveBeenCalledWith('cmp_1')
  })

  // ── Wrong-org 404 ─────────────────────────────────────────────────────────────

  it('returns 404 when campaign.orgId does not match auth orgId', async () => {
    _testOrgId = 'org_other'
    store.getCampaign.mockResolvedValueOnce({ ...baseCampaign, orgId: 'org_1' })

    const res = await GET(makeReq(), undefined, undefined, undefined, makeCtx())
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body.error).toMatch(/Campaign not found/)
  })

  // ── Campaign not found 404 ────────────────────────────────────────────────────

  it('returns 404 when getCampaign returns null', async () => {
    store.getCampaign.mockResolvedValueOnce(null)

    const res = await GET(makeReq(), undefined, undefined, undefined, makeCtx())
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body.error).toMatch(/Campaign not found/)
  })
})
