// app/api/v1/broadcasts/[id]/ab/declare-winner/route.ts
//
// POST — manually declare a winner, or auto-pick by metric.
//
// Body (optional): { variantId?: string }
//   - if variantId supplied → that variant becomes the winner
//   - else → `selectWinner(ab.variants, ab.winnerMetric)` is used
//
// Side effects:
//   - sets ab.winnerVariantId, ab.winnerDecidedAt, ab.status = 'winner-pending'
//   - next cron tick will call dispatchWinnerToRemaining for the remaining audience
import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { resolveOrgScope } from '@/lib/api/orgScope'
import { apiSuccess, apiError } from '@/lib/api/response'
import { lastActorFrom } from '@/lib/api/actor'
import { FieldValue } from 'firebase-admin/firestore'
import type { ApiUser } from '@/lib/api/types'
import type { AbConfig } from '@/lib/ab-testing/types'
import { selectWinner } from '@/lib/ab-testing/winner'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export const POST = withAuth('client', async (req: NextRequest, user: ApiUser, context?: unknown) => {
  const { id } = await (context as Params).params
  const snap = await adminDb.collection('broadcasts').doc(id).get()
  if (!snap.exists || snap.data()?.deleted) return apiError('Not found', 404)
  const data = snap.data()!
  const scope = resolveOrgScope(user, (data.orgId as string | undefined) ?? null)
  if (!scope.ok) return apiError(scope.error, scope.status)

  const ab = data.ab as AbConfig | undefined
  if (!ab?.enabled) return apiError('A/B testing is not enabled on this broadcast', 400)

  const body = (await req.json().catch(() => ({}))) as { variantId?: string }

  let winnerId: string
  if (body.variantId) {
    const exists = ab.variants.some((v) => v.id === body.variantId)
    if (!exists) return apiError(`variant ${body.variantId} not found`, 400)
    winnerId = body.variantId
  } else {
    const auto = selectWinner(ab.variants, ab.winnerMetric)
    if (!auto) return apiError('No variant has enough data to pick a winner — supply variantId manually', 400)
    winnerId = auto.id
  }

  const nextAb: AbConfig = {
    ...ab,
    winnerVariantId: winnerId,
    status: 'winner-pending',
    // winnerDecidedAt is set via FieldValue.serverTimestamp() on the doc update below
  }

  await adminDb.collection('broadcasts').doc(id).update({
    'ab.winnerVariantId': winnerId,
    'ab.winnerDecidedAt': FieldValue.serverTimestamp(),
    'ab.status': 'winner-pending',
    ...lastActorFrom(user),
  })

  return apiSuccess({ broadcastId: id, ab: nextAb })
})
