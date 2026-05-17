/**
 * GET /api/v1/forms/:id/submissions — list submissions for a form
 *
 * Filters: status, from (ISO), to (ISO), page, limit.
 * Sort: submittedAt desc.
 * Auth: viewer+
 */
import { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withCrmAuth } from '@/lib/auth/crm-middleware'
import { apiSuccess, apiError } from '@/lib/api/response'
import {
  VALID_SUBMISSION_STATUSES,
  type FormSubmission,
} from '@/lib/forms/types'

export const dynamic = 'force-dynamic'

type RouteCtx = { params: Promise<{ id: string }> }

export const GET = withCrmAuth<RouteCtx>('viewer', async (req, ctx, routeCtx) => {
  const { id } = await routeCtx!.params

  // Preflight: verify form exists + belongs to caller's org + not deleted
  const formSnap = await adminDb.collection('forms').doc(id).get()
  if (!formSnap.exists) return apiError('Form not found', 404)
  const formData = formSnap.data()!
  if (formData.orgId !== ctx.orgId) return apiError('Form not found', 404)
  if (formData.deleted === true) return apiError('Form not found', 404)

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') as FormSubmission['status'] | null
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200)
  const page = Math.max(parseInt(searchParams.get('page') ?? '1'), 1)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = adminDb
    .collection('form_submissions')
    .where('formId', '==', id)
    .where('orgId', '==', ctx.orgId)
    .orderBy('submittedAt', 'desc')

  if (status && VALID_SUBMISSION_STATUSES.includes(status)) {
    query = query.where('status', '==', status)
  }
  if (from) {
    const ts = Timestamp.fromDate(new Date(from))
    query = query.where('submittedAt', '>=', ts)
  }
  if (to) {
    const ts = Timestamp.fromDate(new Date(to))
    query = query.where('submittedAt', '<=', ts)
  }

  const snapshot = await query
    .limit(limit)
    .offset((page - 1) * limit)
    .get()

  const submissions: FormSubmission[] = snapshot.docs.map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (doc: any) => ({ id: doc.id, ...doc.data() }),
  )

  return apiSuccess(submissions, 200, {
    total: submissions.length,
    page,
    limit,
  })
})
