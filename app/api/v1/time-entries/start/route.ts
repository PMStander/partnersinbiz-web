/**
 * POST /api/v1/time-entries/start
 *
 * Starts a running timer for a user. Enforces per-user uniqueness via a
 * transactional check — if the user already has an entry with endAt == null,
 * returns 409 with the running entry's id.
 *
 * Body: { orgId, description, projectId?, taskId?, clientOrgId?, billable?, hourlyRate?, currency?, tags?, userId? }
 *
 * Response: `apiSuccess({ id, startAt }, 201)`
 *
 * Auth: admin (AI/admin)
 */
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { actorFrom } from '@/lib/api/actor'
import { apiSuccess, apiError } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

interface StartBody {
  orgId?: string
  userId?: string
  description?: string
  projectId?: string
  taskId?: string
  clientOrgId?: string
  billable?: boolean
  hourlyRate?: number
  currency?: string
  tags?: string[]
}

export const POST = withAuth('admin', async (req, user) => {
  const body = (await req.json()) as StartBody

  if (!body.orgId?.trim()) return apiError('orgId is required')
  if (!body.description?.trim()) return apiError('description is required')

  const orgId = body.orgId.trim()
  const userId = body.userId ?? user.uid
  const collection = adminDb.collection('time_entries')

  const startAtDate = new Date()
  const startAtIso = startAtDate.toISOString()

  const newRef = collection.doc()

  try {
    await adminDb.runTransaction(async (tx) => {
      // Check for any existing running entry for this user in this org.
      const runningSnap = await tx.get(
        collection
          .where('orgId', '==', orgId)
          .where('userId', '==', userId)
          .where('endAt', '==', null)
          .limit(1),
      )

      const activeRunning = runningSnap.docs.find(
        (d) => (d.data() as { deleted?: boolean }).deleted !== true,
      )
      if (activeRunning) {
        throw new TimerAlreadyRunningError(activeRunning.id)
      }

      tx.set(newRef, {
        orgId,
        userId,
        projectId: body.projectId ?? null,
        taskId: body.taskId ?? null,
        clientOrgId: body.clientOrgId ?? null,
        description: body.description!.trim(),
        startAt: startAtIso,
        endAt: null,
        durationMinutes: 0,
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
    })
  } catch (err) {
    if (err instanceof TimerAlreadyRunningError) {
      return apiError(
        `A timer is already running. Stop it before starting a new one. (runningId: ${err.runningId})`,
        409,
      )
    }
    throw err
  }

  return apiSuccess({ id: newRef.id, startAt: startAtIso }, 201)
})

class TimerAlreadyRunningError extends Error {
  constructor(public runningId: string) {
    super('A timer is already running')
  }
}
