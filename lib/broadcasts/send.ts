// lib/broadcasts/send.ts
//
// Single-contact send pipeline for a broadcast. Shared by:
//   • app/api/cron/broadcasts/route.ts   — chunked background processing
//   • app/api/v1/broadcasts/[id]/send-now (immediate=true) — synchronous send
//
// Responsibilities per contact:
//   1. Idempotency check — skip if an emails doc already exists with
//      (broadcastId, contactId).
//   2. Resolve the from address.
//   3. Build template vars (from contact) + unsubscribe URL.
//   4. Render content — either template document via renderEmail() or the
//      inline subject/bodyHtml/bodyText with interpolate().
//   5. Send via Resend (or stub-log when RESEND_API_KEY is unset).
//   6. Create an `emails` doc tagged with broadcastId+contactId.
//   7. Increment broadcast.stats.sent or .failed.

import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { sendCampaignEmail, htmlToPlainText, plainTextToHtml } from '@/lib/email/resend'
import { resolveFrom, type ResolvedSender } from '@/lib/email/resolveFrom'
import { interpolate, varsFromContact, type TemplateVars } from '@/lib/email/template'
import { signUnsubscribeToken } from '@/lib/email/unsubscribeToken'
import { renderEmail } from '@/lib/email-builder/render'
import type { EmailDocument } from '@/lib/email-builder/types'
import type { Contact } from '@/lib/crm/types'
import type { Broadcast } from './types'
import { pickVariantForSend, incrementVariantStat } from '@/lib/ab-testing/cronHelpers'
import { applyVariantOverrides } from '@/lib/ab-testing/apply'

export interface BroadcastSendContext {
  broadcast: Broadcast
  orgName: string
  resolvedSender: ResolvedSender
  templateDoc: EmailDocument | null   // null when broadcast uses inline content
}

export interface ContactSendOutcome {
  contactId: string
  status: 'sent' | 'failed' | 'skipped'
  resendId?: string
  error?: string
}

const RESEND_KEY_SET = !!process.env.RESEND_API_KEY?.trim()

function buildUnsubscribeUrl(contactId: string, broadcastId: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? ''
  const token = signUnsubscribeToken(contactId, broadcastId)
  return `${base}/u/${encodeURIComponent(token)}`
}

/**
 * Loads everything we need once for an entire broadcast run, so per-contact
 * work doesn't repeat lookups. Caller should construct this before iterating.
 */
export async function buildSendContext(broadcast: Broadcast): Promise<BroadcastSendContext> {
  let orgName = ''
  try {
    const orgSnap = await adminDb.collection('organizations').doc(broadcast.orgId).get()
    if (orgSnap.exists) orgName = (orgSnap.data() as { name?: string })?.name ?? ''
  } catch {
    // Non-fatal.
  }

  const resolvedSender = await resolveFrom({
    fromDomainId: broadcast.fromDomainId,
    fromName: broadcast.fromName,
    fromLocal: broadcast.fromLocal,
    orgName,
  })

  let templateDoc: EmailDocument | null = null
  if (broadcast.content?.templateId) {
    const tplSnap = await adminDb
      .collection('email_templates')
      .doc(broadcast.content.templateId)
      .get()
    if (tplSnap.exists) {
      const data = tplSnap.data() ?? {}
      // Templates store the EmailDocument under either `document` or `doc`.
      // Default to `document` (matches the email-builder convention).
      const doc = (data.document ?? data.doc ?? null) as EmailDocument | null
      if (doc && typeof doc === 'object') templateDoc = doc
    }
  }

  return { broadcast, orgName, resolvedSender, templateDoc }
}

/**
 * Returns the set of contactIds we've already created emails docs for under
 * this broadcast. Used as a cheap idempotency cache for a single cron tick.
 *
 * For very large broadcasts we still re-check per-contact to be safe (because
 * the cache may exceed Firestore IN limits) — but for typical sizes this
 * single query saves N round-trips.
 */
export async function loadSentContactIds(broadcastId: string): Promise<Set<string>> {
  const out = new Set<string>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const snap = await (adminDb.collection('emails') as any)
    .where('broadcastId', '==', broadcastId)
    .get()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const d of snap.docs as any[]) {
    const cid = d.data()?.contactId
    if (typeof cid === 'string' && cid) out.add(cid)
  }
  return out
}

/**
 * Send to a single contact. Caller has typically pre-fetched the
 * already-sent set to skip duplicates without a per-contact query; if not,
 * pass `null` and we fall back to a one-off query.
 */
