import {
  notifyCampaignLaunched,
  notifyCampaignPaused,
  notifyCapiError,
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

jest.mock('@/lib/email/templates/ad-events', () => ({
  campaignLaunchedEmail: jest.fn().mockReturnValue('<html>launched</html>'),
  campaignPausedEmail: jest.fn().mockReturnValue('<html>paused</html>'),
  capiErrorEmail: jest.fn().mockReturnValue('<html>capi</html>'),
}))

// ─── Helpers ─────────────────────────────────────────────────────────────────

import { adminDb } from '@/lib/firebase/admin'
import { sendEmail } from '@/lib/email/send'
import { getOrgManagerEmails } from '@/lib/organizations/manager-emails'

const mockAdminDb = adminDb as jest.Mocked<typeof adminDb>
const mockSendEmail = sendEmail as jest.MockedFunction<typeof sendEmail>
const mockGetOrgManagerEmails = getOrgManagerEmails as jest.MockedFunction<typeof getOrgManagerEmails>

function makeOrgDoc(notificationEmail?: string) {
  return {
    exists: true,
    data: () => ({
      settings: notificationEmail ? { notificationEmail } : {},
    }),
  }
}

function makeOrgCollection(notificationEmail?: string) {
  return {
    doc: jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue(makeOrgDoc(notificationEmail)),
    }),
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks()
})

describe('notifyCampaignLaunched', () => {
  it('happy path — sends email to org notificationEmail', async () => {
    ;(mockAdminDb.collection as jest.Mock).mockReturnValue(
      makeOrgCollection('owner@example.com'),
    )

    await notifyCampaignLaunched({
      orgId: 'org_1',
      orgSlug: 'acme',
      campaignId: 'cmp_1',
      campaignName: 'Summer Sale',
      objective: 'TRAFFIC',
    })

    expect(mockSendEmail).toHaveBeenCalledTimes(1)
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'owner@example.com',
        subject: '[PIB] Campaign launched: Summer Sale',
      }),
    )
  })

  it('does not throw when notificationEmail is missing', async () => {
    ;(mockAdminDb.collection as jest.Mock).mockReturnValue(
      makeOrgCollection(undefined),
    )

    await expect(
      notifyCampaignLaunched({
        orgId: 'org_1',
        orgSlug: 'acme',
        campaignId: 'cmp_1',
        campaignName: 'Summer Sale',
        objective: 'TRAFFIC',
      }),
    ).resolves.toBeUndefined()

    expect(mockSendEmail).not.toHaveBeenCalled()
  })
})

describe('notifyCampaignPaused', () => {
  it('happy path — sends email to all manager emails', async () => {
    mockGetOrgManagerEmails.mockResolvedValue([
      'manager1@pib.co',
      'manager2@pib.co',
    ])

    await notifyCampaignPaused({
      orgId: 'org_1',
      orgSlug: 'acme',
      campaignId: 'cmp_1',
      campaignName: 'Summer Sale',
      reason: 'budget exhausted',
    })

    expect(mockSendEmail).toHaveBeenCalledTimes(2)
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'manager1@pib.co',
        subject: '[PIB] Campaign paused: Summer Sale',
      }),
    )
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'manager2@pib.co',
        subject: '[PIB] Campaign paused: Summer Sale',
      }),
    )
  })

  it('does not throw when no manager emails exist', async () => {
    mockGetOrgManagerEmails.mockResolvedValue([])

    await expect(
      notifyCampaignPaused({
        orgId: 'org_1',
        orgSlug: 'acme',
        campaignId: 'cmp_1',
        campaignName: 'Summer Sale',
      }),
    ).resolves.toBeUndefined()

    expect(mockSendEmail).not.toHaveBeenCalled()
  })
})

describe('notifyCapiError', () => {
  it('happy path — sends CAPI error email to manager emails', async () => {
    mockGetOrgManagerEmails.mockResolvedValue(['manager@pib.co'])

    await notifyCapiError({
      orgId: 'org_1',
      orgSlug: 'acme',
      pixelConfigId: 'px_1',
      eventName: 'Purchase',
      error: 'Token expired',
    })

    expect(mockSendEmail).toHaveBeenCalledTimes(1)
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'manager@pib.co',
        subject: '[PIB] CAPI failure: Purchase',
      }),
    )
  })
})
