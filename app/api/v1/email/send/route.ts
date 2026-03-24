/**
 * POST /api/v1/email/send — send an email immediately via Resend
 *
 * Body:
 *   to         string  (required)
 *   subject    string  (required)
 *   bodyText   string  (required if bodyHtml not provided)
 *   bodyHtml   string  (optional — if omitted, generated from bodyText)
 *   cc         string[] (optional)
 *   contactId  string  (optional — links email to a CRM contact and logs activity)
 *   sequenceId string  (optional)
 *   sequenceStep number (optional)
 *
 * Auth: admin or ai
 */
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { getResendClient, FROM_ADDRESS, plainTextToHtml, htmlToPlainText } from '@/lib/email/resend'
import type { ApiUser } from '@/lib/api/types'

export const POST = withAuth('admin', async (req: NextRequest, user: ApiUser) => {
  const body = await req.json()
  const {
    to,
    subject,
    bodyText,
    bodyHtml,
    cc = [],
    contactId = '',
    sequenceId = '',
    sequenceStep = null,
  } = body

  if (!to?.trim()) return apiError('to is required')
  if (!subject?.trim()) return apiError('subject is required')
  if (!bodyText?.trim() && !bodyHtml?.trim()) return apiError('bodyText or bodyHtml is required')

  const finalBodyHtml = bodyHtml?.trim() || plainTextToHtml(bodyText)
  const finalBodyText = bodyText?.trim() || htmlToPlainText(bodyHtml)

  // 1. Create draft doc first so we have an id for the activity log
  const docRef = await adminDb.collection('emails').add({
    direction: 'outbound',
    contactId,
    resendId: '',
    from: FROM_ADDRESS,
    to: to.trim(),
    cc,
    subject: subject.trim(),
    bodyHtml: finalBodyHtml,
    bodyText: finalBodyText,
    status: 'draft',
    scheduledFor: null,
    sentAt: null,
    openedAt: null,
    clickedAt: null,
    sequenceId,
    sequenceStep,
    deleted: false,
    createdAt: FieldValue.serverTimestamp(),
  })

  // 2. Call Resend
  const resend = getResendClient()
  const { data, error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: to.trim(),
    cc: cc.length ? cc : undefined,
    subject: subject.trim(),
    html: finalBodyHtml,
    text: finalBodyText,
  })

  if (error || !data?.id) {
    await adminDb.collection('emails').doc(docRef.id).update({
      status: 'failed',
    })
    return apiError(error?.message ?? 'Resend send failed', 502)
  }

  // 3. Update status to sent
  await adminDb.collection('emails').doc(docRef.id).update({
    status: 'sent',
    resendId: data.id,
    sentAt: FieldValue.serverTimestamp(),
  })

  // 4. Log activity on linked contact
  if (contactId) {
    await adminDb.collection('activities').add({
      contactId,
      dealId: '',
      type: 'email_sent',
      summary: `Email sent: ${subject.trim()}`,
      metadata: { emailId: docRef.id, to: to.trim() },
      createdBy: user.uid,
      createdAt: FieldValue.serverTimestamp(),
    })
  }

  return apiSuccess({ id: docRef.id }, 201)
})
