/**
 * GET    /api/v1/social/media/:id  — get media details
 * DELETE /api/v1/social/media/:id  — delete media
 */
import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export const GET = withAuth('admin', async (_req: NextRequest, _user, context) => {
  const { id } = await (context as Params).params
  const doc = await adminDb.collection('social_media').doc(id).get()
  if (!doc.exists) return apiError('Media not found', 404)
  return apiSuccess({ id: doc.id, ...doc.data() })
})

export const DELETE = withAuth('admin', async (_req: NextRequest, _user, context) => {
  const { id } = await (context as Params).params
  const doc = await adminDb.collection('social_media').doc(id).get()
  if (!doc.exists) return apiError('Media not found', 404)

  // Hard delete — media files should be cleaned up from storage separately
  await adminDb.collection('social_media').doc(id).delete()
  return apiSuccess({ id })
})
