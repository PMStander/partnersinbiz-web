// app/api/v1/ads/google/merchant-center/oauth/authorize/route.ts
//
// Initiates the Google OAuth dance for Merchant Center (content scope).
// Mirrors app/api/v1/ads/google/oauth/authorize/route.ts but uses
// buildMcAuthorizeUrl and persists platform: 'google_merchant_center' so
// the callback can distinguish MC OAuth from Ads OAuth.
import { NextRequest } from 'next/server'
import crypto from 'crypto'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { adminDb } from '@/lib/firebase/admin'
import { Timestamp } from 'firebase-admin/firestore'
import { buildMcAuthorizeUrl } from '@/lib/ads/providers/google/merchant-center'

const STATE_COLLECTION = 'ad_oauth_states'
const STATE_TTL_MINUTES = 10

export const dynamic = 'force-dynamic'

export const POST = withAuth(
  'admin',
  async (req: NextRequest) => {
    const orgId = req.headers.get('X-Org-Id')
    if (!orgId) return apiError('Missing X-Org-Id header', 400)
    const orgSlug = req.headers.get('X-Org-Slug') ?? undefined

    const state = crypto.randomBytes(16).toString('hex')
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://partnersinbiz.online'
    const redirectUri = `${baseUrl}/api/v1/ads/google/merchant-center/oauth/callback`

    try {
      const authorizeUrl = buildMcAuthorizeUrl({ redirectUri, state })
      await adminDb.collection(STATE_COLLECTION).doc(state).set({
        state,
        orgId,
        orgSlug,
        platform: 'google_merchant_center',
        redirectUri,
        createdAt: Timestamp.now(),
        expiresAt: Timestamp.fromMillis(Date.now() + STATE_TTL_MINUTES * 60_000),
      })
      return apiSuccess({ authorizeUrl, state, redirectUri })
    } catch (err) {
      return apiError((err as Error).message || 'Authorize failed', 500)
    }
  },
)
