/**
 * GET  /api/v1/crm/activities  — list activities (filterable, paginated)
 * POST /api/v1/crm/activities  — log an activity
 *
 * Query params (GET): contactId, type, orgId, limit (default 50, max 200), page,
 *                     dateFrom (ISO), dateTo (ISO)
 *
 * type supports comma-separated values: type=note,email_sent (up to 10)
 */
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { resolveOrgScope } from '@/lib/api/orgScope'
import { apiSuccess, apiError } from '@/lib/api/response'
import type { ActivityInput, ActivityType } from '@/lib/crm/types'

const VALID_TYPES: ActivityType[] = [
  'email_sent', 'email_received', 'call', 'note',
  'stage_change', 'sequence_enrolled', 'sequence_completed',
]

function parseDate(value: string | null): Date | null {
  if (!value) return null
  const d = new Date(value)
  return isNaN(d.getTime()) ? null : d
}

export const GET = withAuth('client', async (req, user) => {
  const { searchParams } = new URL(req.url)
  const contactId = (searchParams.get('contactId') ?? '').trim()
  const typeParam = (searchParams.get('type') ?? '').trim()
  const requestedOrgId = searchParams.get('orgId')
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '50'), 1), 200)
  const page = Math.max(parseInt(searchParams.get('page') ?? '1'), 1)

  // Parse type filter — comma-separated, validated against VALID_TYPES, max 10 (Firestore 'in' limit)
  const typeFilters: ActivityType[] = typeParam
    ? typeParam
        .split(',')
        .map((t) => t.trim() as ActivityType)
        .filter((t) => VALID_TYPES.includes(t))
        .slice(0, 10)
    : []

  // Parse date range (invalid values are silently ignored)
  const dateFrom = parseDate(searchParams.get('dateFrom'))
  const dateTo = parseDate(searchParams.get('dateTo'))

  if (!contactId && !requestedOrgId && user.role !== 'client') {
    return apiError('contactId or orgId is required', 400)
  }

  let orgId = ''
  if (contactId) {
    const contactSnap = await adminDb.collection('contacts').doc(contactId).get()
    if (!contactSnap.exists) return apiError('Contact not found', 404)
    const contactOrgId = (contactSnap.data() as { orgId?: string })?.orgId ?? ''
    const scope = resolveOrgScope(user, contactOrgId)
    if (!scope.ok) return apiError(scope.error, scope.status)
    if (scope.orgId !== contactOrgId) {
      return apiError('Cannot access a different organisation', 403)
    }
    orgId = contactOrgId
  } else {
    const scope = resolveOrgScope(user, requestedOrgId)
    if (!scope.ok) return apiError(scope.error, scope.status)
    orgId = scope.orgId
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = adminDb.collection('activities').where('orgId', '==', orgId)
  if (contactId) {
    query = query.where('contactId', '==', contactId)
  }
  if (typeFilters.length === 1) {
    query = query.where('type', '==', typeFilters[0])
  } else if (typeFilters.length > 1) {
    query = query.where('type', 'in', typeFilters)
  }

  // Date range — Firestore allows range on createdAt when the equality filters
  // are on different fields (orgId/contactId). Fall back to in-memory if needed.
  let useDateInMemory = false
  if (dateFrom) {
    try {
      query = query.where('createdAt', '>=', Timestamp.fromDate(dateFrom))
    } catch {
      useDateInMemory = true
    }
  }
  if (dateTo && !useDateInMemory) {
    try {
      query = query.where('createdAt', '<=', Timestamp.fromDate(dateTo))
    } catch {
      useDateInMemory = true
    }
  }

  query = query.orderBy('createdAt', 'desc').limit(limit).offset((page - 1) * limit)

  const snap = await query.get()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let activities = snap.docs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((doc: any) => ({ id: doc.id, ...doc.data() }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((a: any) => a.deleted !== true)

  // In-memory date fallback (only runs when Firestore range filter threw)
  if (useDateInMemory) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    activities = activities.filter((a: any) => {
      const ts: Timestamp | undefined = a.createdAt
      if (!ts) return true
      const d = ts.toDate ? ts.toDate() : new Date(ts as unknown as string)
      if (dateFrom && d < dateFrom) return false
      if (dateTo && d > dateTo) return false
      return true
    })
  }

  return apiSuccess(activities, 200, { total: activities.length, page, limit })
})

export const POST = withAuth('client', async (req, user) => {
  const body = await req.json() as ActivityInput
  if (!body.contactId?.trim()) return apiError('contactId is required')
  if (!body.type || !VALID_TYPES.includes(body.type)) return apiError('Invalid activity type')
  if (!body.summary?.trim()) return apiError('summary is required')

  const requestedOrgId = typeof (body as { orgId?: unknown }).orgId === 'string'
    ? ((body as { orgId?: string }).orgId as string).trim()
    : null
  const scope = resolveOrgScope(user, requestedOrgId)
  if (!scope.ok) return apiError(scope.error, scope.status)
  const orgId = scope.orgId

  const docRef = await adminDb.collection('activities').add({
    orgId,
    contactId: body.contactId.trim(),
    dealId: body.dealId ?? '',
    type: body.type,
    summary: body.summary.trim(),
    metadata: body.metadata ?? {},
    createdBy: user.uid,
    createdAt: FieldValue.serverTimestamp(),
  })
  return apiSuccess({ id: docRef.id }, 201)
})
