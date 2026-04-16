/**
 * POST /api/v1/webhooks/[id]/test — enqueue a test delivery for a webhook.
 *
 * Enqueues directly to `webhook_queue` with `event: 'test'`. No subscription
 * filter is applied — the test targets this one webhook regardless of which
 * events it subscribes to.
 */
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

export const POST = withAuth('admin', async (_req, _user, ctx) => {
  const { id } = await (ctx as RouteContext).params

  const webhookRef = adminDb.collection('outbound_webhooks').doc(id)
  const snap = await webhookRef.get()
  if (!snap.exists) return apiError('Webhook not found', 404)
  const webhook = snap.data() as { orgId: string; deleted?: boolean }
  if (webhook.deleted) return apiError('Webhook not found', 404)

  const payload = {
    message: 'This is a test from Partners in Biz',
    timestamp: new Date().toISOString(),
  }

  try {
    const qRef = adminDb.collection('webhook_queue').doc()
    await qRef.set({
      webhookId: id,
      orgId: webhook.orgId,
      event: 'test',
      payload,
      status: 'pending',
      retryCount: 0,
      nextAttemptAt: new Date(),
      createdAt: FieldValue.serverTimestamp(),
      claimedAt: null,
    })
    return apiSuccess({ queued: true, queueItemId: qRef.id })
  } catch (err) {
    console.error('[webhook-test-error]', err)
    return apiError('Failed to queue test delivery', 500)
  }
})
