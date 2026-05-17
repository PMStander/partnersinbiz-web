// __tests__/lib/ads/notifications-push.test.ts
//
// Sub-2b Feature B — push notification fanout for ad-event helpers.
// Verifies that each notify helper:
//   1. Fires a push to the correct recipient set (PiB managers OR org members)
//   2. Failure of push does NOT prevent the email from being sent
//
// Mock layout mirrors __tests__/lib/ads/notifications.test.ts so the email
// path keeps its existing coverage there — this file is additive.

import {
  notifyCampaignLaunched,
  notifyCampaignPaused,
  notifyCapiError,
  notifyAwaitingReview,
  notifyCampaignApproved,
  notifyCampaignRejected,
} from '@/lib/ads/notifications'

// ─── Mocks ──────────────────────────────────────────────────────────────────

jest.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: jest.fn(),
  },
}))

jest.mock('@/lib/email/send', () => ({
  sendEmail: jest.fn().mockResolvedValue({ success: true }),
}))

jest.mock('@/lib/organizations/manager-emails', () => ({
  getOrgManagerEmails: jest.fn(),
}))

jest.mock('@/lib/notifications/push', () => ({
  sendPushToUser: jest.fn().mockResolvedValue({ attempted: 1, delivered: 1, pruned: 0 }),
}))

jest.mock('@/lib/email/templates/ad-events', () => ({
  campaignLaunchedEmail: jest.fn().mockReturnValue('<html>launched</html>'),
  campaignPausedEmail: jest.fn().mockReturnValue('<html>paused</html>'),
  capiErrorEmail: jest.fn().mockReturnValue('<html>capi</html>'),
  campaignAwaitingReviewEmail: jest.fn().mockReturnValue('<html>awaiting</html>'),
  campaignApprovedEmail: jest.fn().mockReturnValue('<html>approved</html>'),
  campaignRejectedEmail: jest.fn().mockReturnValue('<html>rejected</html>'),
}))

import { adminDb } from '@/lib/firebase/admin'
import { sendEmail } from '@/lib/email/send'
import { getOrgManagerEmails } from '@/lib/organizations/manager-emails'
import { sendPushToUser } from '@/lib/notifications/push'

const mockAdminDb = adminDb as jest.Mocked<typeof adminDb>
const mockSendEmail = sendEmail as jest.MockedFunction<typeof sendEmail>
const mockGetOrgManagerEmails = getOrgManagerEmails as jest.MockedFunction<typeof getOrgManagerEmails>
const mockSendPushToUser = sendPushToUser as jest.MockedFunction<typeof sendPushToUser>

// ─── Fixtures ───────────────────────────────────────────────────────────────

const PIB_ADMIN_UIDS = ['pib-admin-1', 'pib-admin-2']
const ORG_MEMBER_UIDS = ['member-1', 'member-2']

/**
 * Mock `adminDb.collection(name)` so:
 *   - collection('users').where('role','==','admin').get() → 2 PiB admin docs
 *     (one super-admin with no orgId, one scoped admin that gets filtered out)
 *   - collection('organizations').doc(orgId).get() → org doc with members +
 *     settings.notificationEmail
 *
 * Tests can override the org-doc behaviour per-test via `orgDocOverride`.
 */
function wireAdminDb(opts?: {
  notificationEmail?: string
  members?: Array<{ userId: string }>
  orgExists?: boolean
}) {
  const notificationEmail = opts?.notificationEmail ?? 'client@example.com'
  const members = opts?.members ?? ORG_MEMBER_UIDS.map((u) => ({ userId: u }))
  const orgExists = opts?.orgExists ?? true

  ;(mockAdminDb.collection as jest.Mock).mockImplementation((name: string) => {
    if (name === 'users') {
      return {
        where: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({
            docs: [
              // super-admin (no orgId) → included
              { id: 'pib-admin-1', data: () => ({ role: 'admin' }) },
              // super-admin (empty-string orgId) → included
              { id: 'pib-admin-2', data: () => ({ role: 'admin', orgId: '' }) },
              // restricted admin (scoped to one client) → excluded
              { id: 'restricted-admin', data: () => ({ role: 'admin', orgId: 'org_other' }) },
            ],
          }),
        }),
      }
    }
    if (name === 'organizations') {
      return {
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue({
            exists: orgExists,
            data: () => ({
              members,
              settings: notificationEmail ? { notificationEmail } : {},
            }),
          }),
        }),
      }
    }
    throw new Error(`unexpected collection: ${name}`)
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockSendPushToUser.mockResolvedValue({ attempted: 1, delivered: 1, pruned: 0 })
})

// ─── notifyCampaignLaunched ────────────────────────────────────────────────

