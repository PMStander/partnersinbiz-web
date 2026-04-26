/**
 * Tests for the two-stage approval state machine.
 *
 * approval.ts imports adminDb at the top level (for getOrgApprovalSettings),
 * so we have to mock '@/lib/firebase/admin' even though the pure helpers
 * we're testing here don't touch Firestore.
 */
jest.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: jest.fn(),
  },
}))

import {
  resolveSubmitStatus,
  resolveAfterQaApproval,
  resolveAfterFinalApproval,
  validateTransition,
  needsAction,
  emptyApprovalState,
  VAULT_VISIBLE_STATUSES,
  CLIENT_REVIEW_STATUSES,
} from '@/lib/social/approval'
import type { PostStatus } from '@/lib/social/providers'

describe('resolveSubmitStatus', () => {
  it('returns "approved" when requiresApproval is false', () => {
    expect(
      resolveSubmitStatus({ requiresApproval: false, requiresQa: true, requiresClient: true }),
    ).toBe('approved')
  })

  it('returns "qa_review" when requiresApproval=true and requiresQa=true', () => {
    expect(
      resolveSubmitStatus({ requiresApproval: true, requiresQa: true, requiresClient: true }),
    ).toBe('qa_review')
  })

  it('returns "client_review" when requiresApproval=true, requiresQa=false, requiresClient=true', () => {
    expect(
      resolveSubmitStatus({ requiresApproval: true, requiresQa: false, requiresClient: true }),
    ).toBe('client_review')
  })

  it('returns "approved" when no review stage is required', () => {
    expect(
      resolveSubmitStatus({ requiresApproval: true, requiresQa: false, requiresClient: false }),
    ).toBe('approved')
  })
})

describe('resolveAfterQaApproval', () => {
  it('returns "client_review" when client review is required', () => {
    expect(resolveAfterQaApproval(true)).toBe('client_review')
  })

  it('returns "approved" when client review is not required', () => {
    expect(resolveAfterQaApproval(false)).toBe('approved')
  })
})

describe('resolveAfterFinalApproval', () => {
  it('auto_publish + scheduled -> "scheduled"', () => {
    expect(resolveAfterFinalApproval({ deliveryMode: 'auto_publish', hasScheduledAt: true })).toBe('scheduled')
  })

  it('auto_publish + no schedule -> "approved"', () => {
    expect(resolveAfterFinalApproval({ deliveryMode: 'auto_publish', hasScheduledAt: false })).toBe('approved')
  })

  it('download_only + scheduled -> "vaulted"', () => {
    expect(resolveAfterFinalApproval({ deliveryMode: 'download_only', hasScheduledAt: true })).toBe('vaulted')
  })

  it('download_only + no schedule -> "vaulted"', () => {
    expect(resolveAfterFinalApproval({ deliveryMode: 'download_only', hasScheduledAt: false })).toBe('vaulted')
  })

  it('both + scheduled -> "scheduled"', () => {
    expect(resolveAfterFinalApproval({ deliveryMode: 'both', hasScheduledAt: true })).toBe('scheduled')
  })

  it('both + no schedule -> "vaulted"', () => {
    expect(resolveAfterFinalApproval({ deliveryMode: 'both', hasScheduledAt: false })).toBe('vaulted')
  })
})

describe('validateTransition — happy paths', () => {
  it('submit from draft is allowed', () => {
    expect(validateTransition('draft', 'submit')).toBeNull()
  })

  it('qa_approve from qa_review is allowed', () => {
    expect(validateTransition('qa_review', 'qa_approve')).toBeNull()
  })

  it('qa_reject from qa_review is allowed', () => {
    expect(validateTransition('qa_review', 'qa_reject')).toBeNull()
  })

  it('client_approve from client_review is allowed', () => {
    expect(validateTransition('client_review', 'client_approve')).toBeNull()
  })

  it('client_approve from legacy pending_approval is allowed', () => {
    expect(validateTransition('pending_approval', 'client_approve')).toBeNull()
  })

  it('client_reject from client_review is allowed', () => {
    expect(validateTransition('client_review', 'client_reject')).toBeNull()
  })

  it('regenerate_start from qa_review is allowed', () => {
    expect(validateTransition('qa_review', 'regenerate_start')).toBeNull()
  })

  it('regenerate_start from client_review is allowed', () => {
    expect(validateTransition('client_review', 'regenerate_start')).toBeNull()
  })

  it('regenerate_start from pending_approval is allowed', () => {
    expect(validateTransition('pending_approval', 'regenerate_start')).toBeNull()
  })

  it('regenerate_complete from regenerating is allowed', () => {
    expect(validateTransition('regenerating', 'regenerate_complete')).toBeNull()
  })
})

