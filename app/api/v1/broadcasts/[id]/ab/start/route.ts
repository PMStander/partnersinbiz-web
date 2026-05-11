// app/api/v1/broadcasts/[id]/ab/start/route.ts
//
// POST — start the test cohort for winner-only mode. Marks the test window
// (testStartedAt / testEndsAt) so the cron knows when to auto-finalize the
// winner.
//
// Pre-conditions:
//   - broadcast exists, not deleted, scope matches caller
//   - ab.enabled === true
//   - ab.mode === 'winner-only'
//   - broadcast.status in ('scheduled', 'sending')
import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { resolveOrgScope } from '@/lib/api/orgScope'
import { apiSuccess, apiError } from '@/lib/api/response'
import { lastActorFrom } from '@/lib/api/actor'
import type { ApiUser } from '@/lib/api/types'
import type { AbConfig } from '@/lib/ab-testing/types'
import { makeTestWindow } from '@/lib/ab-testing/cronHelpers'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

const ALLOWED_STATUSES = new Set(['scheduled', 'sending'])

export const POST = withAuth('client', async (req: NextRequest, user: ApiUser, context?: unknown) => {
  const { id } = await (context as Params).params
  const snap = await adminDb.collection('broadcasts').doc(id).get()
  if (!snap.exists || snap.data()?.deleted) return apiError('Not found', 404)
  const data = snap.data()!
  const scope = resolveOrgScope(user, (data.orgId as string | undefined) ?? null)
  if (!scope.ok) return apiError(scope.error, scope.status)

  const ab = data.ab as AbConfig | undefined
  if (!ab?.enabled) return apiError('A/B testing is not enabled on this broadcast', 400)
  if (ab.mode !== 'winner-only') return apiError('start endpoint only applies to winner-only mode', 400)

  const status = (data.status as string | undefined) ?? 'draft'
  if (!ALLOWED_STATUSES.has(status)) {
    return apiError(`Broadcast must be scheduled or sending to start A/B test (current: ${status})`, 409)
  }

  const { startedAt, endsAt } = makeTestWindow(ab.testDurationMinutes)
  const nextAb: AbConfig = {
    ...ab,
    testStartedAt: startedAt,
    testEndsAt: endsAt,
    status: 'testing',
  }

  await adminDb.collection('broadcasts').doc(id).update({
    ab: nextAb,
    ...lastActorFrom(user),
  })

  return apiSuccess({ broadcastId: id, ab: nextAb })
})
