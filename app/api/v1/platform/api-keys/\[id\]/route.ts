import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

export const DELETE = withAuth('admin', async (req, user, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params
  const doc = await adminDb.collection('api_keys').doc(id).get()
  if (!doc.exists) return apiError('Key not found', 404)
  await adminDb.collection('api_keys').doc(id).delete()
  return apiSuccess({ deleted: true })
})
