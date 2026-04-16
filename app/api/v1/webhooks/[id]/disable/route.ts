/**
 * POST /api/v1/webhooks/[id]/disable — manually disable a webhook.
 *
 * Sets `active: false`. Does NOT set `autoDisabledAt` — that field is
 * reserved for failures-driven auto-disable so the UI can distinguish a
 * manual pause from a failure quarantine.
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
      active: false,
      ...lastActorFrom(user),
      updatedAt: FieldValue.serverTimestamp(),
    })
    return apiSuccess({ id, active: false })
  } catch (err) {
    console.error('[webhook-disable-error]', err)
    return apiError('Failed to disable webhook', 500)
  }
})
