/**
 * GET    /api/v1/time-entries/:id — fetch a single time entry
 * PUT    /api/v1/time-entries/:id — update (rejected if already billed)
 * DELETE /api/v1/time-entries/:id — soft delete (rejected if already billed)
 *
 * Auth: admin (AI/admin)
 */
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { lastActorFrom } from '@/lib/api/actor'
import { apiSuccess, apiError } from '@/lib/api/response'
import type { TimeEntry } from '@/lib/time-tracking/types'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

export const GET = withAuth('admin', async (_req, _user, context) => {
  const { id } = await (context as RouteContext).params
  const doc = await adminDb.collection('time_entries').doc(id).get()
  if (!doc.exists) return apiError('Time entry not found', 404)
  const data = doc.data() as TimeEntry | undefined
  if (!data || data.deleted === true) return apiError('Time entry not found', 404)
  return apiSuccess({ ...data, id: doc.id })
})

const UPDATABLE_FIELDS = [
  'description',
  'projectId',
  'taskId',
  'clientOrgId',
  'startAt',
  'endAt',
  'billable',
  'hourlyRate',
  'currency',
  'tags',
] as const

export const PUT = withAuth('admin', async (req, user, context) => {
  const { id } = await (context as RouteContext).params
  const ref = adminDb.collection('time_entries').doc(id)
  const doc = await ref.get()
  if (!doc.exists) return apiError('Time entry not found', 404)
  const existing = doc.data() as TimeEntry | undefined
  if (!existing || existing.deleted === true) {
    return apiError('Time entry not found', 404)
  }

  if (existing.invoiceId) {
    return apiError('Cannot modify a billed entry', 409)
  }

  const body = (await req.json()) as Record<string, unknown>

  const updates: Record<string, unknown> = {}
  for (const key of UPDATABLE_FIELDS) {
    if (body[key] !== undefined) updates[key] = body[key]
  }

  // Recompute durationMinutes if either boundary changed.
  const startChanged = updates.startAt !== undefined
  const endChanged = updates.endAt !== undefined
  if (startChanged || endChanged) {
    const startAt = (updates.startAt as string | undefined) ?? existing.startAt
    const endAt = (updates.endAt as string | null | undefined) ?? existing.endAt

    if (!startAt) return apiError('startAt is required')
    const startMs = Date.parse(startAt)
    if (Number.isNaN(startMs)) return apiError('startAt must be a valid ISO timestamp')

    if (endAt === null) {
      // Transitioning back to running — zero duration.
      updates.durationMinutes = 0
    } else if (endAt) {
      const endMs = Date.parse(endAt)
      if (Number.isNaN(endMs)) return apiError('endAt must be a valid ISO timestamp')
      if (endMs < startMs) return apiError('endAt must be after startAt')
      updates.durationMinutes = Math.round((endMs - startMs) / 60000)
    }
  }

  await ref.update({
    ...updates,
    ...lastActorFrom(user),
  })

  return apiSuccess({ id, ...updates })
})

export const DELETE = withAuth('admin', async (_req, user, context) => {
  const { id } = await (context as RouteContext).params
  const ref = adminDb.collection('time_entries').doc(id)
  const doc = await ref.get()
  if (!doc.exists) return apiError('Time entry not found', 404)
  const existing = doc.data() as TimeEntry | undefined
  if (!existing || existing.deleted === true) {
    return apiError('Time entry not found', 404)
  }

  if (existing.invoiceId) {
    return apiError('Cannot delete a billed entry, unlink invoice first', 409)
  }

  await ref.update({
    deleted: true,
    ...lastActorFrom(user),
  })

  return apiSuccess({ id, deleted: true })
})
