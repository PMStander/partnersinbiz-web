/**
 * POST /api/v1/crm/segments/:id/resolve
 *
 * Resolves the contacts that match a segment's saved filters.
 * Returns:
 *   - count:    total matched (capped at MAX_RESULTS in the resolver)
 *   - ids:      every matched contact id (so callers can enroll en masse)
 *   - contacts: the first 50 full contact docs (for UI preview)
 *
 * Auth: admin or ai
 */
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { resolveOrgScope } from '@/lib/api/orgScope'
import { apiSuccess, apiError } from '@/lib/api/response'
import { resolveSegmentContacts } from '@/lib/crm/segments'
import type { Segment } from '@/lib/crm/segments'

const PREVIEW_LIMIT = 50

type Params = { params: Promise<{ id: string }> }

export const POST = withAuth('client', async (_req, user, context) => {
  const { id } = await (context as Params).params
  const doc = await adminDb.collection('segments').doc(id).get()
  if (!doc.exists) return apiError('Segment not found', 404)

  const segment = { id: doc.id, ...(doc.data() ?? {}) } as Segment
  if (segment.deleted === true) return apiError('Segment not found', 404)
  if (!segment.orgId) return apiError('Segment has no orgId', 422)

  const scope = resolveOrgScope(user, segment.orgId)
  if (!scope.ok) return apiError(scope.error, scope.status)

  const contacts = await resolveSegmentContacts(segment.orgId, segment.filters ?? {})

  return apiSuccess({
    count: contacts.length,
    ids: contacts.map((c) => c.id),
    contacts: contacts.slice(0, PREVIEW_LIMIT),
  })
})
