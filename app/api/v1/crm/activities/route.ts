/**
 * GET  /api/v1/crm/activities  — list activities (filterable, paginated)
 * POST /api/v1/crm/activities  — log an activity
 *
 * Query params (GET): contactId, type, limit (default 50, max 200), page,
 *                     dateFrom (ISO), dateTo (ISO)
 *
 * type supports comma-separated values: type=note,email_sent (up to 10)
 */
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withCrmAuth } from '@/lib/auth/crm-middleware'
import { apiSuccess, apiError } from '@/lib/api/response'
import type { ActivityType } from '@/lib/crm/types'

const VALID_TYPES: ActivityType[] = [
  'email_sent', 'email_received', 'call', 'note',
  'stage_change', 'sequence_enrolled', 'sequence_completed',
]

export const GET = withCrmAuth('viewer', async (req, ctx) => {
  const { searchParams } = new URL(req.url)
  const contactId = searchParams.get('contactId') ?? undefined
  const typeParam = (searchParams.get('type') ?? '').trim()
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '50', 10), 1), 200)
  const page = Math.max(parseInt(searchParams.get('page') ?? '1', 10), 1)
  const dateFrom = searchParams.get('dateFrom')
  const dateTo = searchParams.get('dateTo')

  // Parse type filter — comma-separated, validated against VALID_TYPES, max 10 (Firestore 'in' limit)
  const typeFilters: ActivityType[] = typeParam
    ? typeParam
        .split(',')
        .map((t) => t.trim() as ActivityType)
        .filter((t) => VALID_TYPES.includes(t))
        .slice(0, 10)
    : []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = adminDb.collection('activities').where('orgId', '==', ctx.orgId)
  if (contactId) query = query.where('contactId', '==', contactId)
  if (typeFilters.length === 1) {
    query = query.where('type', '==', typeFilters[0])
  } else if (typeFilters.length > 1) {
    query = query.where('type', 'in', typeFilters)
  }
  if (dateFrom) query = query.where('createdAt', '>=', new Date(dateFrom))
  if (dateTo) query = query.where('createdAt', '<=', new Date(dateTo))

  const offset = (page - 1) * limit
  query = query.orderBy('createdAt', 'desc').limit(limit).offset(offset)

  const snap = await query.get()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activities = snap.docs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((d: any) => ({ id: d.id, ...d.data() }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((a: any) => a.deleted !== true)
  return apiSuccess({ activities, page, limit })
})

export const POST = withCrmAuth('member', async (req, ctx) => {
  const body = await req.json()

  if (!body.contactId || typeof body.contactId !== 'string' || !body.contactId.trim()) {
    return apiError('contactId required', 400)
  }
  if (!body.type || !VALID_TYPES.includes(body.type as ActivityType)) {
    return apiError('Invalid type', 400)
  }
  if (!body.summary || typeof body.summary !== 'string' || !body.summary.trim()) {
    return apiError('summary required', 400)
  }

  // PR 3 pattern 1: use ctx.actor directly (no snapshotForWrite)
  const actorRef = ctx.actor

  const docData = {
    orgId: ctx.orgId,
    contactId: body.contactId.trim(),
    dealId: typeof body.dealId === 'string' ? body.dealId : '',
    type: body.type as ActivityType,
    summary: body.summary.trim(),
    metadata: typeof body.metadata === 'object' && body.metadata !== null ? body.metadata : {},
    createdBy: ctx.isAgent ? undefined : ctx.actor.uid,
    createdByRef: actorRef,
    createdAt: FieldValue.serverTimestamp(),
  }

  // Firestore rejects undefined values — strip them before write
  const sanitized = Object.fromEntries(Object.entries(docData).filter(([, v]) => v !== undefined))
  const docRef = await adminDb.collection('activities').add(sanitized)
  return apiSuccess({ id: docRef.id, ...sanitized }, 201)
})
