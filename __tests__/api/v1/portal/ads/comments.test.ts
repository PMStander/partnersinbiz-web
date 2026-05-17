// __tests__/api/v1/portal/ads/comments.test.ts
//
// Passthrough portal-auth mock — same shape as
// __tests__/app/api/v1/portal/ads/campaigns/approve.test.ts.

let _testUid = 'uid_client'
let _testOrgId = 'org_1'
let _testRole: string = 'member'

jest.mock('@/lib/auth/portal-middleware', () => ({
  withPortalAuthAndRole: (_minRole: string, handler: any) =>
    (req: any, _uid?: string, _orgId?: string, _role?: string, ctx?: any) =>
      handler(req, _testUid, _testOrgId, _testRole, ctx),
}))

jest.mock('@/lib/ads/ads/store', () => ({
  getAd: jest.fn(),
}))

jest.mock('@/lib/ads/comments', () => ({
  listComments: jest.fn(),
  createComment: jest.fn(),
  getComment: jest.fn(),
  updateComment: jest.fn(),
  deleteComment: jest.fn(),
}))

jest.mock('@/lib/activity/log', () => ({
  logActivity: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('firebase-admin/firestore', () => ({
  Timestamp: { now: jest.fn(() => ({ seconds: 1700000000, nanoseconds: 0 })) },
}))

import { GET, POST } from '@/app/api/v1/portal/ads/ads/[id]/comments/route'
import {
  PATCH,
  DELETE,
} from '@/app/api/v1/portal/ads/ads/[id]/comments/[commentId]/route'

const adsStore = jest.requireMock('@/lib/ads/ads/store')
const commentsStore = jest.requireMock('@/lib/ads/comments')
const activity = jest.requireMock('@/lib/activity/log')

beforeEach(() => {
  jest.clearAllMocks()
  _testUid = 'uid_client'
  _testOrgId = 'org_1'
  _testRole = 'member'
})

const baseAd = {
  id: 'ad_1',
  orgId: 'org_1',
  adSetId: 'ads_1',
  campaignId: 'cmp_1',
  name: 'My Ad',
  status: 'DRAFT',
}

function makeReq(method: string, body?: unknown) {
  return new Request('http://x', {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }) as any
}

function makeCtx(id = 'ad_1', commentId?: string) {
  return { params: Promise.resolve(commentId ? { id, commentId } : { id }) }
}

describe('GET /api/v1/portal/ads/ads/[id]/comments', () => {
  it('returns comments for the ad when tenant matches', async () => {
    adsStore.getAd.mockResolvedValueOnce(baseAd)
    commentsStore.listComments.mockResolvedValueOnce([{ id: 'cmt_1', text: 'hi' }])

    const res = await GET(makeReq('GET'), undefined, undefined, undefined, makeCtx())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toHaveLength(1)
    expect(commentsStore.listComments).toHaveBeenCalledWith({
      orgId: 'org_1',
      adId: 'ad_1',
    })
  })
})

describe('POST /api/v1/portal/ads/ads/[id]/comments', () => {
  it('creates a comment and logs ad.comment_added activity', async () => {
    adsStore.getAd.mockResolvedValueOnce(baseAd)
    commentsStore.createComment.mockResolvedValueOnce({
      id: 'cmt_new',
      orgId: 'org_1',
      adId: 'ad_1',
      text: 'Looks great',
    })

    const res = await POST(
      makeReq('POST', { text: 'Looks great' }),
      undefined,
      undefined,
      undefined,
      makeCtx(),
    )
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body.success).toBe(true)
    expect(commentsStore.createComment).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: 'org_1',
        adId: 'ad_1',
        authorUid: 'uid_client',
        text: 'Looks great',
      }),
    )
    expect(activity.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: 'org_1',
        type: 'ad.comment_added',
        entityType: 'ad',
        entityId: 'ad_1',
      }),
    )
  })

  it('returns 404 when the ad belongs to a different org (tenant isolation)', async () => {
    adsStore.getAd.mockResolvedValueOnce({ ...baseAd, orgId: 'org_other' })

    const res = await POST(
      makeReq('POST', { text: 'hi' }),
      undefined,
      undefined,
      undefined,
      makeCtx(),
    )

    expect(res.status).toBe(404)
    expect(commentsStore.createComment).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/v1/portal/ads/ads/[id]/comments/[commentId]', () => {
  it('rejects edits by a non-author non-admin (returns 403)', async () => {
    adsStore.getAd.mockResolvedValueOnce(baseAd)
    commentsStore.getComment.mockResolvedValueOnce({
      id: 'cmt_1',
      orgId: 'org_1',
      adId: 'ad_1',
      authorUid: 'someone_else',
      text: 'original',
      resolved: false,
    })

    const res = await PATCH(
      makeReq('PATCH', { text: 'hijack' }),
      undefined,
      undefined,
      undefined,
      makeCtx('ad_1', 'cmt_1'),
    )

    expect(res.status).toBe(403)
    expect(commentsStore.updateComment).not.toHaveBeenCalled()
  })

  it('allows the author to edit their own comment', async () => {
    adsStore.getAd.mockResolvedValueOnce(baseAd)
    commentsStore.getComment.mockResolvedValueOnce({
      id: 'cmt_1',
      orgId: 'org_1',
      adId: 'ad_1',
      authorUid: 'uid_client',
      text: 'original',
      resolved: false,
    })
    commentsStore.updateComment.mockResolvedValueOnce({
      id: 'cmt_1',
      text: 'edited',
      resolved: false,
    })

    const res = await PATCH(
      makeReq('PATCH', { text: 'edited' }),
      undefined,
      undefined,
      undefined,
      makeCtx('ad_1', 'cmt_1'),
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.text).toBe('edited')
    expect(commentsStore.updateComment).toHaveBeenCalledWith(
      'cmt_1',
      expect.objectContaining({ text: 'edited' }),
    )
  })
})

describe('DELETE /api/v1/portal/ads/ads/[id]/comments/[commentId]', () => {
  it('soft-deletes the comment when called by the author', async () => {
    adsStore.getAd.mockResolvedValueOnce(baseAd)
    commentsStore.getComment.mockResolvedValueOnce({
      id: 'cmt_1',
      orgId: 'org_1',
      adId: 'ad_1',
      authorUid: 'uid_client',
      text: 'will be deleted',
      resolved: false,
    })
    commentsStore.deleteComment.mockResolvedValueOnce(undefined)

    const res = await DELETE(
      makeReq('DELETE'),
      undefined,
      undefined,
      undefined,
      makeCtx('ad_1', 'cmt_1'),
    )

    expect(res.status).toBe(200)
    expect(commentsStore.deleteComment).toHaveBeenCalledWith('cmt_1')
  })
})
