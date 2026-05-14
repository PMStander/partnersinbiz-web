/**
 * /api/v1/push-tokens/[token] — delete a single push token.
 *
 * The `[token]` route param is the raw FCM registration token (URL-encoded).
 * We hash it server-side to look up the doc id, so the token itself is never
 * required to traverse Firestore paths.
 *
 * A user can only delete tokens that belong to them; admins can delete any
 * token.
 */
import { hashToken, deleteDeviceToken } from '@/lib/notifications/push'
import { adminDb } from '@/lib/firebase/admin'
import { resolveUser } from '@/lib/api/auth'
import { apiError, apiErrorFromException, apiSuccess } from '@/lib/api/response'
import type { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const user = await resolveUser(req)
  if (!user) return apiError('Unauthorized', 401)

  try {
    const { token: rawToken } = await ctx.params
    const token = decodeURIComponent(rawToken)
    if (!token) return apiError('token is required', 400)

    const id = hashToken(token)
    const snap = await adminDb.collection('pushTokens').doc(id).get()
    if (!snap.exists) return apiSuccess({ deleted: false })

    const owner = snap.data()?.uid
    if (owner && owner !== user.uid && user.role !== 'admin' && user.role !== 'ai') {
      return apiError('Forbidden', 403)
    }

    await deleteDeviceToken(token)
    return apiSuccess({ deleted: true })
  } catch (err) {
    return apiErrorFromException(err)
  }
}
