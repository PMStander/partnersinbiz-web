/**
 * POST /api/v1/webhooks/[id]/rotate-secret
 *
 * Rotates the HMAC signing secret for a webhook. Returns the new secret
 * exactly once (in `secretOnce`). Subsequent reads only expose `***`.
 *
 * After rotation, all in-flight deliveries sign with the new secret
 * immediately — consumers must update their verification code before
 * calling this endpoint or they will start failing HMAC verification.
 */
import { randomBytes } from 'crypto'
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
  const data = doc.data() as Record<string, unknown>
  if (data.deleted === true) return apiError('Webhook not found', 404)

  const newSecret = randomBytes(32).toString('hex')

  try {
    await ref.update({
      secret: newSecret,
      secretRotatedAt: new Date(),
      ...lastActorFrom(user),
    })
    return apiSuccess({ id, secretOnce: newSecret, secret: '***' })
  } catch (err) {
    console.error('[webhook-rotate-secret-error]', err)
    return apiError('Failed to rotate secret', 500)
  }
})
