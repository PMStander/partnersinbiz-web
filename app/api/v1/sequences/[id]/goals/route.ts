// app/api/v1/sequences/[id]/goals/route.ts
//
// Replace the goals array on a sequence. Goals fire BEFORE every step
// and exit the enrollment when matched.

import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { resolveOrgScope } from '@/lib/api/orgScope'
import { apiSuccess, apiError } from '@/lib/api/response'
import { FieldValue } from 'firebase-admin/firestore'
import type { ApiUser } from '@/lib/api/types'
import type { SequenceGoal } from '@/lib/sequences/types'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export const PUT = withAuth('client', async (req: NextRequest, user: ApiUser, context?: unknown) => {
  const { id } = await (context as Params).params
  const snap = await adminDb.collection('sequences').doc(id).get()
  if (!snap.exists || snap.data()?.deleted) return apiError('Not found', 404)
  const scope = resolveOrgScope(user, (snap.data()?.orgId as string | undefined) ?? null)
  if (!scope.ok) return apiError(scope.error, scope.status)

  const body = await req.json().catch(() => ({}))
  const goals = Array.isArray(body?.goals) ? (body.goals as SequenceGoal[]) : null
  if (goals === null) return apiError('goals must be an array', 400)

  for (const goal of goals) {
    if (!goal?.id || typeof goal.id !== 'string') {
      return apiError('Each goal must have an id', 400)
    }
    if (!goal?.label || typeof goal.label !== 'string') {
      return apiError('Each goal must have a label', 400)
    }
    if (!goal?.condition || typeof (goal.condition as { kind?: string }).kind !== 'string') {
      return apiError('Each goal must have a condition.kind', 400)
    }
  }

  await adminDb.collection('sequences').doc(id).update({
    goals,
    updatedAt: FieldValue.serverTimestamp(),
  })

  return apiSuccess({ id, goals })
})

export const GET = withAuth('client', async (req: NextRequest, user: ApiUser, context?: unknown) => {
  const { id } = await (context as Params).params
  const snap = await adminDb.collection('sequences').doc(id).get()
  if (!snap.exists || snap.data()?.deleted) return apiError('Not found', 404)
  const scope = resolveOrgScope(user, (snap.data()?.orgId as string | undefined) ?? null)
  if (!scope.ok) return apiError(scope.error, scope.status)
  return apiSuccess({ id, goals: snap.data()?.goals ?? [] })
})
