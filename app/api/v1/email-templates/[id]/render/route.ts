// app/api/v1/email-templates/[id]/render/route.ts
//
// Render an email template with supplied variables. Used by the admin
// builder for live preview and by AI agents to dry-run before sending.

import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { resolveOrgScope } from '@/lib/api/orgScope'
import { apiSuccess, apiError } from '@/lib/api/response'
import { renderEmail } from '@/lib/email-builder/render'
import { validateDocument } from '@/lib/email-builder/validate'
import { findStarter, isStarterId } from '@/lib/email-builder/templates'
import { interpolate, type TemplateVars } from '@/lib/email/template'
import type { ApiUser } from '@/lib/api/types'
import type { EmailDocument } from '@/lib/email-builder/types'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export const POST = withAuth('client', async (req: NextRequest, user: ApiUser, context?: unknown) => {
  const { id } = await (context as Params).params
  const body = await req.json().catch(() => ({}))
  const vars: TemplateVars = body && typeof body.vars === 'object' && body.vars ? (body.vars as TemplateVars) : {}

  let document: EmailDocument
  let subject: string

  if (isStarterId(id)) {
    const starter = findStarter(id)
    if (!starter) return apiError('Not found', 404)
    document = starter.document
    subject = starter.document.subject
  } else {
    const snap = await adminDb.collection('email_templates').doc(id).get()
    if (!snap.exists || snap.data()?.deleted) return apiError('Not found', 404)
    const data = snap.data()!
    const scope = resolveOrgScope(user, (data.orgId as string | undefined) ?? null)
    if (!scope.ok) return apiError(scope.error, scope.status)
    const v = validateDocument(data.document)
    if (!v.ok) return apiError('Stored document is invalid: ' + v.errors.join('; '), 500)
    document = v.doc
    subject = v.doc.subject
  }

  const { html, text } = renderEmail(document, vars)
  return apiSuccess({ html, text, subject: interpolate(subject, vars) })
})
