// app/api/v1/sequences/[id]/steps/[stepNumber]/route.ts
//
// Patch a single step's branch / waitUntil (and basic fields) without
// rewriting the whole sequence document. Useful for the branching editor UI.

import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { resolveOrgScope } from '@/lib/api/orgScope'
import { apiSuccess, apiError } from '@/lib/api/response'
import { FieldValue } from 'firebase-admin/firestore'
import type { ApiUser } from '@/lib/api/types'
import type { SequenceStep } from '@/lib/sequences/types'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string; stepNumber: string }> }

const PATCHABLE_FIELDS: Array<keyof SequenceStep> = [
  'delayDays',
  'subject',
  'bodyHtml',
  'bodyText',
  'ab',
  'topicId',
  'branch',
  'waitUntil',
]

export const PATCH = withAuth('client', async (req: NextRequest, user: ApiUser, context?: unknown) => {
  const { id, stepNumber } = await (context as Params).params
  const stepIdx = parseInt(stepNumber, 10)
  if (!Number.isInteger(stepIdx) || stepIdx < 0) {
    return apiError('stepNumber must be a non-negative integer', 400)
  }

  const snap = await adminDb.collection('sequences').doc(id).get()
  if (!snap.exists || snap.data()?.deleted) return apiError('Not found', 404)
  const scope = resolveOrgScope(user, (snap.data()?.orgId as string | undefined) ?? null)
  if (!scope.ok) return apiError(scope.error, scope.status)

  const body = (await req.json().catch(() => ({}))) as Partial<SequenceStep>
  const steps: SequenceStep[] = Array.isArray(snap.data()?.steps) ? snap.data()!.steps : []
  if (stepIdx >= steps.length) return apiError('Step does not exist', 404)

  const merged: SequenceStep = { ...steps[stepIdx] }
  for (const field of PATCHABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(merged as any)[field] = (body as any)[field]
    }
  }

  // Validate branch shape if present.
  if (merged.branch) {
    if (!Array.isArray(merged.branch.rules)) {
      return apiError('branch.rules must be an array', 400)
    }
    if (typeof merged.branch.defaultNextStepNumber !== 'number') {
      return apiError('branch.defaultNextStepNumber must be a number', 400)
    }
    for (const rule of merged.branch.rules) {
      if (typeof rule.nextStepNumber !== 'number') {
        return apiError('branch.rules[].nextStepNumber must be a number', 400)
      }
      if (typeof rule.evaluateAfterDays !== 'number' || rule.evaluateAfterDays < 0) {
        return apiError('branch.rules[].evaluateAfterDays must be a non-negative number', 400)
      }
      if (!rule.condition || typeof rule.condition !== 'object' || typeof (rule.condition as { kind?: string }).kind !== 'string') {
        return apiError('branch.rules[].condition.kind is required', 400)
      }
    }
  }

  // Validate waitUntil if present.
  if (merged.waitUntil) {
    if (!merged.waitUntil.condition || typeof (merged.waitUntil.condition as { kind?: string }).kind !== 'string') {
      return apiError('waitUntil.condition.kind is required', 400)
    }
    if (typeof merged.waitUntil.maxWaitDays !== 'number' || merged.waitUntil.maxWaitDays < 0) {
      return apiError('waitUntil.maxWaitDays must be a non-negative number', 400)
    }
    if (merged.waitUntil.onTimeout !== 'send' && merged.waitUntil.onTimeout !== 'exit') {
      return apiError("waitUntil.onTimeout must be 'send' or 'exit'", 400)
    }
  }

  const nextSteps = steps.map((s, i) => (i === stepIdx ? merged : s))
  await adminDb
    .collection('sequences')
    .doc(id)
    .update({ steps: nextSteps, updatedAt: FieldValue.serverTimestamp() })

  return apiSuccess({ id, stepNumber: stepIdx, step: merged })
})
