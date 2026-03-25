/**
 * GET /api/v1/crm/contacts/:id/activities
 */
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess } from '@/lib/api/response'
import type { Activity } from '@/lib/crm/types'

type Params = { params: Promise<{ id: string }> }

export const GET = withAuth('admin', async (_req, _user, context) => {
  const { id } = await (context as Params).params
  const snapshot = await adminDb
    .collection('activities')
    .where('contactId', '==', id)
    .orderBy('createdAt', 'desc')
    .get()

  const activities: Activity[] = snapshot.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Omit<Activity, 'id'>),
  }))

  return apiSuccess(activities)
})
