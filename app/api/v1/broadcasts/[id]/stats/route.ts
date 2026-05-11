/**
 * GET /api/v1/broadcasts/[id]/stats
 *
 * Returns the live BroadcastSendStats plus computed rates:
 *   • deliveryRate = delivered / sent
 *   • openRate     = opened    / delivered
 *   • clickRate    = clicked   / delivered
 *   • unsubRate    = unsubscribed / delivered
 *
 * All rates are between 0 and 1 (or 0 when the denominator is 0).
 *
 * Auth: client.
 */
import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { resolveOrgScope } from '@/lib/api/orgScope'
import { apiSuccess, apiError } from '@/lib/api/response'
import { EMPTY_BROADCAST_STATS, type Broadcast } from '@/lib/broadcasts/types'
import type { ApiUser } from '@/lib/api/types'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

function rate(numerator: number, denominator: number): number {
  if (!denominator || denominator <= 0) return 0
  const r = numerator / denominator
  if (!Number.isFinite(r)) return 0
  return Math.max(0, Math.min(1, r))
}

export const GET = withAuth('client', async (_req: NextRequest, user: ApiUser, context?: unknown) => {
  const { id } = await (context as Params).params
  const snap = await adminDb.collection('broadcasts').doc(id).get()
  if (!snap.exists || snap.data()?.deleted) return apiError('Broadcast not found', 404)
  const broadcast = { id: snap.id, ...snap.data() } as Broadcast
  const scope = resolveOrgScope(user, broadcast.orgId ?? null)
  if (!scope.ok) return apiError(scope.error, scope.status)

  const stats = { ...EMPTY_BROADCAST_STATS, ...(broadcast.stats ?? {}) }
  const rates = {
    deliveryRate: rate(stats.delivered, stats.sent),
    openRate: rate(stats.opened, stats.delivered),
    clickRate: rate(stats.clicked, stats.delivered),
    unsubRate: rate(stats.unsubscribed, stats.delivered),
  }

  return apiSuccess({
    id,
    status: broadcast.status,
    audienceSize: stats.audienceSize,
    stats,
    rates,
  })
})
