/**
 * POST /api/v1/email/webhook/ses — Amazon SES → SNS webhook receiver
 *
 * Public endpoint. SES emits events (bounce / complaint / delivery / open /
 * click / delivery-delay / send / reject) to an SNS topic configured on the
 * SES ConfigurationSet, and SNS POSTs them here. There are two payload kinds:
 *   1. `SubscriptionConfirmation` — sent once when the SNS topic is subscribed
 *      to this URL. We GET `SubscribeURL` to confirm.
 *   2. `Notification` — the real event. `Message` is a JSON string of the SES
 *      event envelope (`eventType`, `mail`, `bounce` | `complaint` | ...).
 *
 * SES message-id ↔ Firestore lookup:
 *   SES populates `mail.messageId`. We persisted that as `providerMessageId`
 *   (and the legacy `resendId` field) at send time, so we look the email doc
 *   up by `providerMessageId == messageId`.
 *
 * Signature verification: SNS HTTPS messages include `x-amz-sns-message-*`
 * headers and a SHA1/SHA256-with-RSA signature against a signing cert hosted
 * on `*.amazonaws.com`. Verifying it is non-trivial and not yet implemented —
 * we accept all messages but require:
 *   • Content-Type header to be application/json or text/plain (SNS default)
 *   • `x-amz-sns-topic-arn` to match SES_SNS_TOPIC_ARN if set
 * TODO: add full SigV4 signature check before production cutover.
 */
