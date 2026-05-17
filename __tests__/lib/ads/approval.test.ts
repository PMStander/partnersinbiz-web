// __tests__/lib/ads/approval.test.ts

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockUpdateCampaign = jest.fn().mockResolvedValue(undefined)

jest.mock('@/lib/ads/campaigns/store', () => ({
  updateCampaign: (...args: unknown[]) => mockUpdateCampaign(...args),
}))

const mockTimestampNow = jest.fn().mockReturnValue({ seconds: 1716000000, nanoseconds: 0 })
const mockArrayUnion = jest.fn((...items: unknown[]) => ({ __arrayUnion: items }))

jest.mock('firebase-admin/firestore', () => ({
  Timestamp: {
    now: (...args: unknown[]) => mockTimestampNow(...args),
  },
  FieldValue: {
    arrayUnion: (...args: unknown[]) => mockArrayUnion(...args),
  },
}))

// ─── Subject ─────────────────────────────────────────────────────────────────

import { setReviewState } from '@/lib/ads/approval'

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks()
  mockTimestampNow.mockReturnValue({ seconds: 1716000000, nanoseconds: 0 })
  mockArrayUnion.mockImplementation((...items: unknown[]) => ({ __arrayUnion: items }))
  mockUpdateCampaign.mockResolvedValue(undefined)
})

describe('setReviewState — submitted (DRAFT → PENDING_REVIEW + awaiting)', () => {
  it('writes status PENDING_REVIEW + reviewState awaiting + appends submitted entry', async () => {
    await setReviewState({
      campaignId: 'cmp_abc',
      newStatus: 'PENDING_REVIEW',
      newReviewState: 'awaiting',
      actorUid: 'admin_uid_1',
      actorRole: 'admin',
      entryState: 'submitted',
      extraFields: {
        submittedForReviewBy: 'admin_uid_1',
      },
    })

    expect(mockUpdateCampaign).toHaveBeenCalledTimes(1)

    const [campaignId, patch] = mockUpdateCampaign.mock.calls[0]
    expect(campaignId).toBe('cmp_abc')
    expect(patch.status).toBe('PENDING_REVIEW')
    expect(patch.reviewState).toBe('awaiting')
    expect(patch.submittedForReviewBy).toBe('admin_uid_1')

    // arrayUnion should have been called with the entry
    expect(mockArrayUnion).toHaveBeenCalledTimes(1)
    const [entry] = mockArrayUnion.mock.calls[0]
    expect(entry).toMatchObject({
      state: 'submitted',
      actorUid: 'admin_uid_1',
      actorRole: 'admin',
      at: { seconds: 1716000000, nanoseconds: 0 },
    })
    expect(entry.reason).toBeUndefined()
  })
})

describe('setReviewState — approved (PENDING_REVIEW stays + reviewState approved)', () => {
  it('appends approved entry + sets reviewState approved', async () => {
    await setReviewState({
      campaignId: 'cmp_abc',
      newStatus: 'PENDING_REVIEW',
      newReviewState: 'approved',
      actorUid: 'portal_uid_1',
      actorRole: 'member',
      entryState: 'approved',
      extraFields: {
        approvedBy: 'portal_uid_1',
      },
    })

    expect(mockUpdateCampaign).toHaveBeenCalledTimes(1)

    const [campaignId, patch] = mockUpdateCampaign.mock.calls[0]
    expect(campaignId).toBe('cmp_abc')
    expect(patch.status).toBe('PENDING_REVIEW')
    expect(patch.reviewState).toBe('approved')
    expect(patch.approvedBy).toBe('portal_uid_1')

    expect(mockArrayUnion).toHaveBeenCalledTimes(1)
    const [entry] = mockArrayUnion.mock.calls[0]
    expect(entry).toMatchObject({
      state: 'approved',
      actorUid: 'portal_uid_1',
      actorRole: 'member',
      at: { seconds: 1716000000, nanoseconds: 0 },
    })
    expect(entry.reason).toBeUndefined()
  })
})

describe('setReviewState — rejected (PENDING_REVIEW → DRAFT + reviewState rejected + reason)', () => {
  it('appends rejected entry with reason + sets reviewState rejected + flips status to DRAFT', async () => {
    const reason = 'The headline copy does not reflect our brand voice. Please revise.'

    await setReviewState({
      campaignId: 'cmp_abc',
      newStatus: 'DRAFT',
      newReviewState: 'rejected',
      actorUid: 'portal_uid_2',
      actorRole: 'owner',
      entryState: 'rejected',
      reason,
      extraFields: {
        rejectedBy: 'portal_uid_2',
        rejectionReason: reason,
      },
    })

    expect(mockUpdateCampaign).toHaveBeenCalledTimes(1)

    const [campaignId, patch] = mockUpdateCampaign.mock.calls[0]
    expect(campaignId).toBe('cmp_abc')
    expect(patch.status).toBe('DRAFT')
    expect(patch.reviewState).toBe('rejected')
    expect(patch.rejectedBy).toBe('portal_uid_2')
    expect(patch.rejectionReason).toBe(reason)

    expect(mockArrayUnion).toHaveBeenCalledTimes(1)
    const [entry] = mockArrayUnion.mock.calls[0]
    expect(entry).toMatchObject({
      state: 'rejected',
      actorUid: 'portal_uid_2',
      actorRole: 'owner',
      reason,
      at: { seconds: 1716000000, nanoseconds: 0 },
    })
  })
})
