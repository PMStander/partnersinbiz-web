// app/api/v1/ads/connections/[platform]/refresh/route.ts
import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { isAdPlatform } from '@/lib/ads/types'
import { getProvider } from '@/lib/ads/registry'
import {
  getConnection,
  decryptAccessToken,
  updateConnection,
} from '@/lib/ads/connections/store'
import { encryptToken } from '@/lib/social/encryption'
import { Timestamp } from 'firebase-admin/firestore'

export const POST = withAuth(
  'admin',
  async (
    req: NextRequest,
    _user: unknown,
    ctx: { params: Promise<{ platform: string }> },
  ) => {
    const { platform } = await ctx.params
    if (!isAdPlatform(platform)) return apiError(`Unsupported platform: ${platform}`, 400)
    const orgId = req.headers.get('X-Org-Id')
    if (!orgId) return apiError('Missing X-Org-Id header', 400)

    const conn = await getConnection({ orgId, platform })
    if (!conn) return apiError('Connection not found', 404)

    const provider = getProvider(platform)
    const currentToken = decryptAccessToken(conn)
    const fresh = await provider.toLongLivedToken({ accessToken: currentToken })

    await updateConnection(conn.id, {
      accessTokenEnc: encryptToken(fresh.accessToken, orgId),
      expiresAt: Timestamp.fromMillis(Date.now() + fresh.expiresInSeconds * 1000),
      status: 'active',
      lastError: undefined,
    })

    return apiSuccess({
      connectionId: conn.id,
      expiresInSeconds: fresh.expiresInSeconds,
    })
  },
)
