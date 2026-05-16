// app/api/v1/ads/connections/[platform]/ad-accounts/route.ts
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

export const GET = withAuth(
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

    const refresh = new URL(req.url).searchParams.get('refresh') === '1'
    if (!refresh) {
      return apiSuccess(conn.adAccounts ?? [])
    }

    const provider = getProvider(platform)
    const token = decryptAccessToken(conn)
    const fresh = await provider.listAdAccounts({ accessToken: token })
    await updateConnection(conn.id, { adAccounts: fresh })
    return apiSuccess(fresh)
  },
)
