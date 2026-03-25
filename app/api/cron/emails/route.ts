/**
 * GET /api/cron/emails — process scheduled emails due now
 *
 * Secured by Authorization: Bearer ${CRON_SECRET}
 * Vercel cron schedule: every 15 minutes  (see vercel.json)
 *
 * For each email where status == "scheduled" AND scheduledFor <= now:
 *   1. Send via Resend
 *   2. Update status to "sent", set sentAt and resendId
 *   3. Log email_sent activity on linked contact (if contactId set)
 */
import { NextRequest, NextResponse } from 'next/server'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { getResendClient } from '@/lib/email/resend'

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

  const resend = getResendClient()
  let processed = 0

  for (const docSnap of snapshot.docs) {
    const email = docSnap.data() as {
      to: string
      from: string
      cc: string[]
      subject: string
      bodyHtml: string
      bodyText: string
      contactId: string
      sequenceId: string
    }

    const { data, error } = await resend.emails.send({
      from: email.from,
      to: email.to,
      cc: email.cc?.length ? email.cc : undefined,
      subject: email.subject,
      html: email.bodyHtml,
      text: email.bodyText,
    })

    if (error || !data?.id) {
      await adminDb.collection('emails').doc(docSnap.id).update({ status: 'failed' })
      continue
    }

    await adminDb.collection('emails').doc(docSnap.id).update({
      status: 'sent',
      resendId: data.id,
      sentAt: FieldValue.serverTimestamp(),
    })

    if (email.contactId) {
      await adminDb.collection('activities').add({
        contactId: email.contactId,
        dealId: '',
        type: 'email_sent',
        summary: `Email sent: ${email.subject}`,
        metadata: { emailId: docSnap.id, to: email.to },
        createdBy: 'cron',
        createdAt: FieldValue.serverTimestamp(),
      })
    }

    processed++
  }

  return NextResponse.json({ success: true, data: { processed } })
}
