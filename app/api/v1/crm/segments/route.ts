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
import type { Segment, SegmentFilters, SegmentInput } from '@/lib/crm/segments'

const ARRAY_CONTAINS_ANY_LIMIT = 10

function sanitizeFilters(input: unknown): SegmentFilters {
  const f = (input ?? {}) as Record<string, unknown>
  const filters: SegmentFilters = {}
  if (Array.isArray(f.tags)) {
    filters.tags = f.tags.filter((t): t is string => typeof t === 'string' && !!t)
  }
  if (Array.isArray(f.capturedFromIds)) {
    filters.capturedFromIds = f.capturedFromIds.filter(
      (t): t is string => typeof t === 'string' && !!t,
    )
  }
  if (typeof f.stage === 'string') filters.stage = f.stage as SegmentFilters['stage']
  if (typeof f.type === 'string') filters.type = f.type as SegmentFilters['type']
  if (typeof f.source === 'string') filters.source = f.source as SegmentFilters['source']
  if (f.createdAfter != null) {
    // Pass through whatever shape is provided (Timestamp instance from admin SDK,
    // or a serialized form the caller will need to normalise upstream).
    filters.createdAfter = f.createdAfter as SegmentFilters['createdAfter']
  }
  return filters
}

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
