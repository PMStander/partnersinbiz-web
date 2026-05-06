/**
 * POST /api/v1/email/webhook — Resend webhook receiver
 *
 * Public endpoint — no auth middleware.
 * Security model: Resend posts to a secret path. Add signature verification in production.
 *
 * Handled event types:
 *   email.delivered        → stats.delivered++
 *   email.opened           → status = "opened",  openedAt = now,  stats.opened++
 *   email.clicked          → status = "clicked", clickedAt = now, stats.clicked++
 *   email.bounced          → status = "failed",  bouncedAt = now, stats.bounced++
 *                            also flag the linked contact's bouncedAt
 *   email.delivery_delayed → status = "failed"
 *   email.complained       → unsubscribe contact, stats.unsubscribed++
 *
 * Payload shape from Resend:
 *   { type: string, data: { email_id: string, ... } }
 *
 * We store Resend's email ID in the email doc as `resendId`.
 * Lookup: query emails where resendId == data.email_id.
 */
import { NextRequest, NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { Webhook } from 'svix'
import { adminDb } from '@/lib/firebase/admin'

// Resend webhook signature verification uses svix.
// Set RESEND_WEBHOOK_SECRET (format: whsec_xxxx) in env to enforce verification.
// If unset, requests are allowed through (a one-time warning is logged at cold start)
// so dev/preview environments without webhook setup still work.
// See: https://resend.com/docs/dashboard/webhooks/verify-webhook-requests

let missingSecretWarned = false

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Read raw body BEFORE parsing — svix needs the exact bytes to verify the signature.
  const rawBody = await req.text()

  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (secret) {
    const headers = {
      'svix-id': req.headers.get('svix-id') ?? '',
      'svix-timestamp': req.headers.get('svix-timestamp') ?? '',
      'svix-signature': req.headers.get('svix-signature') ?? '',
    }
    try {
      new Webhook(secret).verify(rawBody, headers)
    } catch (err) {
      console.warn('[email/webhook] signature verification failed', err)
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
    }
  } else if (!missingSecretWarned) {
    missingSecretWarned = true
    console.warn(
      '[email/webhook] RESEND_WEBHOOK_SECRET is not set — accepting unsigned webhooks. Set this in production.',
    )
  }

  let payload: { type: string; data: { email_id: string } }

  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { type, data } = payload
  const resendEmailId = data?.email_id
  if (!resendEmailId) {
    return NextResponse.json({ ok: true, note: 'no email_id' })
  }

  // Find the Firestore doc with this resendId
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const snapshot = await (adminDb.collection('emails') as any)
    .where('resendId', '==', resendEmailId)
    .limit(1)
    .get()

  if (snapshot.empty) {
    return NextResponse.json({ ok: true, note: 'email not found' })
  }

  const docRef = snapshot.docs[0].ref
  const emailData =
    typeof snapshot.docs[0].data === 'function'
      ? ((snapshot.docs[0].data() as { campaignId?: string; contactId?: string }) ?? {})
      : {}
  const campaignId = emailData?.campaignId ?? ''
  const contactId = emailData?.contactId ?? ''

  let campaignStatField: string | null = null

  if (type === 'email.delivered') {
    campaignStatField = 'stats.delivered'
  } else if (type === 'email.opened') {
    await docRef.update({ status: 'opened', openedAt: FieldValue.serverTimestamp() })
    campaignStatField = 'stats.opened'
  } else if (type === 'email.clicked') {
    await docRef.update({ status: 'clicked', clickedAt: FieldValue.serverTimestamp() })
    campaignStatField = 'stats.clicked'
  } else if (type === 'email.bounced') {
    await docRef.update({
      status: 'failed',
      bouncedAt: FieldValue.serverTimestamp(),
    })
    campaignStatField = 'stats.bounced'
    if (contactId) {
      try {
        await adminDb.collection('contacts').doc(contactId).update({
          bouncedAt: FieldValue.serverTimestamp(),
        })
      } catch (err) {
        console.error('[email/webhook] failed to flag contact bouncedAt', contactId, err)
      }
    }
  } else if (type === 'email.delivery_delayed') {
    await docRef.update({ status: 'failed' })
  } else if (type === 'email.complained') {
    campaignStatField = 'stats.unsubscribed'
    if (contactId) {
      try {
        await adminDb.collection('contacts').doc(contactId).update({
          unsubscribedAt: FieldValue.serverTimestamp(),
        })
      } catch (err) {
        console.error('[email/webhook] failed to flag contact unsubscribedAt', contactId, err)
      }
    }
  }
  // unknown types → no-op

  if (campaignStatField && campaignId) {
    try {
      await adminDb.collection('campaigns').doc(campaignId).update({
        [campaignStatField]: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      })
    } catch (err) {
      console.error('[email/webhook] failed to bump campaign stat', campaignId, campaignStatField, err)
    }
  }

  return NextResponse.json({ ok: true })
}
