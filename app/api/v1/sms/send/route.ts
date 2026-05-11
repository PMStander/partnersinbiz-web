/**
 * POST /api/v1/sms/send — send an SMS immediately via Twilio
 *
 * Body:
 *   to         string  (required if contactId not provided — E.164 phone)
 *   body       string  (required)
 *   contactId  string  (optional — links SMS to a CRM contact, runs preferences gate + suppression check)
 *   orgId      string  (optional for admin/ai — required to scope; clients are scoped to their own org)
 *   topicId    string  (optional — preference topic, defaults to 'newsletter' for contact sends or 'transactional' for to-only)
 *   sequenceId   string (optional)
 *   sequenceStep number (optional)
 *   campaignId   string (optional)
 *   broadcastId  string (optional)
 *   variantId    string (optional)
 *
 * Auth: client (admin/ai satisfy).
 *
 * When `contactId` is supplied, goes through `sendSmsToContact()` — full
 * preferences + suppression + frequency gate, persists the sms doc, logs
 * activity. When only `to` is supplied, this is a transactional one-off
 * send: we call Twilio directly, then write a minimal sms doc tagged with
 * orgId so it still shows up in the list endpoint.
 */
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { resolveOrgScope } from '@/lib/api/orgScope'
import { apiSuccess, apiError } from '@/lib/api/response'
import {
  sendSms,
  isValidE164,
  normalizeToE164,
  countSmsSegments,
} from '@/lib/sms/twilio'
import { isSuppressed } from '@/lib/email/suppressions'
import { sendSmsToContact } from '@/lib/sms/send'
import type { ApiUser } from '@/lib/api/types'

interface SmsSendBody {
  to?: string
  body?: string
  contactId?: string
  orgId?: string
  topicId?: string
  sequenceId?: string
  sequenceStep?: number | null
  campaignId?: string
  broadcastId?: string
  variantId?: string
  fromOverride?: string
}

export const POST = withAuth('client', async (req: NextRequest, user: ApiUser) => {
  let raw: SmsSendBody
  try {
    raw = (await req.json()) as SmsSendBody
  } catch {
    return apiError('Invalid JSON body', 400)
  }

  const toRaw = (raw.to ?? '').trim()
  const body = (raw.body ?? '').trim()
  const contactId = (raw.contactId ?? '').trim()

  if (!body) return apiError('body is required', 400)
  if (!toRaw && !contactId) return apiError('Either `to` or `contactId` is required', 400)

  const requestedOrgId = typeof raw.orgId === 'string' ? raw.orgId.trim() : null
  const scope = resolveOrgScope(user, requestedOrgId)
  if (!scope.ok) return apiError(scope.error, scope.status)
  const orgId = scope.orgId

  // ── Path A: contact-aware send (full pipeline). ────────────────────────
  if (contactId) {
    const outcome = await sendSmsToContact({
      orgId,
      contactId,
      body,
      topicId: raw.topicId,
      sequenceId: raw.sequenceId,
      sequenceStep: raw.sequenceStep ?? null,
      campaignId: raw.campaignId,
      broadcastId: raw.broadcastId,
      variantId: raw.variantId,
      fromOverride: raw.fromOverride,
    })

    if (outcome.status === 'failed') {
      return apiError(outcome.reason ?? 'sms send failed', 502, {
        twilioSid: outcome.twilioSid,
        smsId: outcome.smsId,
      })
    }
    if (outcome.status === 'skipped') {
      // 200 with a skipped flag — callers (sequences, broadcasts, agent
      // workflows) need to be able to distinguish "we refused to send"
      // from "twilio errored".
      return apiSuccess(
        {
          id: outcome.smsId ?? '',
          twilioSid: outcome.twilioSid ?? '',
          status: 'skipped' as const,
          reason: outcome.reason ?? '',
        },
        200,
      )
    }

    return apiSuccess(
      {
        id: outcome.smsId ?? '',
        twilioSid: outcome.twilioSid ?? '',
        status: 'sent' as const,
        segmentsCount: outcome.segmentsCount ?? 0,
      },
      201,
    )
  }

  // ── Path B: ad-hoc transactional send (no contact). ───────────────────
  const e164 = normalizeToE164(toRaw)
  if (!e164 || !isValidE164(e164)) {
    return apiError(`Invalid recipient phone: "${toRaw}" — must be E.164 (e.g. +27821234567)`, 400)
  }

  if (await isSuppressed(orgId, e164, 'sms')) {
    return apiError('Recipient is on the SMS suppression list for this organisation', 422)
  }

  const segInfo = countSmsSegments(body)
  const sendResult = await sendSms({
    to: e164,
    body,
    from: raw.fromOverride,
  })

  const segmentsCount = sendResult.segmentsCount || segInfo.segments

  const topicId =
    typeof raw.topicId === 'string' && raw.topicId.trim() ? raw.topicId.trim() : 'transactional'

  const docPayload: Record<string, unknown> = {
    orgId,
    direction: 'outbound',
    contactId: '',
    twilioSid: sendResult.twilioSid,
    from: (raw.fromOverride ?? '').trim() || process.env.TWILIO_DEFAULT_FROM_NUMBER || '',
    to: e164,
    body,
    status: sendResult.ok ? 'sent' : 'failed',
    segmentsCount,
    costEstimateUsd: 0,
    sequenceId: raw.sequenceId ?? '',
    sequenceStep: raw.sequenceStep ?? null,
    campaignId: raw.campaignId ?? '',
    broadcastId: raw.broadcastId ?? '',
    topicId,
    variantId: raw.variantId ?? '',
    sentAt: sendResult.ok ? FieldValue.serverTimestamp() : null,
    deliveredAt: null,
    failedAt: sendResult.ok ? null : FieldValue.serverTimestamp(),
    failureReason: sendResult.ok ? '' : sendResult.error ?? '',
    scheduledFor: null,
    createdAt: FieldValue.serverTimestamp(),
    deleted: false,
    _createdByUid: user.uid,
  }
  const smsRef = await adminDb.collection('sms').add(docPayload)

  if (!sendResult.ok) {
    return apiError(sendResult.error ?? 'Twilio send failed', 502, {
      id: smsRef.id,
      twilioSid: sendResult.twilioSid,
    })
  }

  return apiSuccess(
    {
      id: smsRef.id,
      twilioSid: sendResult.twilioSid,
      status: 'sent' as const,
      segmentsCount,
    },
    201,
  )
})
