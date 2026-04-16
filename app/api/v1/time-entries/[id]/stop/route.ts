/**
 * POST /api/v1/time-entries/:id/stop
 *
 * Stops a running timer. Reads the entry inside a transaction, computes
 * `durationMinutes` from (now - startAt), and writes `endAt = now`.
 *
 * Errors:
 *   404 if entry is missing or soft-deleted
 *   409 if the entry is not running (endAt is already set)
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

class StopError extends Error {
  constructor(public code: 'not_found' | 'already_stopped') {
    super(code)
  }
}

export const POST = withAuth('admin', async (_req, user, context) => {
  const { id } = await (context as RouteContext).params
  const ref = adminDb.collection('time_entries').doc(id)

  let endAtIso = ''
  let durationMinutes = 0

  try {
    await adminDb.runTransaction(async (tx) => {
      const doc = await tx.get(ref)
      if (!doc.exists) throw new StopError('not_found')
      const data = doc.data() as TimeEntry | undefined
      if (!data || data.deleted === true) throw new StopError('not_found')
      if (data.endAt !== null) throw new StopError('already_stopped')

      const startMs = Date.parse(data.startAt)
      const now = new Date()
      endAtIso = now.toISOString()
      durationMinutes = Number.isNaN(startMs)
        ? 0
        : Math.max(0, Math.round((now.getTime() - startMs) / 60000))

      tx.update(ref, {
        endAt: endAtIso,
        durationMinutes,
        ...lastActorFrom(user),
      })
    })
  } catch (err) {
    if (err instanceof StopError) {
      if (err.code === 'not_found') return apiError('Time entry not found', 404)
      return apiError('Time entry is not running', 409)
    }
    throw err
  }

  return apiSuccess({ id, endAt: endAtIso, durationMinutes })
})
