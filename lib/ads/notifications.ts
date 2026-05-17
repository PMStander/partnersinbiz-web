// lib/ads/notifications.ts
import { adminDb } from '@/lib/firebase/admin'
import { sendEmail } from '@/lib/email/send'
import { getOrgManagerEmails } from '@/lib/organizations/manager-emails'
import {
  campaignLaunchedEmail,
  campaignPausedEmail,
  capiErrorEmail,
  campaignAwaitingReviewEmail,
  campaignApprovedEmail,
  campaignRejectedEmail,
} from '@/lib/email/templates/ad-events'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://partnersinbiz.online'

export async function notifyCampaignLaunched(args: {
  orgId: string
  orgSlug: string
  campaignId: string
  campaignName: string
  objective: string
}): Promise<void> {
  try {
    const orgDoc = await adminDb.collection('organizations').doc(args.orgId).get()
    if (!orgDoc.exists) return
    const notifEmail = orgDoc.data()?.settings?.notificationEmail
    if (!notifEmail) return
    const html = campaignLaunchedEmail(
      args.campaignName,
      args.objective,
      `${BASE_URL}/admin/org/${args.orgSlug}/ads/campaigns/${args.campaignId}`,
    )
    await sendEmail({
      to: notifEmail,
      subject: `[PIB] Campaign launched: ${args.campaignName}`,
      html,
    })
  } catch (err) {
    console.error('[Notify Ads] Campaign launched email failed:', err)
  }
}

export async function notifyCampaignPaused(args: {
  orgId: string
  orgSlug: string
  campaignId: string
  campaignName: string
  reason?: string
}): Promise<void> {
  try {
    const managerEmails = await getOrgManagerEmails(args.orgId)
    if (managerEmails.length === 0) return
    const html = campaignPausedEmail(
      args.campaignName,
      args.reason ?? 'paused via admin',
      `${BASE_URL}/admin/org/${args.orgSlug}/ads/campaigns/${args.campaignId}`,
    )
    await Promise.all(
      managerEmails.map((email) =>
        sendEmail({
          to: email,
          subject: `[PIB] Campaign paused: ${args.campaignName}`,
          html,
        }),
      ),
    )
  } catch (err) {
    console.error('[Notify Ads] Campaign paused email failed:', err)
  }
}

export async function notifyCapiError(args: {
  orgId: string
  orgSlug: string
  pixelConfigId: string
  eventName: string
  error: string
}): Promise<void> {
  try {
    const managerEmails = await getOrgManagerEmails(args.orgId)
    if (managerEmails.length === 0) return
    const html = capiErrorEmail(
      args.eventName,
      args.error,
      `${BASE_URL}/admin/org/${args.orgSlug}/ads/pixel-config`,
    )
    await Promise.all(
      managerEmails.map((email) =>
        sendEmail({
          to: email,
          subject: `[PIB] CAPI failure: ${args.eventName}`,
          html,
        }),
      ),
    )
  } catch (err) {
    console.error('[Notify Ads] CAPI error email failed:', err)
  }
}

export async function notifyAwaitingReview(args: {
  orgId: string
  orgSlug: string
  campaignId: string
  campaignName: string
  submittedByName: string
}): Promise<void> {
  try {
    const orgDoc = await adminDb.collection('organizations').doc(args.orgId).get()
    if (!orgDoc.exists) return
    const notifEmail = orgDoc.data()?.settings?.notificationEmail
    if (!notifEmail) return
    const html = campaignAwaitingReviewEmail(
      args.campaignName,
      args.submittedByName,
      `${BASE_URL}/portal/ads/campaigns/${args.campaignId}`,
    )
    await sendEmail({
      to: notifEmail,
      subject: `[PIB] Review needed: ${args.campaignName}`,
      html,
    })
  } catch (err) {
    console.error('[Notify Ads] Awaiting-review email failed:', err)
  }
}

export async function notifyCampaignApproved(args: {
  orgId: string
  orgSlug: string
  campaignId: string
  campaignName: string
  approvedByName: string
}): Promise<void> {
  try {
    const managerEmails = await getOrgManagerEmails(args.orgId)
    if (managerEmails.length === 0) return
    const html = campaignApprovedEmail(
      args.campaignName,
      args.approvedByName,
      `${BASE_URL}/admin/org/${args.orgSlug}/ads/campaigns/${args.campaignId}`,
    )
    await Promise.all(
      managerEmails.map((email) =>
        sendEmail({
          to: email,
          subject: `[PIB] Approved: ${args.campaignName}`,
          html,
        }),
      ),
    )
  } catch (err) {
    console.error('[Notify Ads] Approved email failed:', err)
  }
}

export async function notifyCampaignRejected(args: {
  orgId: string
  orgSlug: string
  campaignId: string
  campaignName: string
  rejectedByName: string
  reason: string
}): Promise<void> {
  try {
    const managerEmails = await getOrgManagerEmails(args.orgId)
    if (managerEmails.length === 0) return
    const html = campaignRejectedEmail(
      args.campaignName,
      args.rejectedByName,
      args.reason,
      `${BASE_URL}/admin/org/${args.orgSlug}/ads/campaigns/${args.campaignId}`,
    )
    await Promise.all(
      managerEmails.map((email) =>
        sendEmail({
          to: email,
          subject: `[PIB] Rejected: ${args.campaignName}`,
          html,
        }),
      ),
    )
  } catch (err) {
    console.error('[Notify Ads] Rejected email failed:', err)
  }
}
