/**
 * GET    /api/v1/crm/capture-sources/[id]
 * PUT    /api/v1/crm/capture-sources/[id]   — update editable fields
 * DELETE /api/v1/crm/capture-sources/[id]   — soft-delete
 *
 * PUT supports field `rotateKey: true` to regenerate the publicKey
 * (immediately invalidates any deployed form widgets / integrations).
 *
 * Auth: admin
 */
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { resolveOrgScope } from '@/lib/api/orgScope'
import { apiSuccess, apiError } from '@/lib/api/response'
import { generatePublicKey, type CaptureSource } from '@/lib/crm/captureSources'
import type { ApiUser } from '@/lib/api/types'

type Params = { params: Promise<{ id: string }> }

export const GET = withAuth('client', async (_req: NextRequest, user: ApiUser, context?: unknown) => {
  const { id } = await (context as Params).params
  const snap = await adminDb.collection('capture_sources').doc(id).get()
  if (!snap.exists || snap.data()?.deleted) return apiError('CaptureSource not found', 404)
  const scope = resolveOrgScope(user, (snap.data()?.orgId as string | undefined) ?? null)
  if (!scope.ok) return apiError(scope.error, scope.status)
  return apiSuccess({ id: snap.id, ...snap.data() } as CaptureSource)
})

export const PUT = withAuth('client', async (req: NextRequest, user: ApiUser, context?: unknown) => {
  const { id } = await (context as Params).params
  const body = await req.json().catch(() => null)
  if (!body) return apiError('Invalid JSON', 400)

  const snap = await adminDb.collection('capture_sources').doc(id).get()
  if (!snap.exists || snap.data()?.deleted) return apiError('CaptureSource not found', 404)
  const scope = resolveOrgScope(user, (snap.data()?.orgId as string | undefined) ?? null)
  if (!scope.ok) return apiError(scope.error, scope.status)

  const editable: Record<string, unknown> = {}
  if (typeof body.name === 'string') editable.name = body.name.trim()
  if (typeof body.enabled === 'boolean') editable.enabled = body.enabled
  if (Array.isArray(body.autoTags)) editable.autoTags = body.autoTags
  if (Array.isArray(body.autoCampaignIds)) editable.autoCampaignIds = body.autoCampaignIds
  if (typeof body.redirectUrl === 'string') editable.redirectUrl = body.redirectUrl
  if (typeof body.consentRequired === 'boolean') editable.consentRequired = body.consentRequired
  if (body.rotateKey === true) editable.publicKey = generatePublicKey()

  if (Object.keys(editable).length === 0) {
    return apiError('No editable fields supplied', 400)
  }

  editable.updatedAt = FieldValue.serverTimestamp()
  await snap.ref.update(editable)

  const updated = await snap.ref.get()
  return apiSuccess({ id: snap.id, ...updated.data() } as CaptureSource)
})

export const DELETE = withAuth('client', async (_req: NextRequest, user: ApiUser, context?: unknown) => {
  const { id } = await (context as Params).params
  const snap = await adminDb.collection('capture_sources').doc(id).get()
  if (!snap.exists || snap.data()?.deleted) return apiError('CaptureSource not found', 404)
  const scope = resolveOrgScope(user, (snap.data()?.orgId as string | undefined) ?? null)
  if (!scope.ok) return apiError(scope.error, scope.status)
  await snap.ref.update({ deleted: true, updatedAt: FieldValue.serverTimestamp() })
  return apiSuccess({ id })
})
