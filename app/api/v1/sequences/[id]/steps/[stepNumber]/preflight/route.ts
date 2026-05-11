// app/api/v1/sequences/[id]/steps/[stepNumber]/preflight/route.ts
//
// POST — run the pre-send preflight checklist against a single sequence step.
// Auth: client.
import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { resolveOrgScope } from '@/lib/api/orgScope'
import { apiSuccess, apiError } from '@/lib/api/response'
import { runPreflight } from '@/lib/email/preflight'
import { preflightInputForSequenceStep } from '@/lib/email/preflight-source'
import type { SequenceStep } from '@/lib/sequences/types'
import type { ApiUser } from '@/lib/api/types'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string; stepNumber: string }> }

export const POST = withAuth('client', async (_req: NextRequest, user: ApiUser, context?: unknown) => {
  const { id, stepNumber } = await (context as Params).params
  const idx = parseInt(stepNumber, 10)
  if (!Number.isFinite(idx) || idx < 0) return apiError('Invalid stepNumber', 400)

  const snap = await adminDb.collection('sequences').doc(id).get()
  if (!snap.exists || snap.data()?.deleted) return apiError('Sequence not found', 404)
  const data = snap.data()!
  const scope = resolveOrgScope(user, (data.orgId as string | undefined) ?? null)
  if (!scope.ok) return apiError(scope.error, scope.status)

  const steps = (data.steps as SequenceStep[] | undefined) ?? []
  if (idx >= steps.length) return apiError('Step not found', 404)
  const step = steps[idx]

  // Sequences don't have per-sequence from-overrides today — the cron resolves
  // sender from the org defaults. We pass orgId so the preflight resolver
  // still surfaces "shared-domain" / "no display-name" info.
  const input = await preflightInputForSequenceStep(
    { orgId: data.orgId as string },
    step,
  )
  const report = await runPreflight(input)
  return apiSuccess({ sequenceId: id, stepNumber: idx, report })
})
