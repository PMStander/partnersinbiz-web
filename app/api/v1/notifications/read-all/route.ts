/**
 * POST /api/v1/notifications/read-all — mark all unread notifications
 * for a given recipient (userId or agentId) in an org as read.
 *
 * Uses Firestore batch writes (500 ops per batch) to handle large result
 * sets without exceeding batch limits.
 */
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

const BATCH_LIMIT = 500

export const POST = withAuth('admin', async (req) => {
  const body = await req.json().catch(() => ({}))
  const { orgId, userId, agentId } = body as {
    orgId?: string
    userId?: string
    agentId?: string
  }

  if (!orgId) return apiError('orgId is required', 400)
  if (!userId && !agentId) {
    return apiError('At least one of userId or agentId is required', 400)
  }

  try {
    let query = adminDb
      .collection('notifications')
      .where('orgId', '==', orgId)
      .where('status', '==', 'unread') as FirebaseFirestore.Query

    if (userId) query = query.where('userId', '==', userId)
    if (agentId) query = query.where('agentId', '==', agentId)

    const snapshot = await query.get()
    const docs = snapshot.docs

    if (docs.length === 0) {
      return apiSuccess({ count: 0 })
    }

    let count = 0
    for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
      const slice = docs.slice(i, i + BATCH_LIMIT)
      const batch = adminDb.batch()
      for (const doc of slice) {
        batch.update(doc.ref, {
          status: 'read',
          readAt: FieldValue.serverTimestamp(),
        })
      }
      await batch.commit()
      count += slice.length
    }

    return apiSuccess({ count })
  } catch (err) {
    console.error('[notifications-read-all-error]', err)
    return apiError('Failed to mark notifications as read', 500)
  }
})
