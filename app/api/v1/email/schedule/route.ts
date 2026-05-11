/**
 * POST /api/v1/email/schedule — save email as scheduled (no send)
 *
 * Body:
 *   to           string    (required)
 *   subject      string    (required)
 *   scheduledFor string    (required — ISO datetime)
 *   bodyText     string    (required if bodyHtml not provided)
 *   bodyHtml     string    (optional)
 *   cc           string[]  (optional)
 *   contactId    string    (optional)
 *   sequenceId   string    (optional)
 *   sequenceStep number    (optional)
 *
 * Auth: admin or ai
 */
import { NextRequest } from 'next/server'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { resolveOrgScope } from '@/lib/api/orgScope'
import { apiSuccess, apiError } from '@/lib/api/response'
import { FROM_ADDRESS, plainTextToHtml, htmlToPlainText } from '@/lib/email/resend'

export const POST = withAuth('client', async (req: NextRequest, user) => {
  const body = await req.json()
  const {
    to,
    subject,
    bodyText,
    bodyHtml,
    scheduledFor,
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
  if (!scheduledFor) return apiError('scheduledFor is required')

  const requestedOrgId = typeof body.orgId === 'string' ? body.orgId.trim() : null
  const scope = resolveOrgScope(user, requestedOrgId)
  if (!scope.ok) return apiError(scope.error, scope.status)
  const orgId = scope.orgId

  const scheduledAt = Timestamp.fromDate(new Date(scheduledFor))

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
    bodyHtml: bodyHtml?.trim() || plainTextToHtml(bodyText),
    bodyText: bodyText?.trim() || htmlToPlainText(bodyHtml),
    status: 'scheduled',
    scheduledFor: scheduledAt,
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

  return apiSuccess({ id: docRef.id }, 201)
})