describe('notifyCampaignLaunched — push fanout', () => {
  it('pushes to all PiB super-admin UIDs after email', async () => {
    wireAdminDb()

    await notifyCampaignLaunched({
      orgId: 'org_1',
      orgSlug: 'acme',
      campaignId: 'cmp_1',
      campaignName: 'Summer Sale',
      objective: 'TRAFFIC',
      actorName: 'Alice',
    })

    expect(mockSendPushToUser).toHaveBeenCalledTimes(PIB_ADMIN_UIDS.length)
    PIB_ADMIN_UIDS.forEach((uid) => {
      expect(mockSendPushToUser).toHaveBeenCalledWith(
        uid,
        expect.objectContaining({
          title: 'Campaign live: Summer Sale',
          body: 'Alice launched the campaign.',
          link: expect.stringContaining('/admin/org/acme/ads/campaigns/cmp_1'),
        }),
      )
    })
  })
})

// ─── notifyCampaignPaused ──────────────────────────────────────────────────

describe('notifyCampaignPaused — push fanout', () => {
  it('pushes to all PiB super-admin UIDs after email', async () => {
    wireAdminDb()
    mockGetOrgManagerEmails.mockResolvedValue(['m@pib.co'])

    await notifyCampaignPaused({
      orgId: 'org_1',
      orgSlug: 'acme',
      campaignId: 'cmp_1',
      campaignName: 'Summer Sale',
      reason: 'budget out',
      actorName: 'Bob',
    })

    expect(mockSendPushToUser).toHaveBeenCalledTimes(PIB_ADMIN_UIDS.length)
    PIB_ADMIN_UIDS.forEach((uid) => {
      expect(mockSendPushToUser).toHaveBeenCalledWith(
        uid,
        expect.objectContaining({
          title: 'Campaign paused: Summer Sale',
          body: 'Bob paused the campaign.',
        }),
      )
    })
  })
})

// ─── notifyCapiError ───────────────────────────────────────────────────────

describe('notifyCapiError — push fanout', () => {
  it('pushes to all PiB super-admin UIDs with error body', async () => {
    wireAdminDb()
    mockGetOrgManagerEmails.mockResolvedValue(['m@pib.co'])

    await notifyCapiError({
      orgId: 'org_1',
      orgSlug: 'acme',
      pixelConfigId: 'px_1',
      eventName: 'Purchase',
      error: 'Token expired',
      pixelName: 'Meta Pixel',
    })

    expect(mockSendPushToUser).toHaveBeenCalledTimes(PIB_ADMIN_UIDS.length)
    PIB_ADMIN_UIDS.forEach((uid) => {
      expect(mockSendPushToUser).toHaveBeenCalledWith(
        uid,
        expect.objectContaining({
          title: 'CAPI error: Meta Pixel',
          body: 'Token expired',
          link: expect.stringContaining('/admin/org/acme/ads/pixel-config'),
        }),
      )
    })
  })

  it('falls back to eventName when pixelName not provided', async () => {
    wireAdminDb()
    mockGetOrgManagerEmails.mockResolvedValue(['m@pib.co'])

    await notifyCapiError({
      orgId: 'org_1',
      orgSlug: 'acme',
      pixelConfigId: 'px_1',
      eventName: 'Purchase',
      error: 'Boom',
    })

    expect(mockSendPushToUser).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ title: 'CAPI error: Purchase' }),
    )
  })
})

// ─── notifyAwaitingReview ──────────────────────────────────────────────────

describe('notifyAwaitingReview — push fanout', () => {
  it('pushes to all org member UIDs (not PiB admins)', async () => {
    wireAdminDb()

    await notifyAwaitingReview({
      orgId: 'org_1',
      orgSlug: 'acme',
      campaignId: 'cmp_1',
      campaignName: 'Summer Sale',
      submittedByName: 'Carol',
    })

    expect(mockSendPushToUser).toHaveBeenCalledTimes(ORG_MEMBER_UIDS.length)
    ORG_MEMBER_UIDS.forEach((uid) => {
      expect(mockSendPushToUser).toHaveBeenCalledWith(
        uid,
        expect.objectContaining({
          title: 'Review needed: Summer Sale',
          body: 'Carol submitted a campaign for your approval.',
          link: expect.stringContaining('/portal/ads/campaigns/cmp_1'),
        }),
      )
    })
  })

  it('does not push to PiB admin UIDs', async () => {
    wireAdminDb()

    await notifyAwaitingReview({
      orgId: 'org_1',
      orgSlug: 'acme',
      campaignId: 'cmp_1',
      campaignName: 'Summer Sale',
      submittedByName: 'Carol',
    })

    const targetedUids = mockSendPushToUser.mock.calls.map((c) => c[0])
    expect(targetedUids).not.toContain('pib-admin-1')
    expect(targetedUids).not.toContain('pib-admin-2')
  })
})

