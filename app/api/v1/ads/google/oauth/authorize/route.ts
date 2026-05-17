// app/api/v1/ads/google/oauth/authorize/route.ts
//
// Google-specific OAuth authorize endpoint for the Ads module (Sub-3a).
//
// Mirrors the Meta authorize flow at
// `app/api/v1/ads/connections/[platform]/authorize/route.ts` but lives at a
// Google-namespaced path so the Google flow can evolve independently
// (developer-token handling, MCC login-customer-id, etc.) without touching
// the generic `[platform]` router that currently serves Meta.
import { NextRequest } from 'next/server'
import crypto from 'crypto'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { adminDb } from '@/lib/firebase/admin'
import { Timestamp } from 'firebase-admin/firestore'
import { buildAdsAuthorizeUrl } from '@/lib/ads/providers/google/oauth'

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
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/api/v1/ads/google/oauth/callback`

    try {
      const authorizeUrl = buildAdsAuthorizeUrl({ redirectUri, state, orgId })
      await adminDb.collection(STATE_COLLECTION).doc(state).set({
        state,
        orgId,
        orgSlug,
        platform: 'google',
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
