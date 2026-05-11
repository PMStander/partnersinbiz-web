// app/api/v1/email-snippets/[id]/route.ts

import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { resolveOrgScope } from '@/lib/api/orgScope'
import { apiSuccess, apiError } from '@/lib/api/response'
import { FieldValue } from 'firebase-admin/firestore'
import { lastActorFrom } from '@/lib/api/actor'
import { findStarterSnippet, isStarterSnippetId } from '@/lib/email-builder/snippet-presets'
import { validateSnippetInput } from '@/lib/email-builder/snippet-validate'
import type { ApiUser } from '@/lib/api/types'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export const GET = withAuth('client', async (req: NextRequest, user: ApiUser, context?: unknown) => {
  const { id } = await (context as Params).params

  if (isStarterSnippetId(id)) {
    const starter = findStarterSnippet(id)
    if (!starter) return apiError('Not found', 404)
    return apiSuccess(starter)
  }

  const snap = await adminDb.collection('email_snippets').doc(id).get()
  if (!snap.exists || snap.data()?.deleted) return apiError('Not found', 404)
  const data = snap.data()!
  const scope = resolveOrgScope(user, (data.orgId as string | undefined) ?? null)
  if (!scope.ok) return apiError(scope.error, scope.status)

  return apiSuccess({
    id: snap.id,
    ...data,
    isStarter: false,
    createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? null,
    updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() ?? null,
  })
})

export const PUT = withAuth('client', async (req: NextRequest, user: ApiUser, context?: unknown) => {
  const { id } = await (context as Params).params
  if (isStarterSnippetId(id)) return apiError('Starter snippets are read-only.', 403)

  const snap = await adminDb.collection('email_snippets').doc(id).get()
  if (!snap.exists || snap.data()?.deleted) return apiError('Not found', 404)
  const data = snap.data()!
  const scope = resolveOrgScope(user, (data.orgId as string | undefined) ?? null)
  if (!scope.ok) return apiError(scope.error, scope.status)

  const body = await req.json().catch(() => ({}))
  const v = validateSnippetInput(body)
  if (!v.ok) return apiError('Invalid snippet: ' + v.errors.join('; '), 400)

  const updates = {
    name: v.value.name,
    description: v.value.description,
    category: v.value.category,
    blocks: v.value.blocks,
    ...lastActorFrom(user),
  }
  await adminDb.collection('email_snippets').doc(id).update(updates)
  return apiSuccess({ id, ...updates })
})

export const DELETE = withAuth('client', async (req: NextRequest, user: ApiUser, context?: unknown) => {
  const { id } = await (context as Params).params
  if (isStarterSnippetId(id)) return apiError('Starter snippets cannot be deleted.', 403)

  const snap = await adminDb.collection('email_snippets').doc(id).get()
  if (!snap.exists || snap.data()?.deleted) return apiError('Not found', 404)
  const data = snap.data()!
  const scope = resolveOrgScope(user, (data.orgId as string | undefined) ?? null)
  if (!scope.ok) return apiError(scope.error, scope.status)

  await adminDb.collection('email_snippets').doc(id).update({
    deleted: true,
    deletedAt: FieldValue.serverTimestamp(),
    ...lastActorFrom(user),
  })
  return apiSuccess({ id })
})
