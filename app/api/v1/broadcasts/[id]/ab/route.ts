// app/api/v1/broadcasts/[id]/ab/route.ts
//
// GET — return the broadcast's `ab` config
// PUT — partial-update the broadcast's `ab` config. Only allowed while the
//       broadcast is in 'draft' or 'paused' status. Validates variants.
//
// Note: this route reads/writes a Firestore `broadcasts/<id>` doc. The
// broadcast slice is being built in parallel — once it exists, the `ab` field
// will already be on the broadcast doc (defaulting to EMPTY_AB at create).
// If the doc has no `ab` field yet, GET returns EMPTY_AB.
import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { resolveOrgScope } from '@/lib/api/orgScope'
import { apiSuccess, apiError } from '@/lib/api/response'
import { lastActorFrom } from '@/lib/api/actor'
import type { ApiUser } from '@/lib/api/types'
import type { AbConfig } from '@/lib/ab-testing/types'
import { EMPTY_AB } from '@/lib/ab-testing/types'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

const ALLOWED_EDIT_STATUSES = new Set(['draft', 'paused'])

export const GET = withAuth('client', async (req: NextRequest, user: ApiUser, context?: unknown) => {
  const { id } = await (context as Params).params
  const snap = await adminDb.collection('broadcasts').doc(id).get()
  if (!snap.exists || snap.data()?.deleted) return apiError('Not found', 404)
  const scope = resolveOrgScope(user, (snap.data()?.orgId as string | undefined) ?? null)
  if (!scope.ok) return apiError(scope.error, scope.status)
  const ab = (snap.data()?.ab as AbConfig | undefined) ?? EMPTY_AB
  return apiSuccess({ broadcastId: id, ab })
})

export const PUT = withAuth('client', async (req: NextRequest, user: ApiUser, context?: unknown) => {
  const { id } = await (context as Params).params
  const snap = await adminDb.collection('broadcasts').doc(id).get()
  if (!snap.exists || snap.data()?.deleted) return apiError('Not found', 404)
  const data = snap.data()!
  const scope = resolveOrgScope(user, (data.orgId as string | undefined) ?? null)
  if (!scope.ok) return apiError(scope.error, scope.status)

  const status = (data.status as string | undefined) ?? 'draft'
  if (!ALLOWED_EDIT_STATUSES.has(status)) {
    return apiError(`A/B config can only be edited while broadcast is draft or paused (current: ${status})`, 409)
  }

  const body = (await req.json().catch(() => ({}))) as Partial<AbConfig>
  const current = (data.ab as AbConfig | undefined) ?? EMPTY_AB
  const next: AbConfig = { ...current, ...body, variants: body.variants ?? current.variants }

  // Validation — only enforce when enabled. (Allows storing a draft with 0 variants.)
  if (next.enabled) {
    if (!Array.isArray(next.variants) || next.variants.length < 2) {
      return apiError('At least 2 variants are required when A/B testing is enabled', 400)
    }
    if (next.mode === 'split') {
      const totalWeight = next.variants.reduce((acc, v) => acc + (v.weight ?? 0), 0)
      if (totalWeight !== 100) {
        return apiError(`Variant weights must sum to 100 in split mode (got ${totalWeight})`, 400)
      }
    }
    if (next.mode === 'winner-only') {
      if (next.testCohortPercent < 1 || next.testCohortPercent > 50) {
        return apiError('testCohortPercent must be between 1 and 50 in winner-only mode', 400)
      }
      if (next.testDurationMinutes < 5) {
        return apiError('testDurationMinutes must be at least 5 minutes', 400)
      }
    }
    const ids = new Set<string>()
    for (const v of next.variants) {
      if (!v.id || typeof v.id !== 'string') return apiError('Each variant must have an id', 400)
      if (ids.has(v.id)) return apiError(`Duplicate variant id: ${v.id}`, 400)
      ids.add(v.id)
    }
  }

  await adminDb.collection('broadcasts').doc(id).update({
    ab: next,
    ...lastActorFrom(user),
  })
  return apiSuccess({ broadcastId: id, ab: next })
})
