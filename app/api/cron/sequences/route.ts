// app/api/cron/sequences/route.ts
import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { apiSuccess, apiError } from '@/lib/api/response'
import { getResendClient, FROM_ADDRESS } from '@/lib/email/resend'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) return apiError('Unauthorized', 401)

  const now = Timestamp.now()
  const snap = await (adminDb.collection('sequence_enrollments') as any)
    .where('status', '==', 'active')
    .where('nextSendAt', '<=', now)
    .get()

  let processed = 0
  const resend = getResendClient()

  for (const enrollDoc of snap.docs) {
    const enrollment = enrollDoc.data()

    const seqSnap = await adminDb.collection('sequences').doc(enrollment.sequenceId).get()
    if (!seqSnap.exists) continue
    const seq = seqSnap.data()!
    const steps = seq.steps ?? []
    const step = steps[enrollment.currentStep]
    if (!step) continue

    const contactSnap = await adminDb.collection('contacts').doc(enrollment.contactId).get()
    if (!contactSnap.exists) continue
    const contact = contactSnap.data()!

    // Send via Resend
    const { data, error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: contact.email,
      subject: step.subject,
      html: step.bodyHtml,
      text: step.bodyText,
    })

    // Create email doc
    const emailRef = await adminDb.collection('emails').add({
      direction: 'outbound',
      contactId: enrollment.contactId,
      resendId: data?.id ?? '',
      from: FROM_ADDRESS,
      to: contact.email,
      cc: [],
      subject: step.subject,
      bodyHtml: step.bodyHtml,
      bodyText: step.bodyText,
      status: error ? 'failed' : 'sent',
      scheduledFor: null,
      sentAt: error ? null : FieldValue.serverTimestamp(),
      openedAt: null,
      clickedAt: null,
      sequenceId: enrollment.sequenceId,
      sequenceStep: enrollment.currentStep,
      createdAt: FieldValue.serverTimestamp(),
    })

    // Log activity
    await adminDb.collection('activities').add({
      contactId: enrollment.contactId,
      type: 'email_sent',
      note: `Sequence step ${enrollment.currentStep + 1}: ${step.subject}`,
      emailId: emailRef.id,
      createdAt: FieldValue.serverTimestamp(),
    })

    const nextStep = enrollment.currentStep + 1
    const isLast = nextStep >= steps.length

    if (isLast) {
      await adminDb.collection('sequence_enrollments').doc(enrollDoc.id).update({
        status: 'completed',
        exitReason: 'completed',
        completedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })
    } else {
      const nextDelayMs = steps[nextStep].delayDays * 24 * 60 * 60 * 1000
      const nextSendAt = Timestamp.fromDate(new Date(Date.now() + nextDelayMs))
      await adminDb.collection('sequence_enrollments').doc(enrollDoc.id).update({
        currentStep: nextStep,
        nextSendAt,
        updatedAt: FieldValue.serverTimestamp(),
      })
    }

    processed++
  }

  return apiSuccess({ processed })
}
