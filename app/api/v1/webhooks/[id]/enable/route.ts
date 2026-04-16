/**
 * POST /api/v1/webhooks/[id]/enable — re-enable a webhook.
 *
 * Sets `active: true`, clears `autoDisabledAt`, and resets `failureCount` to
 * zero so the worker doesn't immediately re-disable it on the next transient
 * error.
 */
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { lastActorFrom } from '@/lib/api/actor'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

export const POST = withAuth('admin', async (_req, user, ctx) => {
  const { id } = await (ctx as RouteContext).params
  const ref = adminDb.collection('outbound_webhooks').doc(id)
  const doc = await ref.get()
  if (!doc.exists) return apiError('Webhook not found', 404)
  const data = doc.data() as { deleted?: boolean }
  if (data.deleted) return apiError('Webhook not found', 404)

  try {
    await ref.update({
      active: true,
      autoDisabledAt: null,
      failureCount: 0,
      ...lastActorFrom(user),
      updatedAt: FieldValue.serverTimestamp(),
    })
    return apiSuccess({ id, active: true })
  } catch (err) {
    console.error('[webhook-enable-error]', err)
    return apiError('Failed to enable webhook', 500)
  }
})
