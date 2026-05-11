// app/api/v1/email-templates/[id]/duplicate/route.ts
//
// Copies a template (starter or user-made) into the caller's org library.

import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { resolveOrgScope } from '@/lib/api/orgScope'
import { apiSuccess, apiError } from '@/lib/api/response'
import { FieldValue } from 'firebase-admin/firestore'
import { actorFrom } from '@/lib/api/actor'
import { findStarter, isStarterId } from '@/lib/email-builder/templates'
import { validateDocument } from '@/lib/email-builder/validate'
import type { ApiUser } from '@/lib/api/types'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export const POST = withAuth('client', async (req: NextRequest, user: ApiUser, context?: unknown) => {
  const { id } = await (context as Params).params
  const body = await req.json().catch(() => ({}))
  const requestedOrgId = typeof body?.orgId === 'string' ? body.orgId.trim() : null
  const scope = resolveOrgScope(user, requestedOrgId)
  if (!scope.ok) return apiError(scope.error, scope.status)
  const orgId = scope.orgId

  let source: { name: string; description: string; category: string; document: unknown } | null = null

  if (isStarterId(id)) {
    const starter = findStarter(id)
    if (!starter) return apiError('Not found', 404)
    source = {
      name: starter.name,
      description: starter.description,
      category: starter.category,
      document: starter.document,
    }
  } else {
    const snap = await adminDb.collection('email_templates').doc(id).get()
    if (!snap.exists || snap.data()?.deleted) return apiError('Not found', 404)
    const data = snap.data()!
    const ownerScope = resolveOrgScope(user, (data.orgId as string | undefined) ?? null)
    if (!ownerScope.ok) return apiError(ownerScope.error, ownerScope.status)
    source = {
      name: typeof data.name === 'string' ? data.name : 'Untitled',
      description: typeof data.description === 'string' ? data.description : '',
      category: typeof data.category === 'string' ? data.category : 'custom',
      document: data.document,
    }
  }

  const v = validateDocument(source.document)
  if (!v.ok) return apiError('Source document is invalid: ' + v.errors.join('; '), 400)

  const docData = {
    orgId,
    name: `${source.name} (copy)`,
    description: source.description,
    category: source.category,
    document: v.doc,
    isStarter: false,
    deleted: false,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    ...actorFrom(user),
  }

  const ref = await adminDb.collection('email_templates').add(docData)
  return apiSuccess({ id: ref.id, ...docData, createdAt: null, updatedAt: null }, 201)
})
