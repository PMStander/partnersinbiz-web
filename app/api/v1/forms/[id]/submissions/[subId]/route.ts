/**
 * GET   /api/v1/forms/:id/submissions/:subId — fetch a submission
 * PATCH /api/v1/forms/:id/submissions/:subId — update submission status
 *
 * Auth: admin (AI/admin)
 */
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import {
  VALID_SUBMISSION_STATUSES,
  type FormSubmission,
} from '@/lib/forms/types'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string; subId: string }> }

async function loadSubmission(
  formId: string,
  subId: string,
): Promise<
  | { ok: true; ref: FirebaseFirestore.DocumentReference; data: FormSubmission }
  | { ok: false }
> {
  const ref = adminDb.collection('form_submissions').doc(subId)
  const doc = await ref.get()
  if (!doc.exists) return { ok: false }
  const data = doc.data() as FormSubmission | undefined
  if (!data || data.formId !== formId) return { ok: false }
  return { ok: true, ref, data: { ...data, id: doc.id } }
}

export const GET = withAuth('admin', async (_req, _user, context) => {
  const { id, subId } = await (context as RouteContext).params
  const result = await loadSubmission(id, subId)
  if (!result.ok) return apiError('Submission not found', 404)
  return apiSuccess(result.data)
})

export const PATCH = withAuth('admin', async (req, _user, context) => {
  const { id, subId } = await (context as RouteContext).params
  const result = await loadSubmission(id, subId)
  if (!result.ok) return apiError('Submission not found', 404)

  const body = (await req.json()) as Record<string, unknown>
  const updates: Record<string, unknown> = {}

  if (body.status !== undefined) {
    if (!VALID_SUBMISSION_STATUSES.includes(body.status as FormSubmission['status'])) {
      return apiError('Invalid status; expected new | read | archived')
    }
    updates.status = body.status
  }

  if (Object.keys(updates).length === 0) {
    return apiError('No updatable fields provided (status is the only one)')
  }

  await result.ref.update(updates)

  const after = await result.ref.get()
  return apiSuccess({ ...(after.data() as FormSubmission), id: after.id })
})
