// app/api/v1/email-builder/preview/route.ts
//
// Stateless preview render — the builder UI POSTs the in-progress document
// here on every debounced keystroke. No persistence, no orgId required
// (the user is authenticated but we don't read or write Firestore).

import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { renderEmail } from '@/lib/email-builder/render'
import { validateDocument } from '@/lib/email-builder/validate'
import { interpolate, type TemplateVars } from '@/lib/email/template'

export const dynamic = 'force-dynamic'

export const POST = withAuth('client', async (req: NextRequest) => {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return apiError('Body required', 400)

  const v = validateDocument(body.document)
  if (!v.ok) return apiError('Invalid document: ' + v.errors.join('; '), 400)
  const vars: TemplateVars = body.vars && typeof body.vars === 'object' ? (body.vars as TemplateVars) : {}

  const { html, text } = renderEmail(v.doc, vars)
  return apiSuccess({ html, text, subject: interpolate(v.doc.subject, vars) })
})
