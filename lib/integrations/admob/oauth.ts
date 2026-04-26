// lib/integrations/admob/oauth.ts
//
// Google OAuth2 begin/complete handlers for the AdMob adapter.
// Identical pattern to other Google adapters (AdSense, GA4, Google Ads):
// authorize at accounts.google.com, exchange the code at oauth2.googleapis.com/token.

import { upsertConnection } from '@/lib/integrations/connections'
import type { Connection } from '@/lib/integrations/types'
import type {
  AdMobCredentials,
  AdMobConnectionMeta,
  GoogleTokenResponse,
} from './schema'
import { listAccounts } from './client'

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
export const ADMOB_SCOPE = 'https://www.googleapis.com/auth/admob.readonly'

function clientCreds(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim()
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim()
  if (!clientId || !clientSecret) return null
  return { clientId, clientSecret }
}

/**
 * Step 1: build the Google authorize URL.
 * The returned URL is for the browser to redirect to. After consent the user
 * lands on `redirectUri` with a `code` param that is fed to `completeOAuth`.
 */
export async function beginOAuth(input: {
  propertyId: string
  orgId: string
  redirectUri: string
  state: string
}): Promise<{ authorizeUrl: string }> {
  const creds = clientCreds()
  if (!creds) {
    // Don't throw — return a safe fallback so the caller can surface a clear
    // "missing config" error instead of a stack trace.
    return {
      authorizeUrl: `${AUTHORIZE_URL}?error=missing_google_oauth_client`,
    }
  }
  const params = new URLSearchParams({
    client_id: creds.clientId,
    redirect_uri: input.redirectUri,
    response_type: 'code',
    scope: ADMOB_SCOPE,
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: 'consent',
    state: input.state,
  })
  return { authorizeUrl: `${AUTHORIZE_URL}?${params.toString()}` }
}

/**
 * Step 2: exchange the OAuth `code` for tokens, look up the AdMob account,
 * and upsert a Connection. The connection is created with status='connected'
 * unless we couldn't resolve an AdMob account (then 'reauth_required').
 */
export async function completeOAuth(input: {
  propertyId: string
  orgId: string
  code: string
  redirectUri: string
}): Promise<Connection> {
  const creds = clientCreds()
  if (!creds) {
    // Persist a pending connection so the admin UI can show "config missing".
    return upsertConnection({
      propertyId: input.propertyId,
      orgId: input.orgId,
      provider: 'admob',
      authKind: 'oauth2',
      credentials: null,
      meta: { error: 'missing_google_oauth_client' } as AdMobConnectionMeta &
        Record<string, unknown>,
      scope: [ADMOB_SCOPE],
      status: 'pending',
      createdBy: 'system',
      createdByType: 'system',
    })
  }

  // Exchange the code.
  const tokenRes = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: input.code,
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      redirect_uri: input.redirectUri,
      grant_type: 'authorization_code',
    }).toString(),
  })

  if (!tokenRes.ok) {
    const errText = await tokenRes.text().catch(() => '')
    return upsertConnection({
      propertyId: input.propertyId,
      orgId: input.orgId,
      provider: 'admob',
      authKind: 'oauth2',
      credentials: null,
      meta: { error: errText.slice(0, 500) || 'token_exchange_failed' },
      scope: [ADMOB_SCOPE],
      status: 'reauth_required',
      createdBy: 'system',
      createdByType: 'system',
    })
  }

  const token = (await tokenRes.json()) as GoogleTokenResponse
  if (!token.access_token || !token.refresh_token) {
    return upsertConnection({
      propertyId: input.propertyId,
      orgId: input.orgId,
      provider: 'admob',
      authKind: 'oauth2',
      credentials: null,
      meta: { error: 'missing_refresh_token' },
      scope: [ADMOB_SCOPE],
      status: 'reauth_required',
      createdBy: 'system',
      createdByType: 'system',
    })
  }

  const credentials: AdMobCredentials = {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: Date.now() + (token.expires_in ?? 3600) * 1000,
    scope: token.scope ?? ADMOB_SCOPE,
  }

  // Resolve the AdMob publisher account so `pullDaily` can report against it.
  let meta: AdMobConnectionMeta = {}
  let status: Connection['status'] = 'connected'
  try {
    const accounts = await listAccounts(token.access_token)
    if (accounts.length === 0) {
      meta = { error: 'no_admob_account' } as AdMobConnectionMeta &
        Record<string, unknown>
      status = 'reauth_required'
    } else {
      const first = accounts[0]
      meta = {
        accountName: first.name,
        publisherId: first.publisherId,
        reportingTimeZone: first.reportingTimeZone,
        currencyCode: first.currencyCode,
      }
    }
  } catch (err) {
    meta = {
      error: err instanceof Error ? err.message : String(err),
    } as AdMobConnectionMeta & Record<string, unknown>
    status = 'reauth_required'
  }

  return upsertConnection({
    propertyId: input.propertyId,
    orgId: input.orgId,
    provider: 'admob',
    authKind: 'oauth2',
    credentials: credentials as unknown as Record<string, unknown>,
    meta: meta as Record<string, unknown>,
    scope: [ADMOB_SCOPE],
    status,
    createdBy: 'system',
    createdByType: 'system',
  })
}
