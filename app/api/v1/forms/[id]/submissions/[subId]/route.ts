/**
 * GET   /api/v1/forms/:id/submissions/:subId — fetch a submission
 * PATCH /api/v1/forms/:id/submissions/:subId — update submission status
 *
 * Auth: GET → viewer+, PATCH → admin+
 */
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withCrmAuth } from '@/lib/auth/crm-middleware'
import { apiSuccess, apiError } from '@/lib/api/response'
import {
  VALID_SUBMISSION_STATUSES,
  type FormSubmission,
} from '@/lib/forms/types'

export const dynamic = 'force-dynamic'

type SubRouteCtx = { params: Promise<{ id: string; subId: string }> }

export const GET = withCrmAuth<SubRouteCtx>('viewer', async (_req, ctx, routeCtx) => {
  const { id, subId } = await routeCtx!.params

  const subSnap = await adminDb.collection('form_submissions').doc(subId).get()
  if (!subSnap.exists) return apiError('Submission not found', 404)
  const sub = subSnap.data() as FormSubmission
  if (sub.orgId !== ctx.orgId) return apiError('Submission not found', 404)
  if (sub.formId !== id) return apiError('Submission not found', 404)

  return apiSuccess({ submission: { ...sub, id: subSnap.id } })
})

export const PATCH = withCrmAuth<SubRouteCtx>('admin', async (req, ctx, routeCtx) => {
  const { id, subId } = await routeCtx!.params

  const ref = adminDb.collection('form_submissions').doc(subId)
  const snap = await ref.get()
  if (!snap.exists) return apiError('Submission not found', 404)
  const sub = snap.data() as FormSubmission
  if (sub.orgId !== ctx.orgId) return apiError('Submission not found', 404)
  if (sub.formId !== id) return apiError('Submission not found', 404)

  const body = (await req.json()) as Record<string, unknown>

  if (!body.status || !VALID_SUBMISSION_STATUSES.includes(body.status as FormSubmission['status'])) {
    return apiError('Invalid status; expected new | read | archived', 400)
  }

  const actorRef = ctx.actor
  const patch: Record<string, unknown> = {
    status: body.status,
    updatedByRef: actorRef,
    updatedAt: FieldValue.serverTimestamp(),
  }

  // Omit updatedBy uid for agent calls
  if (!ctx.isAgent) {
    patch.updatedBy = actorRef.uid
  }

  // Sanitize: strip undefined values
  const sanitized = Object.fromEntries(
    Object.entries(patch).filter(([, v]) => v !== undefined),
  )

  await ref.update(sanitized)

  return apiSuccess({ submission: { ...sub, ...sanitized, id: subId } })
})
