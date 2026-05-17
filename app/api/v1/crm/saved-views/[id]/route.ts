/**
 * DELETE /api/v1/crm/saved-views/:id  — delete a saved view
 *
 * Auth: member+
 * Only the owning user (uid match) within the same org may delete.
 * Returns 404 for not-found, wrong-org, or wrong-owner — never reveals existence.
 */
import { adminDb } from '@/lib/firebase/admin'
import { withCrmAuth } from '@/lib/auth/crm-middleware'
import { apiSuccess, apiError } from '@/lib/api/response'

type RouteCtx = { params: Promise<{ id: string }> }

export const DELETE = withCrmAuth<RouteCtx>('member', async (_req, ctx, routeCtx) => {
  const { id } = await routeCtx!.params
  const docRef = adminDb.collection('saved_views').doc(id)
  const snap = await docRef.get()

  if (!snap.exists) return apiError('Saved view not found', 404)

  const data = snap.data()!
  // Verify ownership + org scoping — return 404 to avoid revealing existence
  if (data.orgId !== ctx.orgId || data.uid !== ctx.actor.uid) {
    return apiError('Saved view not found', 404)
  }

  await docRef.delete()
  return apiSuccess({ id })
})
