/**
 * POST /api/v1/email/webhook — Resend webhook receiver
 *
 * Public endpoint — no auth middleware.
 * Security model: Resend posts to a secret path. Add signature verification in production.
 *
 * Handled event types:
 *   email.delivered        → no status change (already "sent")
 *   email.opened           → status = "opened",  openedAt = now
 *   email.clicked          → status = "clicked", clickedAt = now
 *   email.bounced          → status = "failed"
 *   email.delivery_delayed → status = "failed"
 *
 * Payload shape from Resend:
 *   { type: string, data: { email_id: string, ... } }
 *
 * We store Resend's email ID in the email doc as `resendId`.
 * Lookup: query emails where resendId == data.email_id.
 */
import { NextRequest, NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'

// TODO(production): verify Resend webhook signature using svix or Resend's signing secret
// See: https://resend.com/docs/dashboard/webhooks/introduction

export async function POST(req: NextRequest): Promise<NextResponse> {
  let payload: { type: string; data: { email_id: string } }

  try {
    payload = await req.json()
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

  if (type === 'email.opened') {
    await docRef.update({ status: 'opened', openedAt: FieldValue.serverTimestamp() })
  } else if (type === 'email.clicked') {
    await docRef.update({ status: 'clicked', clickedAt: FieldValue.serverTimestamp() })
  } else if (type === 'email.bounced' || type === 'email.delivery_delayed') {
    await docRef.update({ status: 'failed' })
  }
  // email.delivered → no change, already "sent"

  return NextResponse.json({ ok: true })
}
