/**
 * GET /api/cron/emails — process scheduled emails due now
 *
 * Secured by Authorization: Bearer ${CRON_SECRET}
 * Vercel cron schedule: every 15 minutes  (see vercel.json)
 *
 * For each email where status == "scheduled" AND scheduledFor <= now:
 *   1. Resolve sender (campaign-aware) and interpolate template vars
 *   2. Send via Resend (sendCampaignEmail)
 *   3. Update status to "sent", set sentAt, resendId, from
 *   4. If campaign-linked, increment campaign.stats.sent
 *   5. Log email_sent activity on linked contact (if contactId set)
 */
import { NextRequest, NextResponse } from 'next/server'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { sendCampaignEmail } from '@/lib/email/resend'
import { resolveFrom } from '@/lib/email/resolveFrom'
import { interpolate, varsFromContact } from '@/lib/email/template'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authHeader = req.headers.get('authorization') ?? ''
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = Timestamp.now()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const snapshot = await (adminDb.collection('emails') as any)
    .where('status', '==', 'scheduled')
    .where('scheduledFor', '<=', now)
    .get()

  let processed = 0

  for (const docSnap of snapshot.docs) {
    try {
      const email = docSnap.data() as {
        to: string
        from: string
        cc: string[]
        subject: string
        bodyHtml: string
        bodyText: string
        contactId: string
        sequenceId: string
        orgId?: string
        campaignId?: string
        fromDomainId?: string
      }

      const orgId = email.orgId ?? ''
      const campaignId = email.campaignId ?? ''

      // Look up org for fallback display name
      let orgName = ''
      if (orgId) {
        const orgSnap = await adminDb.collection('organizations').doc(orgId).get()
        if (orgSnap.exists) {
          orgName = (orgSnap.data() as { name?: string })?.name ?? ''
        }
      }

      // If campaign-linked, use campaign sender fields
      type CampaignLite = {
        fromDomainId?: string
        fromName?: string
        fromLocal?: string
        replyTo?: string
      }
      let campaign: CampaignLite | null = null
      if (campaignId) {
        const campSnap = await adminDb.collection('campaigns').doc(campaignId).get()
        if (campSnap.exists) {
          campaign = (campSnap.data() ?? null) as CampaignLite | null
        }
      }

      const resolved = campaign
        ? await resolveFrom({
            fromDomainId: campaign.fromDomainId,
            fromName: campaign.fromName,
            fromLocal: campaign.fromLocal,
            orgName,
          })
        : await resolveFrom({
            fromDomainId: email.fromDomainId,
            orgName,
          })

      // Build template variables and interpolate
      let vars: Record<string, string | number | undefined> = { orgName }
      if (email.contactId) {
        const contactSnap = await adminDb.collection('contacts').doc(email.contactId).get()
        if (contactSnap.exists) {
          vars = { ...varsFromContact(contactSnap.data()!), orgName }
        }
      }

      const subject = interpolate(email.subject ?? '', vars)
      const bodyHtml = interpolate(email.bodyHtml ?? '', vars)
      const bodyText = interpolate(email.bodyText ?? '', vars)

      const sendResult = await sendCampaignEmail({
        from: resolved.from,
        to: email.to,
        cc: email.cc,
        replyTo: campaign?.replyTo,
        subject,
        html: bodyHtml,
        text: bodyText,
      })

      if (!sendResult.ok) {
        await adminDb.collection('emails').doc(docSnap.id).update({
          status: 'failed',
          from: resolved.from,
        })
        continue
      }

      await adminDb.collection('emails').doc(docSnap.id).update({
        status: 'sent',
        from: resolved.from,
        resendId: sendResult.resendId,
        sentAt: FieldValue.serverTimestamp(),
      })

      if (campaignId) {
        await adminDb.collection('campaigns').doc(campaignId).update({
          'stats.sent': FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp(),
        })
      }

      if (email.contactId && orgId) {
        await adminDb.collection('activities').add({
          orgId,
          contactId: email.contactId,
          dealId: '',
          type: 'email_sent',
          summary: `Email sent: ${subject}`,
          metadata: { emailId: docSnap.id, to: email.to, campaignId },
          createdBy: 'cron',
          createdAt: FieldValue.serverTimestamp(),
        })
      }

      processed++
    } catch (err) {
      console.error('[cron/emails] email failed', docSnap.id, err)
    }
  }

  return NextResponse.json({ success: true, data: { processed } })
}
