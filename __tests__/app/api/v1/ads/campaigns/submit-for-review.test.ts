// __tests__/app/api/v1/ads/campaigns/submit-for-review.test.ts
import { POST } from '@/app/api/v1/ads/campaigns/[id]/submit-for-review/route'

jest.mock('@/lib/api/auth', () => ({ withAuth: (_r: string, h: any) => h }))
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
  notifyAwaitingReview: jest.fn(),
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
  status: 'DRAFT',
}

const baseUser = { uid: 'uid_admin', email: 'admin@test.com' }

function makeReq(opts: { orgId?: string; orgSlug?: string } = {}) {
  const headers: Record<string, string> = {}
  if (opts.orgId !== undefined) headers['X-Org-Id'] = opts.orgId
  if (opts.orgSlug) headers['X-Org-Slug'] = opts.orgSlug
  return new Request('http://x', { method: 'POST', headers }) as any
}

function makeCtx(id = 'cmp_1') {
  return { params: Promise.resolve({ id }) }
}

// ── Happy path ─────────────────────────────────────────────────────────────────

describe('POST /api/v1/ads/campaigns/[id]/submit-for-review', () => {
  it('calls setReviewState with correct args and returns updated campaign', async () => {
    const updated = { ...baseCampaign, status: 'PENDING_REVIEW', reviewState: 'awaiting' }
    store.getCampaign
      .mockResolvedValueOnce(baseCampaign)  // first get
      .mockResolvedValueOnce(updated)        // after update
    approval.setReviewState.mockResolvedValueOnce(undefined)
    activity.logCampaignActivity.mockResolvedValueOnce(undefined)
    notifications.notifyAwaitingReview.mockResolvedValueOnce(undefined)

    const res = await POST(makeReq({ orgId: 'org_1', orgSlug: 'org-slug' }), baseUser, makeCtx())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.status).toBe('PENDING_REVIEW')
    expect(body.data.reviewState).toBe('awaiting')

    expect(approval.setReviewState).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: 'cmp_1',
        newStatus: 'PENDING_REVIEW',
        newReviewState: 'awaiting',
        actorUid: 'uid_admin',
        actorRole: 'admin',
        entryState: 'submitted',
        extraFields: expect.objectContaining({
          submittedForReviewBy: 'uid_admin',
        }),
      }),
    )
  })

  // ── Wrong-org 404 ────────────────────────────────────────────────────────────

  it('returns 404 when campaign belongs to a different org', async () => {
    store.getCampaign.mockResolvedValueOnce({ ...baseCampaign, orgId: 'org_other' })

    const res = await POST(makeReq({ orgId: 'org_1' }), baseUser, makeCtx())
    expect(res.status).toBe(404)
    expect(approval.setReviewState).not.toHaveBeenCalled()
  })

  // ── Status guard: ACTIVE ─────────────────────────────────────────────────────

  it('returns 400 with correct message when campaign status is ACTIVE', async () => {
    store.getCampaign.mockResolvedValueOnce({ ...baseCampaign, status: 'ACTIVE' })

    const res = await POST(makeReq({ orgId: 'org_1' }), baseUser, makeCtx())
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toMatch(/Only DRAFT campaigns can be submitted for review/)
    expect(approval.setReviewState).not.toHaveBeenCalled()
  })

  // ── Status guard: PAUSED ─────────────────────────────────────────────────────

  it('returns 400 with correct message when campaign status is PAUSED', async () => {
    store.getCampaign.mockResolvedValueOnce({ ...baseCampaign, status: 'PAUSED' })

    const res = await POST(makeReq({ orgId: 'org_1' }), baseUser, makeCtx())
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toMatch(/Only DRAFT campaigns can be submitted for review/)
    expect(approval.setReviewState).not.toHaveBeenCalled()
  })

  // ── Missing X-Org-Id ─────────────────────────────────────────────────────────

  it('returns 400 when X-Org-Id header is missing', async () => {
    const res = await POST(makeReq({}), baseUser, makeCtx())
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toMatch(/Missing X-Org-Id/)
    expect(store.getCampaign).not.toHaveBeenCalled()
    expect(approval.setReviewState).not.toHaveBeenCalled()
  })
})