describe('validateTransition — invalid from states', () => {
  it('submit from "published" returns an error string', () => {
    const err = validateTransition('published', 'submit')
    expect(typeof err).toBe('string')
    expect(err).toMatch(/Cannot submit/)
  })

  it('submit from "approved" returns an error string', () => {
    expect(validateTransition('approved', 'submit')).toMatch(/must be draft/)
  })

  it('qa_approve from draft returns an error string', () => {
    expect(validateTransition('draft', 'qa_approve')).toMatch(/must be qa_review/)
  })

  it('qa_reject from approved returns an error string', () => {
    expect(validateTransition('approved', 'qa_reject')).toMatch(/must be qa_review/)
  })

  it('client_approve from draft returns an error string', () => {
    expect(validateTransition('draft', 'client_approve')).toMatch(/must be client_review/)
  })

  it('client_reject from qa_review returns an error string', () => {
    expect(validateTransition('qa_review', 'client_reject')).toMatch(/must be client_review/)
  })

  it('regenerate_start from draft returns an error string', () => {
    expect(validateTransition('draft', 'regenerate_start')).toMatch(/must be qa_review or client_review/)
  })

  it('regenerate_start from published returns an error string', () => {
    expect(validateTransition('published', 'regenerate_start')).toMatch(/Cannot regenerate/)
  })

  it('regenerate_complete from anything but regenerating returns an error', () => {
    expect(validateTransition('qa_review', 'regenerate_complete')).toMatch(/Cannot complete regeneration/)
    expect(validateTransition('approved', 'regenerate_complete')).toMatch(/Cannot complete regeneration/)
  })
})

describe('needsAction', () => {
  it('admin needs to action qa_review', () => {
    expect(needsAction('qa_review', 'admin')).toBe(true)
  })

  it('admin needs to action regenerating', () => {
    expect(needsAction('regenerating', 'admin')).toBe(true)
  })

  it('admin does not need to action client_review', () => {
    expect(needsAction('client_review', 'admin')).toBe(false)
  })

  it('admin does not need to action draft / approved / published', () => {
    expect(needsAction('draft', 'admin')).toBe(false)
    expect(needsAction('approved', 'admin')).toBe(false)
    expect(needsAction('published', 'admin')).toBe(false)
  })

  it('client needs to action client_review', () => {
    expect(needsAction('client_review', 'client')).toBe(true)
  })

  it('client needs to action legacy pending_approval', () => {
    expect(needsAction('pending_approval', 'client')).toBe(true)
  })

  it('client does not need to action qa_review', () => {
    expect(needsAction('qa_review', 'client')).toBe(false)
  })

  it('client does not need to action approved or draft', () => {
    expect(needsAction('approved', 'client')).toBe(false)
    expect(needsAction('draft', 'client')).toBe(false)
  })

  it('ai needs to action regenerating', () => {
    expect(needsAction('regenerating', 'ai')).toBe(true)
  })

  it('ai does not need to action qa_review or client_review', () => {
    expect(needsAction('qa_review', 'ai')).toBe(false)
    expect(needsAction('client_review', 'ai')).toBe(false)
  })

  it('ai does not need to action terminal states', () => {
    expect(needsAction('approved', 'ai')).toBe(false)
    expect(needsAction('published', 'ai')).toBe(false)
    expect(needsAction('failed', 'ai')).toBe(false)
  })
})

describe('emptyApprovalState', () => {
  it('returns the expected zero-value shape', () => {
    expect(emptyApprovalState()).toEqual({
      qaApprovedBy: null,
      qaApprovedAt: null,
      clientApprovedBy: null,
      clientApprovedAt: null,
      rejectionCount: 0,
      regenerationCount: 0,
      lastRejectionStage: null,
      lastRejectedAt: null,
      history: [],
    })
  })

  it('returns a fresh object on each call (no shared history array)', () => {
    const a = emptyApprovalState()
    const b = emptyApprovalState()
    a.history.push({
      stage: 'qa',
      reason: 'x',
      rejectedBy: 'u',
      rejectedByName: 'U',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rejectedAt: null as any,
      resolved: false,
    })
    expect(b.history).toHaveLength(0)
  })
})

describe('exported status constant', () => {
  it('VAULT_VISIBLE_STATUSES contains the expected statuses', () => {
    const expected: PostStatus[] = ['approved', 'vaulted', 'scheduled', 'publishing', 'published', 'partially_published']
    expect(VAULT_VISIBLE_STATUSES).toEqual(expected)
  })

  it('CLIENT_REVIEW_STATUSES treats legacy pending_approval as equivalent', () => {
    expect(CLIENT_REVIEW_STATUSES).toContain('client_review')
    expect(CLIENT_REVIEW_STATUSES).toContain('pending_approval')
  })
})
