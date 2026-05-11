/**
 * GET    /api/v1/crm/segments/:id  — get one segment
 * PUT    /api/v1/crm/segments/:id  — update name, description, filters
 * DELETE /api/v1/crm/segments/:id  — soft delete (sets deleted: true)
 *
 * Auth: admin or ai
 */
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { resolveOrgScope } from '@/lib/api/orgScope'
import { apiSuccess, apiError } from '@/lib/api/response'
import { sanitizeSegmentFilters } from '@/lib/crm/segments'

const ARRAY_CONTAINS_ANY_LIMIT = 10

type Params = { params: Promise<{ id: string }> }

const sanitizeFilters = sanitizeSegmentFilters

export const GET = withAuth('client', async (_req, user, context) => {
  const { id } = await (context as Params).params
  const doc = await adminDb.collection('segments').doc(id).get()
  if (!doc.exists) return apiError('Segment not found', 404)
  const data = doc.data() ?? {}
  if (data.deleted === true) return apiError('Segment not found', 404)
  const scope = resolveOrgScope(user, (data.orgId as string | undefined) ?? null)
  if (!scope.ok) return apiError(scope.error, scope.status)
  return apiSuccess({ id: doc.id, ...data })
})

export const PUT = withAuth('client', async (req, user, context) => {
  const { id } = await (context as Params).params
  const doc = await adminDb.collection('segments').doc(id).get()
  if (!doc.exists) return apiError('Segment not found', 404)
  const scope = resolveOrgScope(user, (doc.data()?.orgId as string | undefined) ?? null)
  if (!scope.ok) return apiError(scope.error, scope.status)

  const body = (await req.json()) as Record<string, unknown>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: Record<string, any> = {
    updatedAt: FieldValue.serverTimestamp(),
  }

  if (typeof body.name === 'string') {
    const name = body.name.trim()
    if (!name) return apiError('Name cannot be empty', 400)
    update.name = name
  }
  if (typeof body.description === 'string') {
    update.description = body.description.trim()
  }
  if (body.filters !== undefined) {
    const filters = sanitizeFilters(body.filters)
    if ((filters.tags?.length ?? 0) > ARRAY_CONTAINS_ANY_LIMIT) {
      return apiError(
        `tags filter supports up to ${ARRAY_CONTAINS_ANY_LIMIT} values (array-contains-any limit)`,
        400,
      )
    }
    update.filters = filters
  }

  await adminDb.collection('segments').doc(id).update(update)
  return apiSuccess({ id })
})

export const DELETE = withAuth('client', async (_req, user, context) => {
  const { id } = await (context as Params).params
  const doc = await adminDb.collection('segments').doc(id).get()
  if (!doc.exists) return apiError('Segment not found', 404)
  const scope = resolveOrgScope(user, (doc.data()?.orgId as string | undefined) ?? null)
  if (!scope.ok) return apiError(scope.error, scope.status)

  await adminDb.collection('segments').doc(id).update({
    deleted: true,
    updatedAt: FieldValue.serverTimestamp(),
  })
  return apiSuccess({ id })
})
