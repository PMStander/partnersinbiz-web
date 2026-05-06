/**
 * GET    /api/v1/campaigns/[id]  — fetch a campaign
 * PUT    /api/v1/campaigns/[id]  — update editable fields (only when draft/paused)
 * DELETE /api/v1/campaigns/[id]  — soft-delete
 *
 * Auth: admin
 */
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { resolveOrgScope } from '@/lib/api/orgScope'
import { apiSuccess, apiError } from '@/lib/api/response'
import type { Campaign } from '@/lib/campaigns/types'
import type { ApiUser } from '@/lib/api/types'

type Params = { params: Promise<{ id: string }> }

export const GET = withAuth('client', async (_req: NextRequest, user: ApiUser, context?: unknown) => {
  const { id } = await (context as Params).params
  const snap = await adminDb.collection('campaigns').doc(id).get()
  if (!snap.exists || snap.data()?.deleted) return apiError('Campaign not found', 404)
  const scope = resolveOrgScope(user, (snap.data()?.orgId as string | undefined) ?? null)
  if (!scope.ok) return apiError(scope.error, scope.status)
  const campaign = { id: snap.id, ...snap.data() } as Campaign
  return apiSuccess(campaign)
})

export const PUT = withAuth('client', async (req: NextRequest, user: ApiUser, context?: unknown) => {
  const { id } = await (context as Params).params
  const body = await req.json().catch(() => null)
  if (!body) return apiError('Invalid JSON', 400)

  const snap = await adminDb.collection('campaigns').doc(id).get()
  if (!snap.exists || snap.data()?.deleted) return apiError('Campaign not found', 404)
  const current = snap.data() as Campaign
  const scope = resolveOrgScope(user, current.orgId ?? null)
  if (!scope.ok) return apiError(scope.error, scope.status)

  // Active campaigns are read-only except for status transitions handled
  // by the launch/pause endpoints. Avoid drift by rejecting edits here.
  if (current.status === 'active' || current.status === 'completed') {
    return apiError(`Cannot edit a campaign with status=${current.status}`, 422)
  }

  const editable: Partial<Campaign> = {}
  if (typeof body.name === 'string') editable.name = body.name.trim()
  if (typeof body.description === 'string') editable.description = body.description
  if (typeof body.fromDomainId === 'string') editable.fromDomainId = body.fromDomainId
  if (typeof body.fromName === 'string') editable.fromName = body.fromName
  if (typeof body.fromLocal === 'string') editable.fromLocal = body.fromLocal
  if (typeof body.replyTo === 'string') editable.replyTo = body.replyTo
  if (typeof body.segmentId === 'string') editable.segmentId = body.segmentId
  if (Array.isArray(body.contactIds)) editable.contactIds = body.contactIds
  if (typeof body.sequenceId === 'string') {
    if (body.sequenceId) {
      const seqSnap = await adminDb.collection('sequences').doc(body.sequenceId).get()
      if (!seqSnap.exists) return apiError('sequenceId not found', 400)
      if (seqSnap.data()?.orgId !== current.orgId) {
        return apiError('sequenceId belongs to a different organisation', 403)
      }
    }
    editable.sequenceId = body.sequenceId
  }
  if (body.triggers && typeof body.triggers === 'object') {
    editable.triggers = {
      captureSourceIds: Array.isArray(body.triggers.captureSourceIds) ? body.triggers.captureSourceIds : [],
      tags: Array.isArray(body.triggers.tags) ? body.triggers.tags : [],
    }
  }

  await snap.ref.update({
    ...editable,
    updatedAt: FieldValue.serverTimestamp(),
  })
  return apiSuccess({ id })
})

export const DELETE = withAuth('client', async (_req: NextRequest, user: ApiUser, context?: unknown) => {
  const { id } = await (context as Params).params
  const snap = await adminDb.collection('campaigns').doc(id).get()
  if (!snap.exists || snap.data()?.deleted) return apiError('Campaign not found', 404)
  const scope = resolveOrgScope(user, (snap.data()?.orgId as string | undefined) ?? null)
  if (!scope.ok) return apiError(scope.error, scope.status)
  await snap.ref.update({ deleted: true, updatedAt: FieldValue.serverTimestamp() })
  return apiSuccess({ id })
})
