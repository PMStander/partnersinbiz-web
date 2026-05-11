/**
 * POST /api/v1/broadcasts/[id]/test
 *
 * Body: { to: string, vars?: object }
 *
 * Sends a one-off test render of this broadcast's content to `to`. Does NOT:
 *   • Enroll anyone
 *   • Create an emails doc
 *   • Touch broadcast.stats
 *
 * Auth: client.
 */
import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { resolveOrgScope } from '@/lib/api/orgScope'
import { apiSuccess, apiError } from '@/lib/api/response'
import { resolveFrom } from '@/lib/email/resolveFrom'
import { sendCampaignEmail, plainTextToHtml, htmlToPlainText } from '@/lib/email/resend'
import { interpolate, type TemplateVars } from '@/lib/email/template'
import { signUnsubscribeToken } from '@/lib/email/unsubscribeToken'
import { renderEmail } from '@/lib/email-builder/render'
import type { EmailDocument } from '@/lib/email-builder/types'
import type { Broadcast } from '@/lib/broadcasts/types'
import type { ApiUser } from '@/lib/api/types'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

function isEmail(s: unknown): s is string {
  return typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}

export const POST = withAuth('client', async (req: NextRequest, user: ApiUser, context?: unknown) => {
  const { id } = await (context as Params).params
  const body = await req.json().catch(() => null)
  if (!body) return apiError('Invalid JSON', 400)

  const to = body.to
  if (!isEmail(to)) return apiError('to must be a valid email address', 400)

  const overrideVars = (body.vars && typeof body.vars === 'object' ? body.vars : {}) as Record<
    string,
    string | number | undefined
  >

  const snap = await adminDb.collection('broadcasts').doc(id).get()
  if (!snap.exists || snap.data()?.deleted) return apiError('Broadcast not found', 404)
  const broadcast = { id: snap.id, ...snap.data() } as Broadcast
  const scope = resolveOrgScope(user, broadcast.orgId ?? null)
  if (!scope.ok) return apiError(scope.error, scope.status)

  // Resolve from + org name.
  let orgName = ''
  try {
    const orgSnap = await adminDb.collection('organizations').doc(broadcast.orgId).get()
    if (orgSnap.exists) orgName = (orgSnap.data() as { name?: string })?.name ?? ''
  } catch {
    // Non-fatal.
  }
  const resolved = await resolveFrom({
    fromDomainId: broadcast.fromDomainId,
    fromName: broadcast.fromName,
    fromLocal: broadcast.fromLocal,
    orgName,
  })

  // Build vars — sample-friendly defaults, then overrides from the request.
  const base: TemplateVars = {
    firstName: 'Test',
    lastName: 'Recipient',
    fullName: 'Test Recipient',
    email: to,
    company: 'Test Co.',
    orgName,
    unsubscribeUrl: `${process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? ''}/u/${encodeURIComponent(
      signUnsubscribeToken('preview', broadcast.id),
    )}`,
  }
  const vars: TemplateVars = { ...base, ...overrideVars }

  // Render content — template or inline.
  let subject = ''
  let html = ''
  let text = ''
  if (broadcast.content.templateId) {
    const tplSnap = await adminDb
      .collection('email_templates')
      .doc(broadcast.content.templateId)
      .get()
    if (!tplSnap.exists) return apiError('Template not found', 404)
    const data = tplSnap.data() ?? {}
    const doc = (data.document ?? data.doc ?? null) as EmailDocument | null
    if (!doc) return apiError('Template document is empty', 422)
    const rendered = renderEmail(doc, vars)
    subject = `[TEST] ${interpolate(doc.subject ?? broadcast.content.subject ?? '', vars)}`
    html = rendered.html
    text = rendered.text
  } else {
    subject = `[TEST] ${interpolate(broadcast.content.subject ?? '', vars)}`
    const rawHtml = broadcast.content.bodyHtml ?? ''
    const rawText = broadcast.content.bodyText ?? ''
    html = rawHtml ? interpolate(rawHtml, vars) : plainTextToHtml(interpolate(rawText, vars))
    text = rawText ? interpolate(rawText, vars) : htmlToPlainText(html)
  }

  if (!process.env.RESEND_API_KEY?.trim()) {
    // eslint-disable-next-line no-console
    console.warn('[broadcasts/test] RESEND_API_KEY not set — skipping actual send')
    return apiSuccess({ ok: true, resendId: '', mode: 'dryrun' })
  }

  const result = await sendCampaignEmail({
    from: resolved.from,
    to,
    replyTo: broadcast.replyTo || undefined,
    subject,
    html,
    text,
  })

  if (!result.ok) {
    return apiError(result.error ?? 'Test send failed', 500)
  }
  return apiSuccess({ ok: true, resendId: result.resendId })
})
