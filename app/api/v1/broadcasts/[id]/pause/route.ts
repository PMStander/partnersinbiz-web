/**
 * POST /api/v1/broadcasts/[id]/pause
 *
 * Transitions scheduled → paused. No-op (with success) if already paused.
 * Auth: client.
 */
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { resolveOrgScope } from '@/lib/api/orgScope'
import { apiSuccess, apiError } from '@/lib/api/response'
import { lastActorFrom } from '@/lib/api/actor'
import type { Broadcast } from '@/lib/broadcasts/types'
import type { ApiUser } from '@/lib/api/types'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export const POST = withAuth('client', async (_req: NextRequest, user: ApiUser, context?: unknown) => {
  const { id } = await (context as Params).params
  const ref = adminDb.collection('broadcasts').doc(id)
  const snap = await ref.get()
  if (!snap.exists || snap.data()?.deleted) return apiError('Broadcast not found', 404)
  const current = { id: snap.id, ...snap.data() } as Broadcast
  const scope = resolveOrgScope(user, current.orgId ?? null)
  if (!scope.ok) return apiError(scope.error, scope.status)

  if (current.status === 'paused') return apiSuccess({ id, status: 'paused' })
  if (current.status !== 'scheduled') {
    return apiError(`Cannot pause a broadcast with status=${current.status}`, 422)
  }

  await ref.update({
    status: 'paused',
    ...lastActorFrom(user),
    updatedAt: FieldValue.serverTimestamp(),
  })
  return apiSuccess({ id, status: 'paused' })
})
