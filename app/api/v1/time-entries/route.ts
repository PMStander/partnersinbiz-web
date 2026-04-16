/**
 * GET  /api/v1/time-entries — list time entries (filterable, paginated)
 * POST /api/v1/time-entries — create a completed time entry (idempotent)
 *
 * Auth: admin (AI/admin)
 *
 * GET query params:
 *   orgId       required
 *   userId      optional
 *   projectId   optional
 *   taskId      optional
 *   clientOrgId optional
 *   from        ISO — startAt >=
 *   to          ISO — startAt <=
 *   billable    'true' | 'false'
 *   billed      'true' (invoiceId != null) | 'false' (invoiceId == null)
 *   running     'true' (endAt == null)
 *   page, limit (defaults 1, 50; max 200)
 *
 * POST body (completed entry): either
 *   { description, startAt, endAt }                 — duration computed
 *   { description, startAt, durationMinutes }       — endAt computed
 *   { description, startAt, endAt, durationMinutes } — validated consistent
 */
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { withIdempotency } from '@/lib/api/idempotency'
import { actorFrom } from '@/lib/api/actor'
import { apiSuccess, apiError } from '@/lib/api/response'
import type { TimeEntry, TimeEntryInput } from '@/lib/time-tracking/types'

export const dynamic = 'force-dynamic'

export const GET = withAuth('admin', async (req) => {
  const { searchParams } = new URL(req.url)

  const orgId = searchParams.get('orgId')
  if (!orgId) return apiError('orgId is required; pass it as a query param')

  const userId = searchParams.get('userId')
  const projectId = searchParams.get('projectId')
  const taskId = searchParams.get('taskId')
  const clientOrgId = searchParams.get('clientOrgId')
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const billable = searchParams.get('billable')
  const billed = searchParams.get('billed')
  const running = searchParams.get('running')

  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200)
  const page = Math.max(parseInt(searchParams.get('page') ?? '1'), 1)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = adminDb
    .collection('time_entries')
    .where('orgId', '==', orgId)
    .orderBy('startAt', 'desc')

  if (userId) query = query.where('userId', '==', userId)
  if (projectId) query = query.where('projectId', '==', projectId)
  if (taskId) query = query.where('taskId', '==', taskId)
  if (clientOrgId) query = query.where('clientOrgId', '==', clientOrgId)
  if (from) query = query.where('startAt', '>=', from)
  if (to) query = query.where('startAt', '<=', to)
  if (billable === 'true') query = query.where('billable', '==', true)
  if (billable === 'false') query = query.where('billable', '==', false)
  if (billed === 'true') query = query.where('invoiceId', '!=', null)
  if (billed === 'false') query = query.where('invoiceId', '==', null)
  if (running === 'true') query = query.where('endAt', '==', null)

  const snapshot = await query
    .limit(limit)
    .offset((page - 1) * limit)
    .get()

  const entries: TimeEntry[] = snapshot.docs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((doc: any) => ({ id: doc.id, ...doc.data() }))
    .filter((e: TimeEntry) => e.deleted !== true)

  return apiSuccess(entries, 200, { total: entries.length, page, limit })
})

export const POST = withAuth(
  'admin',
  withIdempotency(async (req, user) => {
    const body = (await req.json()) as TimeEntryInput & { orgId?: string }

    if (!body.orgId?.trim()) return apiError('orgId is required')
    if (!body.description?.trim()) return apiError('description is required')
    if (!body.startAt) return apiError('startAt is required (ISO timestamp)')

    const startMs = Date.parse(body.startAt)
    if (Number.isNaN(startMs)) return apiError('startAt must be a valid ISO timestamp')

    let endAt: string | null = body.endAt ?? null
    let durationMinutes: number

    if (body.endAt) {
      const endMs = Date.parse(body.endAt)
      if (Number.isNaN(endMs)) return apiError('endAt must be a valid ISO timestamp')
      if (endMs < startMs) return apiError('endAt must be after startAt')
      const computed = Math.round((endMs - startMs) / 60000)
      if (body.durationMinutes !== undefined && Math.abs(body.durationMinutes - computed) > 1) {
        return apiError(
          'durationMinutes does not match (endAt - startAt); omit one or fix the mismatch',
        )
      }
      durationMinutes = body.durationMinutes ?? computed
    } else if (body.durationMinutes !== undefined) {
      if (body.durationMinutes < 0) return apiError('durationMinutes must be >= 0')
      durationMinutes = body.durationMinutes
      endAt = new Date(startMs + durationMinutes * 60000).toISOString()
    } else {
      return apiError(
        'Provide endAt or durationMinutes to create a completed entry; use /start for a running timer',
      )
    }

    const docRef = await adminDb.collection('time_entries').add({
      orgId: body.orgId.trim(),
      userId: body.userId ?? user.uid,
      projectId: body.projectId ?? null,
      taskId: body.taskId ?? null,
      clientOrgId: body.clientOrgId ?? null,
      description: body.description.trim(),
      startAt: body.startAt,
      endAt,
      durationMinutes,
      billable: body.billable ?? true,
      hourlyRate: body.hourlyRate ?? null,
      currency: body.currency ?? 'ZAR',
      invoiceId: null,
      tags: body.tags ?? [],
      ...actorFrom(user),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      deleted: false,
    })

    return apiSuccess({ id: docRef.id, durationMinutes }, 201)
  }),
)
