/**
 * POST /api/v1/broadcasts/[id]/schedule
 *
 * Body: { scheduledFor: ISO 8601 string }
 *
 * Validates content + audience + from address, then flips status
 * draft|paused → scheduled and saves scheduledFor. The cron picks it up
 * once scheduledFor <= now.
 *
 * Returns 422 with { issues: string[] } if validation fails.
 *
 * Auth: client.
 */
import { NextRequest } from 'next/server'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { resolveOrgScope } from '@/lib/api/orgScope'
import { apiSuccess, apiError } from '@/lib/api/response'
import { lastActorFrom } from '@/lib/api/actor'
import { validateBroadcastForSend } from '@/lib/broadcasts/validate'
import type { Broadcast } from '@/lib/broadcasts/types'
import type { ApiUser } from '@/lib/api/types'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export const POST = withAuth('client', async (req: NextRequest, user: ApiUser, context?: unknown) => {
  const { id } = await (context as Params).params
  const body = await req.json().catch(() => null)
  if (!body) return apiError('Invalid JSON', 400)

  const scheduledForRaw = typeof body.scheduledFor === 'string' ? body.scheduledFor : ''
  if (!scheduledForRaw) return apiError('scheduledFor is required (ISO 8601 string)', 400)
  const scheduledDate = new Date(scheduledForRaw)
  if (Number.isNaN(scheduledDate.getTime())) return apiError('scheduledFor is not a valid date', 400)
  if (scheduledDate.getTime() <= Date.now()) {
    return apiError('scheduledFor must be in the future', 400)
  }

  const ref = adminDb.collection('broadcasts').doc(id)
  const snap = await ref.get()
  if (!snap.exists || snap.data()?.deleted) return apiError('Broadcast not found', 404)
  const broadcast = { id: snap.id, ...snap.data() } as Broadcast
  const scope = resolveOrgScope(user, broadcast.orgId ?? null)
  if (!scope.ok) return apiError(scope.error, scope.status)

  if (!['draft', 'paused', 'scheduled'].includes(broadcast.status)) {
    return apiError(`Cannot schedule a broadcast with status=${broadcast.status}`, 422)
  }

  const validation = await validateBroadcastForSend(broadcast)
  if (!validation.ok) {
    return apiError('Validation failed', 422, { issues: validation.issues })
  }

  await ref.update({
    status: 'scheduled',
    scheduledFor: Timestamp.fromDate(scheduledDate),
    'stats.audienceSize': validation.audienceSize,
    ...lastActorFrom(user),
    updatedAt: FieldValue.serverTimestamp(),
  })

  return apiSuccess({
    id,
    status: 'scheduled',
    scheduledFor: scheduledDate.toISOString(),
    audienceSize: validation.audienceSize,
  })
})
