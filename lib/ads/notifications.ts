// lib/ads/notifications.ts
import { adminDb } from '@/lib/firebase/admin'
import { sendEmail } from '@/lib/email/send'
import { getOrgManagerEmails } from '@/lib/organizations/manager-emails'
import { sendPushToUser } from '@/lib/notifications/push'
import {
  campaignLaunchedEmail,
  campaignPausedEmail,
  capiErrorEmail,
  campaignAwaitingReviewEmail,
  campaignApprovedEmail,
  campaignRejectedEmail,
} from '@/lib/email/templates/ad-events'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://partnersinbiz.online'

// ─── Push fanout helpers ────────────────────────────────────────────────────
//
// Push tokens live in the `pushTokens/{tokenHash}` collection keyed by uid.
// `sendPushToUser(uid, payload)` resolves all tokens for that uid internally,
// so callers only need to produce a list of recipient UIDs.

/**
 * Get UIDs of client-side users in an org (owners, admins, members, viewers
 * present in `organizations/{orgId}.members`). Used for portal-facing pushes
 * (e.g. "Review needed").
 */
async function getOrgClientUids(orgId: string): Promise<string[]> {
  try {
    const orgDoc = await adminDb.collection('organizations').doc(orgId).get()
    if (!orgDoc.exists) return []
    const members = (orgDoc.data()?.members ?? []) as Array<{ userId?: string }>
    return [...new Set(members.map((m) => m?.userId).filter((u): u is string => Boolean(u)))]
  } catch (err) {
    console.error('[Notify Ads] getOrgClientUids failed:', err)
    return []
  }
}

/**
 * Get UIDs of PiB platform super-admins. Mirrors the criteria used elsewhere
 * (see `app/api/v1/orgs/[orgId]/contacts/route.ts`): `users` where
 * `role === 'admin'` and `orgId` is empty/missing (i.e. not scoped to one org).
 */
async function getPibManagerUids(): Promise<string[]> {
  try {
    const snap = await adminDb.collection('users').where('role', '==', 'admin').get()
    return snap.docs
      .filter((d) => {
        const orgId = (d.data() as { orgId?: string | null }).orgId
        return orgId === undefined || orgId === null || orgId === ''
      })
      .map((d) => d.id)
  } catch (err) {
    console.error('[Notify Ads] getPibManagerUids failed:', err)
    return []
  }
}

/**
 * Fire-and-forget push fanout. Wrapped so failure of any push (or the entire
 * lookup) never bubbles up to the caller — email always wins.
 */
async function fanoutPush(
  uids: string[],
  payload: { title: string; body: string; link: string },
): Promise<void> {
  await Promise.all(
    uids.map((uid) =>
      sendPushToUser(uid, payload).catch((err) =>
        console.error(`[Notify Ads] Push to ${uid} failed:`, err),
      ),
    ),
  )
}

export async function notifyCampaignLaunched(args: {
  orgId: string
  orgSlug: string
  campaignId: string
  campaignName: string
  objective: string
  actorName?: string
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

  // Push fanout — additive, never blocks email above.
  try {
    const uids = await getPibManagerUids()
    await fanoutPush(uids, {
      title: `Campaign live: ${args.campaignName}`,
      body: `${args.actorName ?? 'A team member'} launched the campaign.`,
      link: `${BASE_URL}/admin/org/${args.orgSlug}/ads/campaigns/${args.campaignId}`,
    })
  } catch (err) {
    console.error('[Notify Ads] Campaign launched push fanout failed:', err)
  }
}

export async function notifyCampaignPaused(args: {
  orgId: string
  orgSlug: string
  campaignId: string
  campaignName: string
  reason?: string
  actorName?: string
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

  // Push fanout — additive, never blocks email above.
  try {
    const uids = await getPibManagerUids()
    await fanoutPush(uids, {
      title: `Campaign paused: ${args.campaignName}`,
      body: `${args.actorName ?? 'A team member'} paused the campaign.`,
      link: `${BASE_URL}/admin/org/${args.orgSlug}/ads/campaigns/${args.campaignId}`,
    })
  } catch (err) {
    console.error('[Notify Ads] Campaign paused push fanout failed:', err)
  }
}

export async function notifyCapiError(args: {
  orgId: string
  orgSlug: string
  pixelConfigId: string
  eventName: string
  error: string
  pixelName?: string
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

  // Push fanout — additive, never blocks email above.
  try {
    const uids = await getPibManagerUids()
    await fanoutPush(uids, {
      title: `CAPI error: ${args.pixelName ?? args.eventName}`,
      body: args.error.slice(0, 140),
      link: `${BASE_URL}/admin/org/${args.orgSlug}/ads/pixel-config`,
    })
  } catch (err) {
    console.error('[Notify Ads] CAPI error push fanout failed:', err)
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

  // Push fanout — additive, never blocks email above.
  // Awaiting-review fires INTO the client portal, so targets org members.
  try {
    const uids = await getOrgClientUids(args.orgId)
    await fanoutPush(uids, {
      title: `Review needed: ${args.campaignName}`,
      body: `${args.submittedByName} submitted a campaign for your approval.`,
      link: `${BASE_URL}/portal/ads/campaigns/${args.campaignId}`,
    })
  } catch (err) {
    console.error('[Notify Ads] Awaiting-review push fanout failed:', err)
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

  // Push fanout — additive, never blocks email above.
  try {
    const uids = await getPibManagerUids()
    await fanoutPush(uids, {
      title: `Approved: ${args.campaignName}`,
      body: `${args.approvedByName} approved the campaign.`,
      link: `${BASE_URL}/admin/org/${args.orgSlug}/ads/campaigns/${args.campaignId}`,
    })
  } catch (err) {
    console.error('[Notify Ads] Approved push fanout failed:', err)
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

  // Push fanout — additive, never blocks email above.
  try {
    const uids = await getPibManagerUids()
    const reasonExcerpt = args.reason.length > 80
      ? `${args.reason.slice(0, 80)}...`
      : args.reason
    await fanoutPush(uids, {
      title: `Rejected: ${args.campaignName}`,
      body: `${args.rejectedByName}: ${reasonExcerpt}`,
      link: `${BASE_URL}/admin/org/${args.orgSlug}/ads/campaigns/${args.campaignId}`,
    })
  } catch (err) {
    console.error('[Notify Ads] Rejected push fanout failed:', err)
  }
}
