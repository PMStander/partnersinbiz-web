/**
 * GET /api/v1/time-entries/running
 *
 * Returns the one running time entry for a user (or null) in an org.
 *
 * Query:
 *   orgId  required
 *   userId optional (defaults to the current authenticated user)
 *
 * Response: `apiSuccess({ running: TimeEntry | null })`
 *
 * Auth: admin (AI/admin)
 */
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import type { TimeEntry } from '@/lib/time-tracking/types'

export const dynamic = 'force-dynamic'

export const GET = withAuth('admin', async (req, user) => {
  const { searchParams } = new URL(req.url)

  const orgId = searchParams.get('orgId')
  if (!orgId) return apiError('orgId is required; pass it as a query param')

  const userId = searchParams.get('userId') ?? user.uid

  const snap = await adminDb
    .collection('time_entries')
    .where('orgId', '==', orgId)
    .where('userId', '==', userId)
    .where('endAt', '==', null)
    .limit(5)
    .get()

  const running = snap.docs
    .map((doc) => ({ id: doc.id, ...(doc.data() as Omit<TimeEntry, 'id'>) }))
    .find((e) => e.deleted !== true) ?? null

  return apiSuccess({ running })
})