// ─── notifyCampaignApproved ────────────────────────────────────────────────

describe('notifyCampaignApproved — push fanout', () => {
  it('pushes to all PiB super-admin UIDs after email', async () => {
    wireAdminDb()
    mockGetOrgManagerEmails.mockResolvedValue(['m@pib.co'])

    await notifyCampaignApproved({
      orgId: 'org_1',
      orgSlug: 'acme',
      campaignId: 'cmp_1',
      campaignName: 'Summer Sale',
      approvedByName: 'Dave',
    })

    expect(mockSendPushToUser).toHaveBeenCalledTimes(PIB_ADMIN_UIDS.length)
    PIB_ADMIN_UIDS.forEach((uid) => {
      expect(mockSendPushToUser).toHaveBeenCalledWith(
        uid,
        expect.objectContaining({
          title: 'Approved: Summer Sale',
          body: 'Dave approved the campaign.',
        }),
      )
    })
  })
})

// ─── notifyCampaignRejected ────────────────────────────────────────────────

describe('notifyCampaignRejected — push fanout', () => {
  it('pushes to all PiB super-admin UIDs with truncated reason', async () => {
    wireAdminDb()
    mockGetOrgManagerEmails.mockResolvedValue(['m@pib.co'])

    const longReason = 'A'.repeat(200)

    await notifyCampaignRejected({
      orgId: 'org_1',
      orgSlug: 'acme',
      campaignId: 'cmp_1',
      campaignName: 'Summer Sale',
      rejectedByName: 'Eve',
      reason: longReason,
    })

    expect(mockSendPushToUser).toHaveBeenCalledTimes(PIB_ADMIN_UIDS.length)
    PIB_ADMIN_UIDS.forEach((uid) => {
      expect(mockSendPushToUser).toHaveBeenCalledWith(
        uid,
        expect.objectContaining({
          title: 'Rejected: Summer Sale',
          // 80-char excerpt + '...' suffix
          body: `Eve: ${'A'.repeat(80)}...`,
        }),
      )
    })
  })

  it('does not append ellipsis when reason is short', async () => {
    wireAdminDb()
    mockGetOrgManagerEmails.mockResolvedValue(['m@pib.co'])

    await notifyCampaignRejected({
      orgId: 'org_1',
      orgSlug: 'acme',
      campaignId: 'cmp_1',
      campaignName: 'Summer Sale',
      rejectedByName: 'Eve',
      reason: 'Not on brand',
    })

    expect(mockSendPushToUser).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ body: 'Eve: Not on brand' }),
    )
  })
})

// ─── Resilience — push failure must not block email ────────────────────────

describe('push failure does not block email', () => {
  it('email still sends when sendPushToUser throws', async () => {
    wireAdminDb()
    mockGetOrgManagerEmails.mockResolvedValue(['m@pib.co'])
    mockSendPushToUser.mockRejectedValue(new Error('FCM unavailable'))

    await notifyCampaignApproved({
      orgId: 'org_1',
      orgSlug: 'acme',
      campaignId: 'cmp_1',
      campaignName: 'Summer Sale',
      approvedByName: 'Dave',
    })

    // Email went out despite push failures.
    expect(mockSendEmail).toHaveBeenCalledTimes(1)
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'm@pib.co',
        subject: '[PIB] Approved: Summer Sale',
      }),
    )
    // Push was attempted and rejected.
    expect(mockSendPushToUser).toHaveBeenCalled()
  })

  it('email still sends when adminDb lookup for push UIDs throws', async () => {
    ;(mockAdminDb.collection as jest.Mock).mockImplementation((name: string) => {
      if (name === 'organizations') {
        return {
          doc: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue({
              exists: true,
              data: () => ({
                settings: { notificationEmail: 'client@example.com' },
                members: [{ userId: 'm1' }],
              }),
            }),
          }),
        }
      }
      if (name === 'users') {
        // Make the users query blow up — push UID lookup must not bubble.
        return {
          where: jest.fn().mockReturnValue({
            get: jest.fn().mockRejectedValue(new Error('Firestore down')),
          }),
        }
      }
      throw new Error(`unexpected collection: ${name}`)
    })

    await notifyCampaignLaunched({
      orgId: 'org_1',
      orgSlug: 'acme',
      campaignId: 'cmp_1',
      campaignName: 'Summer Sale',
      objective: 'TRAFFIC',
      actorName: 'Alice',
    })

    // Email path completed cleanly.
    expect(mockSendEmail).toHaveBeenCalledTimes(1)
    // Push fanout swallowed the lookup error — sendPushToUser never invoked.
    expect(mockSendPushToUser).not.toHaveBeenCalled()
  })
})
