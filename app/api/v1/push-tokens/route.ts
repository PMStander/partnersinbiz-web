/**
 * /api/v1/push-tokens — register an FCM device token for the authenticated user.
 *
 * POST { token, platform?, userAgent? } → upsert into `pushTokens` keyed by a
 * hash of the raw token, so re-registering the same browser is idempotent.
 *
 * Any authenticated user (admin or client) can register a token for themselves.
 */
import { resolveUser } from '@/lib/api/auth'
import { apiError, apiErrorFromException, apiSuccess } from '@/lib/api/response'
import { saveDeviceToken } from '@/lib/notifications/push'
import type { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const user = await resolveUser(req)
  if (!user) return apiError('Unauthorized', 401)

  try {
    const body = (await req.json().catch(() => ({}))) as {
      token?: unknown
      platform?: unknown
      userAgent?: unknown
    }
    const token = typeof body.token === 'string' ? body.token.trim() : ''
    if (!token) return apiError('token is required', 400)
    if (token.length > 4096) return apiError('token too long', 400)

    const platform =
      body.platform === 'ios' || body.platform === 'android' || body.platform === 'web'
        ? body.platform
        : 'web'
    const userAgent =
      typeof body.userAgent === 'string' ? body.userAgent.slice(0, 512) : null

    const { id } = await saveDeviceToken({
      token,
      uid: user.uid,
      orgId: user.orgId ?? null,
      platform,
      userAgent,
    })
    return apiSuccess({ id }, 201)
  } catch (err) {
    return apiErrorFromException(err)
  }
}
