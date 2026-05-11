// app/api/v1/capture-sources/[id]/submit/route.ts
//
// PUBLIC endpoint — no auth.
//
// Accepts a JSON body { email, data?, referer? } and:
//   1. Finds the capture source by id (404 if missing / soft-deleted / inactive)
//   2. Validates the email
//   3. Looks up or creates the contact (merging tags / appending new field data)
//   4. Records the submission in `lead_capture_submissions`
//   5. If `doubleOptIn === 'on'`: sends a confirmation email and returns
//      `requiresConfirmation: true`. Enrollment is deferred until the
//      confirmation page is visited.
//      Otherwise: runs `performAutoEnroll` immediately and marks the
//      submission `confirmedAt`.
//   6. Fires `notifyEmails` notification to org admins (best-effort)
//
// CORS is open (`*`) because the endpoint is meant to be called from any
// client site that hosts the embed widget.

import { NextRequest, NextResponse } from 'next/server'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { sendCampaignEmail, htmlToPlainText } from '@/lib/email/resend'
import { resolveFrom } from '@/lib/email/resolveFrom'
import { signConfirmToken } from '@/lib/lead-capture/token'
import { performAutoEnroll } from '@/lib/lead-capture/autoEnroll'
import {
  type CaptureSource,
  type CaptureSubmission,
  LEAD_CAPTURE_SOURCES,
  LEAD_CAPTURE_SUBMISSIONS,
} from '@/lib/lead-capture/types'

type Params = { params: Promise<{ id: string }> }

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function jsonError(message: string, status: number, extra?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status, headers: CORS_HEADERS })
}

function jsonSuccess(data: Record<string, unknown>, status: number = 200): NextResponse {
  return NextResponse.json(data, { status, headers: CORS_HEADERS })
}

function isEmail(s: string): boolean {
  // Reject obvious spam patterns and require structure
  if (!s || typeof s !== 'string') return false
  if (s.length > 254) return false
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return false
  // Block trivial scammy local-parts that bots emit
  const local = s.split('@')[0]
  if (/^[a-z]{1,3}\d{6,}$/i.test(local)) return false
  return true
}

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for') ?? ''
  const first = fwd.split(',')[0]?.trim()
  return first || req.headers.get('x-real-ip') || 'unknown'
}

function appUrl(): string {
  const v = process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? 'https://partnersinbiz.online'
  return v.replace(/\/$/, '')
}

function defaultConfirmHtml(opts: {
  confirmUrl: string
  orgName: string
  sourceName: string
}): string {
  return `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #111; max-width: 560px; margin: 0 auto;">
  <h1 style="margin: 0 0 16px; font-size: 22px;">One quick step — confirm your subscription</h1>
  <p>Thanks for signing up to <strong>${opts.sourceName}</strong>. Please confirm your email so we know it's really you.</p>
  <p style="margin: 24px 0;">
    <a href="${opts.confirmUrl}" style="background: #0f766e; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; display: inline-block;">Confirm my email</a>
  </p>
  <p style="font-size: 13px; color: #555;">If you didn't sign up, you can safely ignore this message.</p>
  <p style="font-size: 12px; color: #888; margin-top: 32px;">— ${opts.orgName}</p>
</div>
  `.trim()
}

async function getOrgName(orgId: string): Promise<string> {
  try {
    const snap = await adminDb.collection('organizations').doc(orgId).get()
    if (snap.exists) {
      const name = snap.data()?.name
      if (typeof name === 'string' && name.trim()) return name
    }
  } catch {
    // ignore
  }
  return 'Our team'
}

