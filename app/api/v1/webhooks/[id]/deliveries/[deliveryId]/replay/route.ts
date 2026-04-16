/**
 * POST /api/v1/webhooks/[id]/deliveries/[deliveryId]/replay
 *
 * Re-deliver a past webhook event. Reads the original delivery's linked
 * queue item to recover the exact `{event, payload}` tuple, then enqueues a
 * fresh `webhook_queue` doc so the worker picks it up on the next tick.
 *
 * The original delivery and queue item are left untouched — the replay is a
 * brand-new attempt with its own audit trail.
 */
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string; deliveryId: string }> }

export const POST = withAuth('admin', async (_req, _user, ctx) => {
  const { id, deliveryId } = await (ctx as RouteContext).params

  const webhookSnap = await adminDb.collection('outbound_webhooks').doc(id).get()
  if (!webhookSnap.exists) return apiError('Webhook not found', 404)
  const webhook = webhookSnap.data() as { orgId: string; deleted?: boolean }
  if (webhook.deleted) return apiError('Webhook not found', 404)

  const deliverySnap = await adminDb
    .collection('webhook_deliveries')
    .doc(deliveryId)
    .get()
  if (!deliverySnap.exists) return apiError('Delivery not found', 404)
  const delivery = deliverySnap.data() as {
    webhookId: string
    queueItemId: string
    event: string
  }
  if (delivery.webhookId !== id) {
    return apiError('Delivery does not belong to this webhook', 400)
  }

  // Re-fetch the original payload from the linked queue item.
  const queueSnap = await adminDb
    .collection('webhook_queue')
    .doc(delivery.queueItemId)
    .get()
  if (!queueSnap.exists) {
    return apiError(
      'Original queue item not found — cannot recover payload for replay',
      404,
    )
  }
  const original = queueSnap.data() as {
    webhookId: string
    orgId: string
    event: string
    payload: Record<string, unknown>
  }

  try {
    const qRef = adminDb.collection('webhook_queue').doc()
    await qRef.set({
      webhookId: original.webhookId,
      orgId: original.orgId,
      event: original.event,
      payload: original.payload,
      status: 'pending',
      retryCount: 0,
      nextAttemptAt: new Date(),
      createdAt: FieldValue.serverTimestamp(),
      claimedAt: null,
      replayOf: deliveryId,
    })
    return apiSuccess({ replayed: true, newQueueItemId: qRef.id })
  } catch (err) {
    console.error('[webhook-replay-error]', err)
    return apiError('Failed to replay delivery', 500)
  }
})
