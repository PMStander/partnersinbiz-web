/**
 * GET    /api/v1/files/:id — fetch a single file metadata record
 * DELETE /api/v1/files/:id — soft delete (`?force=true` hard-deletes the
 *                            Firestore doc only — the underlying storage
 *                            blob is NOT removed)
 *
 * Auth: admin (AI/admin)
 */
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { lastActorFrom } from '@/lib/api/actor'
import { apiSuccess, apiError } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

interface UploadDoc {
  orgId?: string
  deleted?: boolean
  [key: string]: unknown
}

export const GET = withAuth('admin', async (_req, _user, context) => {
  const { id } = await (context as RouteContext).params
  const doc = await adminDb.collection('uploads').doc(id).get()
  if (!doc.exists) return apiError('File not found', 404)
  const data = doc.data() as UploadDoc | undefined
  if (!data || data.deleted === true) return apiError('File not found', 404)
  return apiSuccess({ id: doc.id, ...data })
})

export const DELETE = withAuth('admin', async (req, user, context) => {
  const { id } = await (context as RouteContext).params
  const ref = adminDb.collection('uploads').doc(id)
  const doc = await ref.get()
  if (!doc.exists) return apiError('File not found', 404)

  const { searchParams } = new URL(req.url)
  const force = searchParams.get('force') === 'true'

  // NOTE: `?force=true` hard-deletes the Firestore metadata record only.
  // The underlying blob in Firebase Storage is intentionally left in place
  // (storage cleanup is a separate, explicit operation). Callers that need
  // to scrub storage must handle that out-of-band.
  if (force) {
    await ref.delete()
  } else {
    await ref.update({
      deleted: true,
      ...lastActorFrom(user),
    })
  }

  return apiSuccess({ id, deleted: true })
})
