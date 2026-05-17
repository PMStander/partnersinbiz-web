// __tests__/api/v1/portal/ads/campaigns/bulk-approve.test.ts
//
// Bulk-approve queue route — POST /api/v1/portal/ads/campaigns/bulk-approve.
// Mirrors the per-campaign approve.test.ts pattern: passthrough portal auth,
// mock the store + approval helper, exercise the handler directly.

let _testUid = 'uid_client'
let _testOrgId = 'org_1'
let _testRole: string = 'member'

jest.mock('@/lib/auth/portal-middleware', () => ({
  withPortalAuthAndRole: (_minRole: string, handler: any) =>
    (req: any, _uid?: string, _orgId?: string, _role?: string, ctx?: any) =>
      handler(req, _testUid, _testOrgId, _testRole, ctx),
}))

jest.mock('@/lib/ads/campaigns/store', () => ({
  listCampaigns: jest.fn(),
  updateCampaign: jest.fn(),
}))

jest.mock('@/lib/ads/activity', () => ({
  logCampaignActivity: jest.fn(),
}))

jest.mock('@/lib/ads/notifications', () => ({
  notifyCampaignApproved: jest.fn(),
}))

jest.mock('firebase-admin/firestore', () => ({
  Timestamp: { now: jest.fn(() => ({ seconds: 1716000000, nanoseconds: 0 })) },
  FieldValue: { arrayUnion: jest.fn((...items: unknown[]) => ({ __arrayUnion: items })) },
}))

import { POST } from '@/app/api/v1/portal/ads/campaigns/bulk-approve/route'

const store = jest.requireMock('@/lib/ads/campaigns/store')
const activity = jest.requireMock('@/lib/ads/activity')
const notifications = jest.requireMock('@/lib/ads/notifications')

beforeEach(() => {
  jest.clearAllMocks()
  _testUid = 'uid_client'
  _testOrgId = 'org_1'
  _testRole = 'member'
  store.updateCampaign.mockResolvedValue(undefined)
  activity.logCampaignActivity.mockResolvedValue(undefined)
  notifications.notifyCampaignApproved.mockResolvedValue(undefined)
})

function makeReq() {
  return new Request('http://x', { method: 'POST' }) as any
}

function campaign(id: string, reviewState: string, name = `Campaign ${id}`) {
  return { id, orgId: 'org_1', name, status: 'PENDING_REVIEW', reviewState }
}

describe('POST /api/v1/portal/ads/campaigns/bulk-approve', () => {
  it('approves all awaiting campaigns', async () => {
    store.listCampaigns.mockResolvedValueOnce([
      campaign('cmp_1', 'awaiting'),
      campaign('cmp_2', 'awaiting'),
    ])

    const res = await POST(makeReq(), undefined, undefined, undefined, undefined)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.approved).toEqual(['cmp_1', 'cmp_2'])
    expect(body.data.failed).toEqual([])

    // updateCampaign called once per awaiting campaign (via setReviewState)
    expect(store.updateCampaign).toHaveBeenCalledTimes(2)
    expect(store.updateCampaign).toHaveBeenCalledWith(
      'cmp_1',
      expect.objectContaining({ reviewState: 'approved', approvedBy: 'uid_client' }),
    )
    expect(store.updateCampaign).toHaveBeenCalledWith(
      'cmp_2',
      expect.objectContaining({ reviewState: 'approved', approvedBy: 'uid_client' }),
    )

    // Activity + notification fired per approved campaign
    expect(activity.logCampaignActivity).toHaveBeenCalledTimes(2)
    expect(notifications.notifyCampaignApproved).toHaveBeenCalledTimes(2)
  })

  it('filters out non-awaiting campaigns — only awaiting ones get approved', async () => {
    store.listCampaigns.mockResolvedValueOnce([
      campaign('cmp_1', 'awaiting'),
      campaign('cmp_2', 'approved'), // already approved — should be skipped
    ])

    const res = await POST(makeReq(), undefined, undefined, undefined, undefined)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.approved).toEqual(['cmp_1'])
    expect(body.data.failed).toEqual([])
    expect(store.updateCampaign).toHaveBeenCalledTimes(1)
    expect(store.updateCampaign).toHaveBeenCalledWith('cmp_1', expect.any(Object))
  })

  it('isolates per-campaign failures — one fails, the other still approves', async () => {
    store.listCampaigns.mockResolvedValueOnce([
      campaign('cmp_fail', 'awaiting'),
      campaign('cmp_ok', 'awaiting'),
    ])
    // First updateCampaign call throws, second succeeds
    store.updateCampaign
      .mockRejectedValueOnce(new Error('firestore boom'))
      .mockResolvedValueOnce(undefined)

    const res = await POST(makeReq(), undefined, undefined, undefined, undefined)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.approved).toEqual(['cmp_ok'])
    expect(body.data.failed).toEqual([{ id: 'cmp_fail', error: 'firestore boom' }])

    // Notification + activity only for the one that succeeded
    expect(activity.logCampaignActivity).toHaveBeenCalledTimes(1)
    expect(notifications.notifyCampaignApproved).toHaveBeenCalledTimes(1)
  })

  it('returns empty arrays when zero campaigns are awaiting', async () => {
    store.listCampaigns.mockResolvedValueOnce([
      campaign('cmp_1', 'approved'),
      campaign('cmp_2', 'rejected'),
    ])

    const res = await POST(makeReq(), undefined, undefined, undefined, undefined)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.approved).toEqual([])
    expect(body.data.failed).toEqual([])
    expect(store.updateCampaign).not.toHaveBeenCalled()
    expect(activity.logCampaignActivity).not.toHaveBeenCalled()
    expect(notifications.notifyCampaignApproved).not.toHaveBeenCalled()
  })
})
