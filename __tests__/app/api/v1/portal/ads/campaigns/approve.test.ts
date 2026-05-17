// __tests__/app/api/v1/portal/ads/campaigns/approve.test.ts
//
// Passthrough mock for withPortalAuthAndRole:
//   – injects test uid / orgId / role directly into the handler
//   – returns handler(req, uid, orgId, role, ctx) so the route logic runs without Firebase auth

let _testUid = 'uid_client'
let _testOrgId = 'org_1'
let _testRole: string = 'member'

jest.mock('@/lib/auth/portal-middleware', () => ({
  withPortalAuthAndRole: (_minRole: string, handler: any) =>
    (req: any, uid?: string, orgId?: string, role?: string, ctx?: any) =>
      handler(req, _testUid, _testOrgId, _testRole, ctx),
}))

jest.mock('@/lib/ads/campaigns/store', () => ({
  getCampaign: jest.fn(),
}))

jest.mock('@/lib/ads/approval', () => ({
  setReviewState: jest.fn(),
}))

jest.mock('@/lib/ads/activity', () => ({
  logCampaignActivity: jest.fn(),
}))

jest.mock('@/lib/ads/notifications', () => ({
  notifyCampaignApproved: jest.fn(),
}))

jest.mock('firebase-admin/firestore', () => ({
  Timestamp: { now: jest.fn(() => ({ seconds: 1700000000, nanoseconds: 0 })) },
}))

import { POST } from '@/app/api/v1/portal/ads/campaigns/[id]/approve/route'

const store = jest.requireMock('@/lib/ads/campaigns/store')
const approval = jest.requireMock('@/lib/ads/approval')
const activity = jest.requireMock('@/lib/ads/activity')
const notifications = jest.requireMock('@/lib/ads/notifications')

beforeEach(() => {
  jest.clearAllMocks()
  _testUid = 'uid_client'
  _testOrgId = 'org_1'
  _testRole = 'member'
})

const baseCampaign = {
  id: 'cmp_1',
  orgId: 'org_1',
  name: 'My Campaign',
  status: 'PENDING_REVIEW',
  reviewState: 'awaiting',
}

function makeReq() {
  return new Request('http://x', { method: 'POST' }) as any
}

function makeCtx(id = 'cmp_1') {
  return { params: Promise.resolve({ id }) }
}

// ── Happy path ─────────────────────────────────────────────────────────────────

describe('POST /api/v1/portal/ads/campaigns/[id]/approve', () => {
  it('approves the campaign and returns the updated campaign', async () => {
    const updated = { ...baseCampaign, reviewState: 'approved', approvedBy: 'uid_client' }
    store.getCampaign
      .mockResolvedValueOnce(baseCampaign) // initial fetch
      .mockResolvedValueOnce(updated)       // re-fetch after update
    approval.setReviewState.mockResolvedValueOnce(undefined)
    activity.logCampaignActivity.mockResolvedValueOnce(undefined)
    notifications.notifyCampaignApproved.mockResolvedValueOnce(undefined)

    const res = await POST(makeReq(), undefined, undefined, undefined, makeCtx())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.reviewState).toBe('approved')

    expect(approval.setReviewState).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: 'cmp_1',
        newStatus: 'PENDING_REVIEW',
        newReviewState: 'approved',
        actorUid: 'uid_client',
        actorRole: 'member',
        entryState: 'approved',
        extraFields: expect.objectContaining({
          approvedBy: 'uid_client',
        }),
      }),
    )
  })

  // ── Wrong-org 404 ─────────────────────────────────────────────────────────────

  it('returns 404 when campaign.orgId does not match auth orgId', async () => {
    _testOrgId = 'org_other'
    store.getCampaign.mockResolvedValueOnce({ ...baseCampaign, orgId: 'org_1' })

    const res = await POST(makeReq(), undefined, undefined, undefined, makeCtx())
    expect(res.status).toBe(404)
    expect(approval.setReviewState).not.toHaveBeenCalled()
  })

  // ── Not awaiting 400 ──────────────────────────────────────────────────────────

  it('returns 400 when reviewState is not awaiting', async () => {
    store.getCampaign.mockResolvedValueOnce({ ...baseCampaign, reviewState: 'approved' })

    const res = await POST(makeReq(), undefined, undefined, undefined, makeCtx())
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toMatch(/Nothing to approve/)
    expect(approval.setReviewState).not.toHaveBeenCalled()
  })

  // ── Role forwarded to setReviewState ─────────────────────────────────────────

  it('passes the role from auth context through to setReviewState', async () => {
    _testRole = 'owner'
    const updated = { ...baseCampaign, reviewState: 'approved' }
    store.getCampaign
      .mockResolvedValueOnce(baseCampaign)
      .mockResolvedValueOnce(updated)
    approval.setReviewState.mockResolvedValueOnce(undefined)

    await POST(makeReq(), undefined, undefined, undefined, makeCtx())

    expect(approval.setReviewState).toHaveBeenCalledWith(
      expect.objectContaining({ actorRole: 'owner' }),
    )
  })
})