import { NextRequest, NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { incrementVariantStat, type VariantStatField } from '@/lib/ab-testing/cronHelpers'
import {
  addSuppression,
  temporaryExpiryFromNow,
  type SuppressionReason,
} from '@/lib/email/suppressions'

interface SnsEnvelope {
  Type: string                              // 'Notification' | 'SubscriptionConfirmation' | 'UnsubscribeConfirmation'
  MessageId: string
  TopicArn?: string
  Message: string                           // stringified JSON for Notification, plain text for confirmations
  Timestamp?: string
  Token?: string
  SubscribeURL?: string
}

interface SesMailObject {
  messageId: string
  destination?: string[]
  source?: string
}

interface SesBounceInfo {
  bounceType?: string                       // 'Permanent' | 'Transient' | 'Undetermined'
  bounceSubType?: string
  bouncedRecipients?: Array<{
    emailAddress?: string
    diagnosticCode?: string
    status?: string
  }>
}

interface SesComplaintInfo {
  complainedRecipients?: Array<{ emailAddress?: string }>
  complaintFeedbackType?: string
}

interface SesEventEnvelope {
  eventType?: string                        // 'Bounce' | 'Complaint' | 'Delivery' | 'Send' | 'Reject' | 'Open' | 'Click' | 'DeliveryDelay'
  notificationType?: string                 // older SES schema uses this
  mail: SesMailObject
  bounce?: SesBounceInfo
  complaint?: SesComplaintInfo
}

let missingTopicWarned = false

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody = await req.text()
  let envelope: SnsEnvelope
  try {
    envelope = JSON.parse(rawBody) as SnsEnvelope
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const expectedTopic = process.env.SES_SNS_TOPIC_ARN?.trim()
  if (expectedTopic && envelope.TopicArn && envelope.TopicArn !== expectedTopic) {
    return NextResponse.json({ error: 'Unexpected topic' }, { status: 400 })
  } else if (!expectedTopic && !missingTopicWarned) {
    missingTopicWarned = true
    console.warn(
      '[email/webhook/ses] SES_SNS_TOPIC_ARN is not set — accepting messages from any topic. Set this in production.',
    )
  }

  // Subscription confirmation: SNS sends this once per subscription. We fetch
  // SubscribeURL to confirm. After this, real notifications start flowing.
  if (envelope.Type === 'SubscriptionConfirmation' && envelope.SubscribeURL) {
    try {
      const res = await fetch(envelope.SubscribeURL)
      if (!res.ok) {
        console.error('[email/webhook/ses] subscription confirm failed', res.status)
        return NextResponse.json({ error: 'confirm failed' }, { status: 500 })
      }
      return NextResponse.json({ ok: true, confirmed: true })
    } catch (err) {
      console.error('[email/webhook/ses] subscription confirm error', err)
      return NextResponse.json({ error: 'confirm error' }, { status: 500 })
    }
  }

  if (envelope.Type !== 'Notification') {
    return NextResponse.json({ ok: true, note: `ignored type ${envelope.Type}` })
  }

  let event: SesEventEnvelope
  try {
    event = JSON.parse(envelope.Message) as SesEventEnvelope
  } catch {
    return NextResponse.json({ error: 'Invalid Message JSON' }, { status: 400 })
  }

  const sesMessageId = event.mail?.messageId
  if (!sesMessageId) {
    return NextResponse.json({ ok: true, note: 'no messageId' })
  }

  // Look up the email doc by providerMessageId (the value we wrote at send
  // time). Falls back to the legacy `resendId` lookup so rows persisted before
  // the schema migration still resolve.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const coll = adminDb.collection('emails') as any
  let snapshot = await coll.where('providerMessageId', '==', sesMessageId).limit(1).get()
  if (snapshot.empty) {
    snapshot = await coll.where('resendId', '==', sesMessageId).limit(1).get()
  }
  if (snapshot.empty) {
    return NextResponse.json({ ok: true, note: 'email not found' })
  }

  const docRef = snapshot.docs[0].ref
  const emailData =
    typeof snapshot.docs[0].data === 'function'
      ? ((snapshot.docs[0].data() as {
          orgId?: string
          to?: string
          campaignId?: string
          contactId?: string
          variantId?: string
          broadcastId?: string
          sequenceId?: string
          sequenceStep?: number | null
        }) ?? {})
      : {}
  const emailOrgId = emailData?.orgId ?? ''
  const emailTo = emailData?.to ?? ''
  const campaignId = emailData?.campaignId ?? ''
  const contactId = emailData?.contactId ?? ''
  const variantId = emailData?.variantId ?? ''
  const broadcastId = emailData?.broadcastId ?? ''
  const sequenceId = emailData?.sequenceId ?? ''
  const sequenceStep = emailData?.sequenceStep ?? null

  const eventType = (event.eventType ?? event.notificationType ?? '').toLowerCase()
  let campaignStatField: string | null = null
  let variantStatField: VariantStatField | null = null

  if (eventType === 'delivery') {
    campaignStatField = 'stats.delivered'
    variantStatField = 'delivered'
  } else if (eventType === 'open') {
    await docRef.update({ status: 'opened', openedAt: FieldValue.serverTimestamp() })
    campaignStatField = 'stats.opened'
    variantStatField = 'opened'
  } else if (eventType === 'click') {
    await docRef.update({ status: 'clicked', clickedAt: FieldValue.serverTimestamp() })
    campaignStatField = 'stats.clicked'
    variantStatField = 'clicked'
  } else if (eventType === 'bounce') {
    const bounceType = (event.bounce?.bounceType ?? '').toLowerCase()
    const isHard = bounceType === 'permanent'
    const isSoft = bounceType === 'transient' || bounceType === 'undetermined' || bounceType === ''

    await docRef.update({
      status: 'failed',
      ...(isHard ? { bouncedAt: FieldValue.serverTimestamp() } : {}),
    })
    campaignStatField = 'stats.bounced'
    variantStatField = 'bounced'

    if (isHard && contactId) {
      try {
        await adminDb.collection('contacts').doc(contactId).update({
          bouncedAt: FieldValue.serverTimestamp(),
        })
      } catch (err) {
        console.error('[email/webhook/ses] failed to flag contact bouncedAt', contactId, err)
      }
    }

    const bouncedRecipient = event.bounce?.bouncedRecipients?.[0]
    const bouncedEmail = (bouncedRecipient?.emailAddress || emailTo || '').toString().trim()
    if (emailOrgId && bouncedEmail) {
      try {
        const reason: SuppressionReason = isHard ? 'hard-bounce' : 'soft-bounce'
        await addSuppression({
          orgId: emailOrgId,
          email: bouncedEmail,
          reason,
          source: 'webhook',
          scope: isHard ? 'permanent' : 'temporary',
          expiresAt: isHard ? null : temporaryExpiryFromNow(24),
          details: {
            diagnosticCode: bouncedRecipient?.diagnosticCode,
            smtpStatus: bouncedRecipient?.status,
            emailId: sesMessageId,
            broadcastId: broadcastId || undefined,
            campaignId: campaignId || undefined,
            sequenceId: sequenceId || undefined,
          },
          createdBy: 'system',
        })
      } catch (err) {
        console.error(
          '[email/webhook/ses] failed to add bounce suppression',
          { emailOrgId, bouncedEmail, isHard, isSoft },
          err,
        )
      }
    }
  } else if (eventType === 'complaint') {
    campaignStatField = 'stats.unsubscribed'
    variantStatField = 'unsubscribed'
    if (contactId) {
      try {
        await adminDb.collection('contacts').doc(contactId).update({
          unsubscribedAt: FieldValue.serverTimestamp(),
        })
      } catch (err) {
        console.error('[email/webhook/ses] failed to flag contact unsubscribedAt', contactId, err)
      }
    }

    const complainedRecipient = event.complaint?.complainedRecipients?.[0]
    const complainedEmail = (complainedRecipient?.emailAddress || emailTo || '').toString().trim()
    if (emailOrgId && complainedEmail) {
      try {
        await addSuppression({
          orgId: emailOrgId,
          email: complainedEmail,
          reason: 'complaint',
          source: 'webhook',
          scope: 'permanent',
          expiresAt: null,
          details: {
            emailId: sesMessageId,
            broadcastId: broadcastId || undefined,
            campaignId: campaignId || undefined,
            sequenceId: sequenceId || undefined,
          },
          createdBy: 'system',
        })
      } catch (err) {
        console.error(
          '[email/webhook/ses] failed to add complaint suppression',
          { emailOrgId, complainedEmail },
          err,
        )
      }
    }
  } else if (eventType === 'reject' || eventType === 'deliverydelay') {
    await docRef.update({ status: 'failed' })
  }
  // 'send' and unknown event types → no-op

  if (campaignStatField && campaignId) {
    try {
      await adminDb.collection('campaigns').doc(campaignId).update({
        [campaignStatField]: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      })
    } catch (err) {
      console.error('[email/webhook/ses] failed to bump campaign stat', campaignId, campaignStatField, err)
    }
  }

  if (campaignStatField && broadcastId) {
    try {
      await adminDb.collection('broadcasts').doc(broadcastId).update({
        [campaignStatField]: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      })
    } catch (err) {
      console.error('[email/webhook/ses] failed to bump broadcast stat', broadcastId, campaignStatField, err)
    }
  }

  if (variantId && variantStatField) {
    try {
      if (broadcastId) {
        await incrementVariantStat({
          targetCollection: 'broadcasts',
          targetId: broadcastId,
          variantId,
          field: variantStatField,
        })
      } else if (sequenceId && typeof sequenceStep === 'number') {
        await incrementVariantStat({
          targetCollection: 'sequences',
          targetId: sequenceId,
          stepNumber: sequenceStep,
          variantId,
          field: variantStatField,
        })
      }
    } catch (err) {
      console.error('[email/webhook/ses] failed to bump variant stat', {
        broadcastId, sequenceId, sequenceStep, variantId, variantStatField, err,
      })
    }
  }

  return NextResponse.json({ ok: true })
}
