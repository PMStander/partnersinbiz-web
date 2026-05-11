// app/api/v1/broadcasts/[id]/ab/declare-winner/route.ts
//
// POST — manually declare a winner, or auto-pick by statistical significance.
//
// Body (optional):
//   { variantId?: string, force?: boolean }
//   - if `variantId` supplied → that variant becomes the winner (manual override)
//   - else → `selectWinnerWithSignificance` is used. If the test is not
//     statistically significant yet, returns 422 with the stats so the
//     UI can show "not enough data" / "no clear winner".
//   - if `force: true`, bypasses the significance gate when no variantId is
//     supplied — picks the highest-rate variant regardless.
//
// Side effects on success:
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
import { selectWinner, selectWinnerWithSignificance } from '@/lib/ab-testing/winner'
import { pairwiseComparisons } from '@/lib/ab-testing/stats'

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

  const body = (await req.json().catch(() => ({}))) as {
    variantId?: string
    force?: boolean
  }

  let winnerId: string
  let stats: ReturnType<typeof selectWinnerWithSignificance> | null = null

  if (body.variantId) {
    const exists = ab.variants.some((v) => v.id === body.variantId)
    if (!exists) return apiError(`variant ${body.variantId} not found`, 400)
    winnerId = body.variantId
  } else if (body.force) {
    const auto = selectWinner(ab.variants, ab.winnerMetric)
    if (!auto) return apiError('No variant has enough data to pick a winner — supply variantId manually', 400)
    winnerId = auto.id
    stats = selectWinnerWithSignificance(ab.variants, ab.winnerMetric)
  } else {
    stats = selectWinnerWithSignificance(ab.variants, ab.winnerMetric, {
      minSamplesPerVariant: 100,
      confidenceThreshold: 0.95,
    })
    if (stats.reason === 'insufficient-data') {
      return apiError('Not enough data to declare a winner yet', 422, {
        stats,
        comparisons: pairwiseComparisons(ab.variants, ab.winnerMetric),
      })
    }
    if (stats.reason === 'tie' || stats.reason === 'no-data' || !stats.winner) {
      return apiError('No statistically significant winner', 422, {
        stats,
        comparisons: pairwiseComparisons(ab.variants, ab.winnerMetric),
      })
    }
    winnerId = stats.winner.id
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

  return apiSuccess({ broadcastId: id, ab: nextAb, stats })
})
