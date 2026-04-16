/**
 * POST /api/v1/inbox/read — mark notification inbox items as read.
 *
 * Body: { itemIds: string[] } — treated as notification doc IDs.
 * Non-notification inbox items are not tracked here; clients mark those
 * as "read" by interacting with the underlying resource.
 */
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

const BATCH_LIMIT = 500

export const POST = withAuth('admin', async (req) => {
  const body = await req.json().catch(() => ({}))
  const itemIds = Array.isArray(body.itemIds) ? (body.itemIds as string[]) : null

  if (!itemIds) return apiError('itemIds must be an array of strings', 400)
  if (itemIds.length === 0) return apiSuccess({ marked: 0 })

  try {
    let marked = 0
    for (let i = 0; i < itemIds.length; i += BATCH_LIMIT) {
      const slice = itemIds.slice(i, i + BATCH_LIMIT)
      const refs = slice.map((id) => adminDb.collection('notifications').doc(id))
      const snaps = await adminDb.getAll(...refs)
      const batch = adminDb.batch()
      let touched = 0
      snaps.forEach((snap) => {
        if (!snap.exists) return
        batch.update(snap.ref, {
          status: 'read',
          readAt: FieldValue.serverTimestamp(),
        })
        touched += 1
      })
      if (touched > 0) await batch.commit()
      marked += touched
    }

    return apiSuccess({ marked })
  } catch (err) {
    console.error('[inbox-read-error]', err)
    return apiError('Failed to mark inbox items as read', 500)
  }
})
