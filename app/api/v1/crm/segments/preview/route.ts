/**
 * POST /api/v1/crm/segments/preview
 *
 * Live-resolves a SegmentFilters payload without persisting anything. Used by
 * the segment rule builder UI to show "matches N contacts" on debounce.
 *
 * Body: { orgId?: string, filters: SegmentFilters }
 * Returns: { count: number, sample: Contact[] (first 10) }
 *
 * Auth: client (admin / ai inherit).
 */
import { withAuth } from '@/lib/api/auth'
import { resolveOrgScope } from '@/lib/api/orgScope'
import { apiSuccess, apiError } from '@/lib/api/response'
import { resolveSegmentContacts, sanitizeSegmentFilters } from '@/lib/crm/segments'

const SAMPLE_SIZE = 10

export const POST = withAuth('client', async (req, user) => {
  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return apiError('Invalid JSON body', 400)
  }

  const requestedOrgId = typeof body.orgId === 'string' ? body.orgId.trim() : null
  const scope = resolveOrgScope(user, requestedOrgId)
  if (!scope.ok) return apiError(scope.error, scope.status)
  const orgId = scope.orgId

  const filters = sanitizeSegmentFilters(body.filters)
  if ((filters.tags?.length ?? 0) > 10) {
    return apiError('tags filter supports up to 10 values', 400)
  }

  const contacts = await resolveSegmentContacts(orgId, filters)
  return apiSuccess({
    count: contacts.length,
    sample: contacts.slice(0, SAMPLE_SIZE),
  })
})
