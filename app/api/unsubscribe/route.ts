import { NextRequest, NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { verifyUnsubscribeToken } from '@/lib/email/unsubscribeToken'
import { syncUnsubscribeToIntegrations } from '@/lib/crm/integrations/syncOptOut'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')

  if (!token) {
    return new NextResponse(unsubscribePage('Invalid link', 'No contact token was provided.'), {
      status: 400,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  const verified = verifyUnsubscribeToken(token)
  if (!verified.ok) {
    return new NextResponse(unsubscribePage('Invalid link', 'This unsubscribe link is invalid or has expired.'), {
      status: 400,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }
  const contactId = verified.contactId
  const tokenCampaignId = verified.campaignId

  const docRef = adminDb.collection('contacts').doc(contactId)
  const doc = await docRef.get()

  if (!doc.exists) {
    return new NextResponse(unsubscribePage('Invalid link', 'We could not find your contact record.'), {
      status: 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  // Honor either the legacy boolean or the new timestamp signal as "already done"
  const data = doc.data() ?? {}
  const alreadyUnsubscribed = !!data.unsubscribed || !!data.unsubscribedAt
  if (alreadyUnsubscribed) {
    return new NextResponse(
      unsubscribePage('Already unsubscribed', 'You are already unsubscribed from our emails.'),
      { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    )
  }

  // 1. Mark the contact as unsubscribed
  await docRef.update({
    unsubscribed: true,
    unsubscribedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })

  // 2. Exit any active sequence enrollments for this contact and tally per-campaign hits
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const enrollSnap = await (adminDb.collection('sequence_enrollments') as any)
    .where('contactId', '==', contactId)
    .where('status', '==', 'active')
    .get()

  const campaignHits = new Map<string, number>()
  for (const eDoc of enrollSnap.docs) {
    const enrollment = eDoc.data() as { campaignId?: string }
    await eDoc.ref.update({
      status: 'exited',
      exitReason: 'unsubscribed',
      updatedAt: FieldValue.serverTimestamp(),
    })
    const cid = enrollment.campaignId ?? ''
    if (cid) campaignHits.set(cid, (campaignHits.get(cid) ?? 0) + 1)
  }

  // 3. Bump campaign.stats.unsubscribed for each affected campaign
  for (const [campaignId, hits] of campaignHits.entries()) {
    try {
      await adminDb.collection('campaigns').doc(campaignId).update({
        'stats.unsubscribed': FieldValue.increment(hits),
        updatedAt: FieldValue.serverTimestamp(),
      })
    } catch (err) {
      console.error('[unsubscribe] failed to bump campaign stats', campaignId, err)
    }
  }

  // 4. Propagate opt-out to CRM integrations (non-blocking)
  const orgId = (data.orgId as string | undefined) ?? ''
  if (orgId) {
    syncUnsubscribeToIntegrations(contactId, orgId).catch((err) =>
      console.error('[unsubscribe] opt-out sync failed', err)
    )
  }

  // 5. Resolve campaign/org names for campaign-aware confirmation page
  let campaignName: string | undefined
  let orgName: string | undefined

  if (tokenCampaignId) {
    try {
      const campSnap = await adminDb.collection('campaigns').doc(tokenCampaignId).get()
      if (campSnap.exists) {
        const campData = campSnap.data() as { name?: string; orgId?: string }
        campaignName = campData.name || undefined
        const campaignOrgId = campData.orgId
        if (campaignOrgId) {
          const orgSnap = await adminDb.collection('organizations').doc(campaignOrgId).get()
          if (orgSnap.exists) {
            orgName = (orgSnap.data() as { name?: string })?.name || undefined
          }
        }
      }
    } catch (err) {
      // Non-fatal — fall back to generic copy
      console.error('[unsubscribe] failed to resolve campaign/org for page', tokenCampaignId, err)
    }
  }

  const confirmMessage = campaignName && orgName
    ? `You have been successfully removed from ${campaignName} by ${orgName}. You will no longer receive emails from this campaign.`
    : campaignName
      ? `You have been successfully removed from ${campaignName}. You will no longer receive emails from this campaign.`
      : 'You have been successfully removed from our email list. You will no longer receive marketing emails from us.'

  return new NextResponse(
    unsubscribePage('You\'ve been unsubscribed', confirmMessage),
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  )
}

function unsubscribePage(heading: string, message: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${heading} — Partners in Biz</title>
</head>
<body style="margin:0;padding:0;background:#111;font-family:system-ui,-apple-system,sans-serif;">
  <div style="max-width:480px;margin:80px auto;padding:0 24px;text-align:center;">
    <div style="margin-bottom:32px;">
      <span style="color:#F59E0B;font-size:20px;font-weight:700;letter-spacing:-0.5px;">Partners in Biz</span>
    </div>
    <div style="background:#1A1A1A;border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:32px 24px;">
      <h1 style="color:#FAFAFA;font-size:18px;font-weight:600;margin:0 0 12px 0;">${heading}</h1>
      <p style="color:rgba(255,255,255,0.5);font-size:14px;line-height:1.6;margin:0;">${message}</p>
    </div>
    <p style="color:rgba(255,255,255,0.2);font-size:12px;margin-top:24px;">partnersinbiz.online</p>
  </div>
</body>
</html>`
}