async function sendAdminNotifications(opts: {
  source: CaptureSource
  submission: CaptureSubmission
  orgName: string
}): Promise<void> {
  const { source, submission, orgName } = opts
  if (!source.notifyEmails?.length) return
  const resolved = await resolveFrom({ orgName, fromLocal: 'notifications' })
  const subject = `New ${source.name} signup: ${submission.email}`
  const dataRows = Object.entries(submission.data || {})
    .map(([k, v]) => `<tr><td style="padding: 4px 12px 4px 0; color: #555;">${k}</td><td style="padding: 4px 0;">${v}</td></tr>`)
    .join('')
  const html = `
<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #111;">
  <p><strong>${submission.email}</strong> just submitted "${source.name}".</p>
  <table style="border-collapse: collapse; margin-top: 8px;">${dataRows}</table>
  <p style="color: #888; font-size: 12px; margin-top: 16px;">Source: ${source.id} · Contact: ${submission.contactId}</p>
</div>
  `.trim()
  const text = htmlToPlainText(html)

  await Promise.all(
    source.notifyEmails.map((to) =>
      sendCampaignEmail({
        from: resolved.from,
        to,
        subject,
        html,
        text,
      }).catch((err) => {
        // eslint-disable-next-line no-console
        console.error('[lead-capture] notify failed', { to, err })
      }),
    ),
  )
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function POST(req: NextRequest, context: Params) {
  const { id } = await context.params

  // 1. Load source
  const sourceSnap = await adminDb.collection(LEAD_CAPTURE_SOURCES).doc(id).get()
  if (!sourceSnap.exists) return jsonError('Capture source not found', 404)
  const source = { id: sourceSnap.id, ...sourceSnap.data() } as CaptureSource
  if (source.deleted) return jsonError('Capture source has been removed', 404)
  if (!source.active) return jsonError('Capture source is not active', 403)

  // 2. Parse body
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return jsonError('Invalid JSON body', 400)

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!isEmail(email)) return jsonError('A valid email is required', 400)

  // Build the submitted data record from declared fields + any extras
  const rawData = (body.data && typeof body.data === 'object' ? body.data : {}) as Record<string, unknown>
  const data: Record<string, string> = {}

  for (const field of source.fields ?? []) {
    const raw = rawData[field.key]
    const val = typeof raw === 'string' ? raw.trim() : ''
    if (field.required && !val) {
      return jsonError(`Field "${field.label}" is required`, 400)
    }
    if (val) data[field.key] = val
  }
  // Also accept top-level firstName/lastName/name/phone/company if not in fields
  for (const k of ['firstName', 'lastName', 'name', 'phone', 'company']) {
    if (!(k in data) && typeof rawData[k] === 'string' && (rawData[k] as string).trim()) {
      data[k] = (rawData[k] as string).trim()
    }
  }

  // 3. Find or create contact
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existingSnap = await (adminDb.collection('contacts') as any)
    .where('orgId', '==', source.orgId)
    .where('email', '==', email)
    .limit(1)
    .get()

  const incomingTags = source.tagsToApply ?? []
  const fullName =
    data.name ||
    [data.firstName, data.lastName].filter(Boolean).join(' ') ||
    email

  let contactId: string

  if (!existingSnap.empty) {
    const existingDoc = existingSnap.docs[0]
    contactId = existingDoc.id
    const existingData = existingDoc.data() as {
      tags?: string[]
      name?: string
      phone?: string
      company?: string
    }
    const mergedTags = Array.from(new Set([...(existingData.tags ?? []), ...incomingTags]))
    const patch: Record<string, unknown> = {
      tags: mergedTags,
      lastContactedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }
    // Don't overwrite name on dedup, but fill blanks
    if (!existingData.name && fullName) patch.name = fullName
    if (!existingData.phone && data.phone) patch.phone = data.phone
    if (!existingData.company && data.company) patch.company = data.company
    await existingDoc.ref.update(patch)
  } else {
    const contactRef = await adminDb.collection('contacts').add({
      orgId: source.orgId,
      capturedFromId: source.id,
      name: fullName,
      email,
      phone: data.phone ?? '',
      company: data.company ?? '',
      website: '',
      source: 'form',
      type: 'lead',
      stage: 'new',
      tags: Array.from(new Set(incomingTags)),
      notes: '',
      assignedTo: '',
      deleted: false,
      subscribedAt: FieldValue.serverTimestamp(),
      unsubscribedAt: null,
      bouncedAt: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      lastContactedAt: FieldValue.serverTimestamp(),
    })
    contactId = contactRef.id
  }

  // 4. Create the submission
  const ipAddress = clientIp(req)
  const userAgent = req.headers.get('user-agent') ?? ''
  const referer =
    (typeof body.referer === 'string' && body.referer) ||
    req.headers.get('referer') ||
    ''

  const submissionRef = adminDb.collection(LEAD_CAPTURE_SUBMISSIONS).doc()
  const submissionId = submissionRef.id
  const confirmationToken = signConfirmToken(submissionId)
  const doiOn = source.doubleOptIn === 'on'

  await submissionRef.set({
    orgId: source.orgId,
    captureSourceId: source.id,
    email,
    data,
    contactId,
    confirmedAt: doiOn ? null : FieldValue.serverTimestamp(),
    confirmationToken,
    ipAddress,
    userAgent,
    referer,
    createdAt: FieldValue.serverTimestamp(),
  })

  const submission: CaptureSubmission = {
    id: submissionId,
    orgId: source.orgId,
    captureSourceId: source.id,
    email,
    data,
    contactId,
    confirmedAt: doiOn ? null : (Timestamp.now() as unknown as CaptureSubmission['confirmedAt']),
    confirmationToken,
    ipAddress,
    userAgent,
    referer,
    createdAt: Timestamp.now() as unknown as CaptureSubmission['createdAt'],
  }

  const orgName = await getOrgName(source.orgId)

  // 5. DOI flow
  if (doiOn) {
    const confirmUrl = `${appUrl()}/lead/confirm/${encodeURIComponent(confirmationToken)}`
    try {
      const resolved = await resolveFrom({ orgName, fromLocal: 'hello' })
      const subject =
        source.confirmationSubject?.trim() ||
        `Please confirm your subscription to ${source.name}`
      const bodyHtmlTemplate =
        source.confirmationBodyHtml?.trim() ||
        defaultConfirmHtml({ confirmUrl, orgName, sourceName: source.name })
      const html = bodyHtmlTemplate.replace(/\{\{confirmUrl\}\}/g, confirmUrl)
      const text = htmlToPlainText(html)

      const result = await sendCampaignEmail({
        from: resolved.from,
        to: email,
        subject,
        html,
        text,
      })

      if (!result.ok) {
        // eslint-disable-next-line no-console
        console.error('[lead-capture] DOI send failed', result.error)
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[lead-capture] DOI send threw', err)
    }

    // Fire-and-forget notify
    sendAdminNotifications({ source, submission, orgName }).catch(() => {})

    return jsonSuccess({
      ok: true,
      requiresConfirmation: true,
      message: source.successMessage,
      contactId,
      submissionId,
    })
  }

  // 6. Immediate enrollment + notify
  try {
    await performAutoEnroll(submission, source)
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[lead-capture] auto-enroll failed', err)
  }

  sendAdminNotifications({ source, submission, orgName }).catch(() => {})

  return jsonSuccess({
    ok: true,
    requiresConfirmation: false,
    message: source.successMessage,
    redirect: source.successRedirectUrl || undefined,
    contactId,
    submissionId,
  })
}
