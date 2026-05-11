// app/api/v1/sequences/[id]/steps/[stepNumber]/ab/route.ts
//
// GET — return the A/B config for a specific step in a sequence
// PUT — partial-update the A/B config for a step. Allowed at any sequence
//       status; sequence steps can have their A/B config tuned even while
//       active (new enrollments pick up the new config; in-flight enrollments
//       sent with old variants stay attributed correctly via variantId).
import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { resolveOrgScope } from '@/lib/api/orgScope'
import { apiSuccess, apiError } from '@/lib/api/response'
import { lastActorFrom } from '@/lib/api/actor'
import type { ApiUser } from '@/lib/api/types'
import type { AbConfig } from '@/lib/ab-testing/types'
import { EMPTY_AB } from '@/lib/ab-testing/types'
import type { SequenceStep } from '@/lib/sequences/types'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string; stepNumber: string }> }

function parseStep(raw: string): number | null {
  const n = parseInt(raw, 10)
  if (!Number.isFinite(n) || n < 0) return null
  return n
}

export const GET = withAuth('client', async (req: NextRequest, user: ApiUser, context?: unknown) => {
  const { id, stepNumber } = await (context as Params).params
  const stepIdx = parseStep(stepNumber)
  if (stepIdx === null) return apiError('Invalid stepNumber', 400)

  const snap = await adminDb.collection('sequences').doc(id).get()
  if (!snap.exists || snap.data()?.deleted) return apiError('Not found', 404)
  const data = snap.data()!
  const scope = resolveOrgScope(user, (data.orgId as string | undefined) ?? null)
  if (!scope.ok) return apiError(scope.error, scope.status)

  const steps = (data.steps as SequenceStep[] | undefined) ?? []
  if (stepIdx >= steps.length) return apiError('Step not found', 404)
  const ab = (steps[stepIdx].ab as AbConfig | undefined) ?? EMPTY_AB

  return apiSuccess({ sequenceId: id, stepNumber: stepIdx, ab })
})

export const PUT = withAuth('client', async (req: NextRequest, user: ApiUser, context?: unknown) => {
  const { id, stepNumber } = await (context as Params).params
  const stepIdx = parseStep(stepNumber)
  if (stepIdx === null) return apiError('Invalid stepNumber', 400)

  const snap = await adminDb.collection('sequences').doc(id).get()
  if (!snap.exists || snap.data()?.deleted) return apiError('Not found', 404)
  const data = snap.data()!
  const scope = resolveOrgScope(user, (data.orgId as string | undefined) ?? null)
  if (!scope.ok) return apiError(scope.error, scope.status)

  const steps = (data.steps as SequenceStep[] | undefined) ?? []
  if (stepIdx >= steps.length) return apiError('Step not found', 404)

  const body = (await req.json().catch(() => ({}))) as Partial<AbConfig>
  const current: AbConfig = (steps[stepIdx].ab as AbConfig | undefined) ?? EMPTY_AB
  const next: AbConfig = { ...current, ...body, variants: body.variants ?? current.variants }

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

  // Update the single step's ab field, in place.
  const nextSteps = steps.slice()
  nextSteps[stepIdx] = { ...nextSteps[stepIdx], ab: next }

  await adminDb.collection('sequences').doc(id).update({
    steps: nextSteps,
    ...lastActorFrom(user),
  })

  return apiSuccess({ sequenceId: id, stepNumber: stepIdx, ab: next })
})
