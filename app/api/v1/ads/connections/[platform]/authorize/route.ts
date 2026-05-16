// app/api/v1/ads/connections/[platform]/authorize/route.ts
import { NextRequest } from 'next/server'
import crypto from 'crypto'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { getProvider } from '@/lib/ads/registry'
import { isAdPlatform } from '@/lib/ads/types'
import { NotImplementedError } from '@/lib/ads/provider'
import { adminDb } from '@/lib/firebase/admin'
import { Timestamp } from 'firebase-admin/firestore'

const STATE_COLLECTION = 'ad_oauth_states'
const STATE_TTL_MINUTES = 10

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
    const orgSlug = req.headers.get('X-Org-Slug') ?? undefined

    const provider = getProvider(platform)
    const state = crypto.randomBytes(16).toString('hex')
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/api/v1/ads/connections/${platform}/callback`

    try {
      const authorizeUrl = provider.getAuthorizeUrl({ redirectUri, state, orgId })
      await adminDb.collection(STATE_COLLECTION).doc(state).set({
        state,
        orgId,
        orgSlug,
        platform,
        redirectUri,
        createdAt: Timestamp.now(),
        expiresAt: Timestamp.fromMillis(Date.now() + STATE_TTL_MINUTES * 60_000),
      })
      return apiSuccess({ authorizeUrl, state, redirectUri })
    } catch (err) {
      if (err instanceof NotImplementedError) return apiError((err as Error).message, 501)
      throw err
    }
  },
)