export async function sendBroadcastToContact(
  ctx: BroadcastSendContext,
  contact: Contact,
  alreadySent: Set<string> | null,
): Promise<ContactSendOutcome> {
  const { broadcast, resolvedSender, templateDoc, orgName } = ctx
  const contactId = contact.id

  // Per-contact idempotency check.
  if (alreadySent && alreadySent.has(contactId)) {
    return { contactId, status: 'skipped' }
  }
  if (!alreadySent) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dupSnap = await (adminDb.collection('emails') as any)
      .where('broadcastId', '==', broadcast.id)
      .where('contactId', '==', contactId)
      .limit(1)
      .get()
    if (!dupSnap.empty) return { contactId, status: 'skipped' }
  }

  // Build vars + unsubscribe URL.
  const unsubscribeUrl = buildUnsubscribeUrl(contactId, broadcast.id)
  const vars: TemplateVars = {
    ...varsFromContact(contact),
    orgName,
    unsubscribeUrl,
  }

  // Render — either via template document or inline interpolation.
  let subject = ''
  let html = ''
  let text = ''
  if (templateDoc) {
    const rendered = renderEmail(templateDoc, vars)
    subject = interpolate(templateDoc.subject ?? broadcast.content.subject ?? '', vars)
    html = rendered.html
    text = rendered.text
  } else {
    subject = interpolate(broadcast.content.subject ?? '', vars)
    const rawHtml = broadcast.content.bodyHtml ?? ''
    const rawText = broadcast.content.bodyText ?? ''
    html = rawHtml ? interpolate(rawHtml, vars) : plainTextToHtml(interpolate(rawText, vars))
    text = rawText ? interpolate(rawText, vars) : htmlToPlainText(html)
  }

  // A/B variant selection — pick the variant for this contact, apply overrides.
  // If A/B is disabled or no variant assigned, this is a no-op.
  const pick = pickVariantForSend({
    contactId,
    subjectId: broadcast.id,
    ab: broadcast.ab ?? null,
  })
  if (pick.defer) {
    // Winner-only test cohort excludes this contact; the cron will queue them
    // for the winner variant once it's decided. Skip for now.
    return { contactId, status: 'skipped' }
  }
  const effective = applyVariantOverrides(
    { subject, bodyHtml: html, bodyText: text, fromName: broadcast.fromName, scheduledFor: null },
    pick.variant,
  )
  subject = effective.subject
  html = effective.bodyHtml
  text = effective.bodyText
  // Note: fromName override doesn't change resolvedSender here (already
  // built once for the run). Future improvement: rebuild sender per-variant.

  // Send (or stub when no key in env).
  let resendId = ''
  let sendOk = true
  let sendError: string | undefined
  if (RESEND_KEY_SET) {
    const result = await sendCampaignEmail({
      from: resolvedSender.from,
      to: contact.email,
      replyTo: broadcast.replyTo || undefined,
      subject,
      html,
      text,
    })
    sendOk = result.ok
    resendId = result.resendId
    sendError = result.error
  } else {
    // Dev / preview without Resend — log and pretend success so the rest of
    // the pipeline (stats, emails docs, idempotency) still flows.
    // eslint-disable-next-line no-console
    console.warn(
      `[broadcasts] RESEND_API_KEY not set — skipping actual send to ${contact.email} for broadcast ${broadcast.id}`,
    )
    resendId = `dryrun_${broadcast.id}_${contactId}`
  }

  // Persist the emails doc no matter what — failed sends are useful audit
  // trail and let webhooks roll up `failed` later.
  await adminDb.collection('emails').add({
    orgId: broadcast.orgId,
    campaignId: '',
    broadcastId: broadcast.id,
    fromDomainId: resolvedSender.fromDomainId,
    direction: 'outbound',
    contactId,
    resendId,
    from: resolvedSender.from,
    to: contact.email,
    cc: [],
    subject,
    bodyHtml: html,
    bodyText: text,
    status: sendOk ? 'sent' : 'failed',
    scheduledFor: null,
    sentAt: sendOk ? FieldValue.serverTimestamp() : null,
    openedAt: null,
    clickedAt: null,
    bouncedAt: null,
    sequenceId: '',
    sequenceStep: null,
    variantId: pick.variant?.id ?? '',
    createdAt: FieldValue.serverTimestamp(),
    deleted: false,
  })

  // Roll up the variant-level "sent" stat (best-effort).
  if (sendOk && pick.variant?.id) {
    try {
      await incrementVariantStat({
        targetCollection: 'broadcasts',
        targetId: broadcast.id,
        variantId: pick.variant.id,
        field: 'sent',
      })
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[broadcasts] variant stat increment failed', err)
    }
  }

  // Roll up onto the broadcast stats.
  const statField = sendOk ? 'stats.sent' : 'stats.failed'
  await adminDb
    .collection('broadcasts')
    .doc(broadcast.id)
    .update({
      [statField]: FieldValue.increment(1),
      'stats.queued': FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    })

  // Log an activity row for the contact's timeline.
  if (sendOk) {
    try {
      await adminDb.collection('activities').add({
        orgId: broadcast.orgId,
        contactId,
        dealId: '',
        type: 'email_sent',
        summary: `Broadcast sent: ${subject}`,
        metadata: { broadcastId: broadcast.id, to: contact.email },
        createdBy: 'cron',
        createdAt: FieldValue.serverTimestamp(),
      })
    } catch (err) {
      // Activity logging is best-effort.
      // eslint-disable-next-line no-console
      console.error('[broadcasts] activity log failed', err)
    }
  }

  if (alreadySent) alreadySent.add(contactId)

  return sendOk
    ? { contactId, status: 'sent', resendId }
    : { contactId, status: 'failed', error: sendError }
}

/**
 * Convenience timestamp helper — exported so the cron + send-now can stamp
 * sendStartedAt / sendCompletedAt consistently.
 */
export function nowTs(): Timestamp {
  return Timestamp.now()
}
