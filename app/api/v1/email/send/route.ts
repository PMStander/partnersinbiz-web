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
import { resolveOrgScope } from '@/lib/api/orgScope'
import { apiSuccess, apiError } from '@/lib/api/response'
import { getResendClient, FROM_ADDRESS, plainTextToHtml, htmlToPlainText } from '@/lib/email/resend'
import { signUnsubscribeToken } from '@/lib/email/unsubscribeToken'
import { checkQuota } from '@/lib/platform/quotas'
import type { ApiUser } from '@/lib/api/types'

export const POST = withAuth('client', async (req: NextRequest, user: ApiUser) => {
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
    campaignId = '',
    fromDomainId = '',
  } = body

  if (!to?.trim()) return apiError('to is required')
  if (!subject?.trim()) return apiError('subject is required')
  if (!bodyText?.trim() && !bodyHtml?.trim()) return apiError('bodyText or bodyHtml is required')

  const requestedOrgId = typeof body.orgId === 'string' ? body.orgId.trim() : null
  const scope = resolveOrgScope(user, requestedOrgId)
  if (!scope.ok) return apiError(scope.error, scope.status)
  const orgId = scope.orgId

  const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://partnersinbiz.online'
  const unsubscribeToken = contactId
    ? signUnsubscribeToken(contactId, campaignId || undefined)
    : undefined
  const unsubscribeUrl = unsubscribeToken ? `${BASE_URL}/api/unsubscribe?token=${unsubscribeToken}` : undefined

  const unsubscribeFooter = unsubscribeUrl
    ? `<p style="font-size:11px;color:#666;text-align:center;margin-top:24px;">Don't want these emails? <a href="${unsubscribeUrl}" style="color:#888;">Unsubscribe</a></p>`
    : ''

  const rawHtml = bodyHtml?.trim() || plainTextToHtml(bodyText)
  const finalBodyHtml = unsubscribeFooter ? rawHtml + unsubscribeFooter : rawHtml
  const finalBodyText = bodyText?.trim() || htmlToPlainText(bodyHtml)

  // 1. Create draft doc first so we have an id for the activity log
  const docRef = await adminDb.collection('emails').add({
    orgId,
    campaignId,
    fromDomainId,
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
    bouncedAt: null,
    sequenceId,
    sequenceStep,
    variantId: '',
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
      orgId,
      contactId,
      dealId: '',
      type: 'email_sent',
      summary: `Email sent: ${subject.trim()}`,
      metadata: { emailId: docRef.id, to: to.trim() },
      createdBy: user.uid,
      createdAt: FieldValue.serverTimestamp(),
    })
  }

  // Fire-and-forget quota tracking — never blocks the response
  checkQuota(orgId, 'emailsPerMonth').catch(() => {})

  return apiSuccess({ id: docRef.id }, 201)
})
