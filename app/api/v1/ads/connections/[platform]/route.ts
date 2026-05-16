// app/api/v1/ads/connections/[platform]/route.ts
import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { isAdPlatform } from '@/lib/ads/types'
import {
  getConnection,
  decryptAccessToken,
  deleteConnection,
} from '@/lib/ads/connections/store'
import { META_GRAPH_BASE } from '@/lib/ads/providers/meta/constants'

export const DELETE = withAuth(
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

    // Best-effort upstream revoke
    if (platform === 'meta') {
      try {
        const token = decryptAccessToken(conn)
        const url = new URL(`${META_GRAPH_BASE}/me/permissions`)
        url.searchParams.set('access_token', token)
        await fetch(url.toString(), { method: 'DELETE' })
      } catch {
        // Swallow — local delete is the source of truth
      }
    }

    await deleteConnection(conn.id)
    return apiSuccess({ revoked: true })
  },
)
