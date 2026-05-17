// lib/ads/notifications.ts
import { adminDb } from '@/lib/firebase/admin'
import { sendEmail } from '@/lib/email/send'
import { getOrgManagerEmails } from '@/lib/organizations/manager-emails'
import {
  campaignLaunchedEmail,
  campaignPausedEmail,
  capiErrorEmail,
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
