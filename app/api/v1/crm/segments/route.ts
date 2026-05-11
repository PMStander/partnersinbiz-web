/**
 * GET  /api/v1/crm/segments?orgId=...  — list segments for an org
 * POST /api/v1/crm/segments            — create a new segment
 *
 * Auth: admin or ai
 */
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { resolveOrgScope } from '@/lib/api/orgScope'
import { apiSuccess, apiError } from '@/lib/api/response'
import {
  sanitizeSegmentFilters as sanitizeFilters,
} from '@/lib/crm/segments'
import type { Segment, SegmentInput } from '@/lib/crm/segments'

const ARRAY_CONTAINS_ANY_LIMIT = 10

export const GET = withAuth('client', async (req, user) => {
  const { searchParams } = new URL(req.url)
  const scope = resolveOrgScope(user, searchParams.get('orgId'))
  if (!scope.ok) return apiError(scope.error, scope.status)
  const orgId = scope.orgId

  const snapshot = await adminDb
    .collection('segments')
    .where('orgId', '==', orgId)
    .orderBy('createdAt', 'desc')
    .get()

  const segments: Segment[] = snapshot.docs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((doc: any) => ({ id: doc.id, ...doc.data() }))
    .filter((s: Segment) => s.deleted !== true)

  return apiSuccess(segments, 200, { total: segments.length, page: 1, limit: segments.length })
})

export const POST = withAuth('client', async (req, user) => {
  const body = (await req.json()) as Partial<SegmentInput>

  const requestedOrgId = typeof body.orgId === 'string' ? body.orgId.trim() : null
  const scope = resolveOrgScope(user, requestedOrgId)
  if (!scope.ok) return apiError(scope.error, scope.status)
  const orgId = scope.orgId

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) return apiError('Name is required', 400)

  const description = typeof body.description === 'string' ? body.description.trim() : ''

  const filters = sanitizeFilters(body.filters)
  if ((filters.tags?.length ?? 0) > ARRAY_CONTAINS_ANY_LIMIT) {
    return apiError(
      `tags filter supports up to ${ARRAY_CONTAINS_ANY_LIMIT} values (array-contains-any limit)`,
      400,
    )
  }

  const docRef = await adminDb.collection('segments').add({
    orgId,
    name,
    description,
    filters,
    deleted: false,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })

  return apiSuccess({ id: docRef.id }, 201)
})
