import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { withIdempotency } from '@/lib/api/idempotency'
import { apiSuccess, apiError } from '@/lib/api/response'
import { lastActorFrom } from '@/lib/api/actor'
import type { ApiUser } from '@/lib/api/types'

export const dynamic = 'force-dynamic'

export const POST = withAuth(
  'admin',
  withIdempotency(async (_req: NextRequest, user: ApiUser, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params
    const ref = adminDb.collection('seo_optimizations').doc(id)
    const snap = await ref.get()
    if (!snap.exists) return apiError('Optimization not found', 404)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const opt = snap.data() as any
    const sprintRef = adminDb.collection('seo_sprints').doc(opt.sprintId)
    const sprintSnap = await sprintRef.get()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sprint = sprintSnap.data() as any

    // Heuristic outcome: compare current sprint impressions to baseline
    const baseline = opt.baselineSnapshot ?? {}
    const baselineImpr = baseline.impressions ?? 0
    const currentImpr = sprint?.health?.signals?.length ?? 0 // placeholder until we have time-series
    const delta = currentImpr - baselineImpr

    let result: 'win' | 'no-change' | 'loss' = 'no-change'
    if (delta > 0) result = 'win'
    else if (delta < 0) result = 'loss'

    await ref.update({
      status: 'measured',
      result,
      outcomeMeasuredAt: new Date().toISOString(),
      outcomeDelta: { impressionsChange: delta },
      ...lastActorFrom(user),
    })

    // Update scoreboard
    const sb = sprint?.scoreboard ?? {}
    const slot = sb[opt.hypothesisType] ?? { wins: 0, losses: 0, noChange: 0 }
    if (result === 'win') slot.wins++
    else if (result === 'loss') slot.losses++
    else slot.noChange++
    sb[opt.hypothesisType] = slot
    await sprintRef.update({ scoreboard: sb })

    return apiSuccess({ id, result, delta })
  }),
)
