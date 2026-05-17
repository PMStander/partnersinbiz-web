/**
 * GET /api/v1/crm/contacts/:id/activities
 */
import { adminDb } from '@/lib/firebase/admin'
import { withCrmAuth } from '@/lib/auth/crm-middleware'
import { apiSuccess, apiError } from '@/lib/api/response'
import type { Activity } from '@/lib/crm/types'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

export const GET = withCrmAuth<RouteContext>(
  'viewer',
  async (_req, ctx, routeCtx) => {
    const { id } = await routeCtx!.params

    // Tenant isolation — verify the contact belongs to caller's org before listing its activities
    const contactSnap = await adminDb.collection('contacts').doc(id).get()
    if (!contactSnap.exists) return apiError('Contact not found', 404)
    if (contactSnap.data()!.orgId !== ctx.orgId) return apiError('Contact not found', 404)

    const snapshot = await adminDb
      .collection('activities')
      .where('orgId', '==', ctx.orgId)
      .where('contactId', '==', id)
      .orderBy('createdAt', 'desc')
      .get()

    const activities: Activity[] = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Omit<Activity, 'id'>),
    }))

    return apiSuccess(activities)
  },
)
