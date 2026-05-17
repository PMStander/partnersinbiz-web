// __tests__/app/api/v1/portal/ads/campaigns/reject.test.ts
import { POST } from '@/app/api/v1/portal/ads/campaigns/[id]/reject/route'

// Portal middleware: expose (req, uid, orgId, role, ctx) directly without auth
jest.mock('@/lib/auth/portal-middleware', () => ({
  withPortalAuthAndRole: (_minRole: string, handler: any) => handler,
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
  notifyCampaignRejected: jest.fn(),
}))

jest.mock('firebase-admin/firestore', () => ({
  Timestamp: { now: jest.fn(() => ({ seconds: 1000, nanoseconds: 0 })) },
}))

const store = jest.requireMock('@/lib/ads/campaigns/store')
const approval = jest.requireMock('@/lib/ads/approval')
const activity = jest.requireMock('@/lib/ads/activity')
const notifications = jest.requireMock('@/lib/ads/notifications')

beforeEach(() => jest.clearAllMocks())

const baseCampaign = {
  id: 'cmp_1',
  orgId: 'org_1',
  name: 'Test Campaign',
  status: 'PENDING_REVIEW',
  reviewState: 'awaiting',
}

const VALID_REASON = 'The creative needs more colour and a clearer CTA please.'

function makeReq(body: unknown = { reason: VALID_REASON }) {
  return new Request('http://x', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as any
}

function makeCtx(id = 'cmp_1') {
  return { params: Promise.resolve({ id }) }
}

// ── Happy path ─────────────────────────────────────────────────────────────────

describe('POST /api/v1/portal/ads/campaigns/[id]/reject', () => {
  it('happy path — calls setReviewState with DRAFT + rejected, returns updated campaign', async () => {
    const updated = {
      ...baseCampaign,
      status: 'DRAFT',
      reviewState: 'rejected',
      rejectionReason: VALID_REASON,
    }
    store.getCampaign
      .mockResolvedValueOnce(baseCampaign) // initial fetch
      .mockResolvedValueOnce(updated)      // after update
    approval.setReviewState.mockResolvedValueOnce(undefined)
    activity.logCampaignActivity.mockResolvedValueOnce(undefined)
    notifications.notifyCampaignRejected.mockResolvedValueOnce(undefined)

    const res = await POST(makeReq(), 'uid_member', 'org_1', 'member', makeCtx())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.status).toBe('DRAFT')
    expect(body.data.reviewState).toBe('rejected')

    expect(approval.setReviewState).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: 'cmp_1',
        newStatus: 'DRAFT',
        newReviewState: 'rejected',
        actorUid: 'uid_member',
        actorRole: 'member',
        entryState: 'rejected',
        reason: VALID_REASON,
        extraFields: expect.objectContaining({
          rejectedBy: 'uid_member',
          rejectionReason: VALID_REASON,
        }),
      }),
    )
  })

  // ── Missing reason ───────────────────────────────────────────────────────────

  it('returns 400 when reason is missing from body', async () => {
    const res = await POST(makeReq({}), 'uid_member', 'org_1', 'member', makeCtx())
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toMatch(/reason/)
    expect(approval.setReviewState).not.toHaveBeenCalled()
  })

  // ── Reason too short ─────────────────────────────────────────────────────────

  it('returns 400 when reason is shorter than 10 characters', async () => {
    const res = await POST(makeReq({ reason: 'Too short' }), 'uid_member', 'org_1', 'member', makeCtx())
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toMatch(/reason/)
    expect(approval.setReviewState).not.toHaveBeenCalled()
  })

  // ── Reason too long ──────────────────────────────────────────────────────────

  it('returns 400 when reason exceeds 500 characters', async () => {
    const longReason = 'A'.repeat(501)
    const res = await POST(makeReq({ reason: longReason }), 'uid_member', 'org_1', 'member', makeCtx())
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toMatch(/reason/)
    expect(approval.setReviewState).not.toHaveBeenCalled()
  })

  // ── Wrong-org 404 ────────────────────────────────────────────────────────────

  it('returns 404 when campaign belongs to a different org', async () => {
    store.getCampaign.mockResolvedValueOnce({ ...baseCampaign, orgId: 'org_other' })

    const res = await POST(makeReq(), 'uid_member', 'org_1', 'member', makeCtx())

    expect(res.status).toBe(404)
    expect(approval.setReviewState).not.toHaveBeenCalled()
  })
})
