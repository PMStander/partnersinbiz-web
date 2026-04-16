/**
 * OAuth Connect — Initiates the OAuth flow for a social platform.
 *
 * GET /api/v1/social/oauth/{platform}
 * Query: ?redirectUrl=/portal/social/accounts (where to go after callback)
 *
 * Generates a state token, stores it in Firestore, and redirects to the platform auth URL.
 */
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { withAuth } from '@/lib/api/auth'
import { withTenant } from '@/lib/api/tenant'
import { apiError } from '@/lib/api/response'
import { adminDb } from '@/lib/firebase/admin'
import { getOAuthConfig, getClientCredentials, getCallbackUrl } from '@/lib/social/oauth-config'
import type { SocialPlatformType } from '@/lib/social/providers/types'
import { Timestamp } from 'firebase-admin/firestore'

export const GET = withAuth('client', withTenant(async (req: NextRequest, _user, orgId) => {
  const url = new URL(req.url)
  const platform = url.pathname.split('/').slice(-1)[0] as SocialPlatformType
  const redirectUrl = url.searchParams.get('redirectUrl') ?? '/admin/social'

  // Special handling for non-OAuth platforms
  if (platform === 'bluesky') {
    return apiError('Bluesky uses app passwords, not OAuth. Use the account creation endpoint directly.', 400)
  }
  if (platform === 'twitter') {
    return apiError('Twitter OAuth 1.0a flow is not yet implemented. Use env-based credentials.', 400)
  }

  const config = getOAuthConfig(platform)
  if (!config) {
    return apiError(`OAuth not supported for platform: ${platform}`, 400)
  }

  const creds = getClientCredentials(platform)
  if (!creds) {
    return apiError(`Missing client credentials for ${platform}. Set ${platform.toUpperCase()}_CLIENT_ID and ${platform.toUpperCase()}_CLIENT_SECRET.`, 500)
  }

  // Generate state token
  const nonce = crypto.randomBytes(16).toString('hex')
  const stateData = { orgId, platform, nonce, redirectUrl }
  const stateToken = Buffer.from(JSON.stringify(stateData)).toString('base64url')

  // Store state in Firestore with 10-minute TTL
  await adminDb.collection('social_oauth_states').doc(nonce).set({
    orgId,
    platform,
    nonce,
    redirectUrl,
    expiresAt: Timestamp.fromDate(new Date(Date.now() + 10 * 60 * 1000)),
    createdAt: Timestamp.now(),
  })

  // Build authorization URL
  const callbackUrl = getCallbackUrl(platform)
  // TikTok uses 'client_key' in the auth URL, all other platforms use 'client_id'
  const clientIdParam = platform === 'tiktok' ? 'client_key' : 'client_id'
  const authParams = new URLSearchParams({
    [clientIdParam]: creds.clientId,
    redirect_uri: callbackUrl,
    response_type: 'code',
    scope: config.scopes.join(' '),
    state: stateToken,
    ...config.extraAuthParams,
  })

  const authUrl = `${config.authUrl}?${authParams.toString()}`
  return NextResponse.redirect(authUrl)
}))
