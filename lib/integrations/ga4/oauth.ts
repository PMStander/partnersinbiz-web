// lib/integrations/ga4/oauth.ts
//
// Google OAuth2 flow for the GA4 Data API v1beta. Implements the
// `beginOAuth` / `completeOAuth` halves of the IntegrationAdapter contract.
//
// We use the standard server-side authorization-code flow with
// `access_type=offline` + `prompt=consent` so we always receive a long-lived
// refresh token (Google only returns one on initial consent).
//
// Scope: `https://www.googleapis.com/auth/analytics.readonly` — read-only
// access to GA4 reporting + admin endpoints.

import type { Connection } from '@/lib/integrations/types'
import { upsertConnection } from '@/lib/integrations/connections'
import type {
  Ga4ConnectionMeta,
  Ga4Credentials,
  GoogleTokenResponse,
} from './schema'

/* Constants ──────────────────────────────────────────────────────────── */

export const GOOGLE_AUTHORIZE_ENDPOINT =
  'https://accounts.google.com/o/oauth2/v2/auth'
export const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
export const GOOGLE_REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke'

export const GA4_SCOPES = [
  'https://www.googleapis.com/auth/analytics.readonly',
] as const

/* Env helpers ────────────────────────────────────────────────────────── */

interface GoogleOAuthEnv {
  clientId: string
  clientSecret: string
}

export function readEnv(): GoogleOAuthEnv | null {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim()
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim()
  if (!clientId || !clientSecret) return null
  return { clientId, clientSecret }
}

/* beginOAuth ────────────────────────────────────────────────────────── */

export interface BeginOAuthInput {
  propertyId: string
  orgId: string
  redirectUri: string
  state: string
}

export interface BeginOAuthResult {
  authorizeUrl: string
}

/**
 * Build the Google authorize URL the admin/user is redirected to in order to
 * grant our app `analytics.readonly` access. We pass `access_type=offline`
 * plus `prompt=consent` so a refresh token is always returned on completion.
 */
export async function beginOAuth(input: BeginOAuthInput): Promise<BeginOAuthResult> {
  const env = readEnv()
  if (!env) {
    // No exception — caller (registry/UI) decides what to do. Returning a
    // valid URL when env is missing would be misleading; emit an empty
    // string so the UI can show a clear "not configured" state.
    return { authorizeUrl: '' }
  }

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: env.clientId,
    redirect_uri: input.redirectUri,
    scope: GA4_SCOPES.join(' '),
    state: input.state,
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: 'consent',
  })

  return {
    authorizeUrl: `${GOOGLE_AUTHORIZE_ENDPOINT}?${params.toString()}`,
  }
}

/* completeOAuth ─────────────────────────────────────────────────────── */

export interface CompleteOAuthInput {
  propertyId: string
  orgId: string
  code: string
  redirectUri: string
}

/**
 * Exchange an authorization code for tokens and persist a Connection.
 *
 * Returns a Connection with status `error` if the token exchange fails or
 * env vars are missing — callers/UI surface this. Throws on unexpected
 * network errors.
 *
 * The user picks the GA4 property from the property settings UI (we don't
 * auto-discover here — most Google accounts have many GA4 properties and
 * picking the wrong one would be worse than asking).
 */
export async function completeOAuth(input: CompleteOAuthInput): Promise<Connection> {
  const env = readEnv()
  if (!env) {
    return upsertConnection({
      propertyId: input.propertyId,
      orgId: input.orgId,
      provider: 'ga4',
      authKind: 'oauth2',
      credentials: null,
      status: 'error',
      meta: { error: 'GOOGLE_OAUTH_CLIENT_ID/SECRET missing' },
      scope: [...GA4_SCOPES],
      createdBy: 'system',
      createdByType: 'system',
    })
  }

  const tokens = await exchangeCodeForTokens({
    code: input.code,
    redirectUri: input.redirectUri,
    clientId: env.clientId,
    clientSecret: env.clientSecret,
  })

  if (!tokens) {
    return upsertConnection({
      propertyId: input.propertyId,
      orgId: input.orgId,
      provider: 'ga4',
      authKind: 'oauth2',
      credentials: null,
      status: 'error',
      meta: { error: 'token_exchange_failed' },
      scope: [...GA4_SCOPES],
      createdBy: 'system',
      createdByType: 'system',
    })
  }

  const credentials: Ga4Credentials = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? '',
    expiresAt: Date.now() + (tokens.expires_in ?? 0) * 1000,
  }

  // Meta intentionally left empty here — the user supplies ga4PropertyId via
  // Property.config.revenue.ga4PropertyId in the property settings UI. The
  // pull adapter resolves the id from the property at pull time.
  const meta: Ga4ConnectionMeta = {}

  return upsertConnection({
    propertyId: input.propertyId,
    orgId: input.orgId,
    provider: 'ga4',
    authKind: 'oauth2',
    credentials: credentials as unknown as Record<string, unknown>,
    status: 'connected',
    meta: meta as Record<string, unknown>,
    scope: [...GA4_SCOPES],
    createdBy: 'system',
    createdByType: 'system',
  })
}

/* Lower-level helpers (also used by client.ts / pull-daily.ts) ──────── */

export interface CodeExchangeInput {
  code: string
  redirectUri: string
  clientId: string
  clientSecret: string
}

/**
 * POST to Google's token endpoint to exchange `code` for an access+refresh
 * token pair. Returns null on any 4xx/5xx — the caller decides how to
 * surface that.
 */
export async function exchangeCodeForTokens(
  input: CodeExchangeInput,
): Promise<GoogleTokenResponse | null> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: input.code,
    redirect_uri: input.redirectUri,
    client_id: input.clientId,
    client_secret: input.clientSecret,
  })

  const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) return null
  return (await res.json()) as GoogleTokenResponse
}

export interface RefreshTokensInput {
  refreshToken: string
  clientId: string
  clientSecret: string
}

/**
 * POST to Google's token endpoint with `grant_type=refresh_token` to get a
 * fresh access token. Returns null on any 4xx/5xx; the caller marks the
 * connection as `reauth_required` if the refresh token itself is dead.
 */
export async function refreshAccessToken(
  input: RefreshTokensInput,
): Promise<GoogleTokenResponse | null> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: input.refreshToken,
    client_id: input.clientId,
    client_secret: input.clientSecret,
  })

  const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) return null
  return (await res.json()) as GoogleTokenResponse
}

/**
 * POST to Google's revocation endpoint. Best-effort — we don't surface
 * non-OK responses because the connection is being torn down anyway.
 */
export async function revokeToken(token: string): Promise<void> {
  if (!token) return
  try {
    await fetch(GOOGLE_REVOKE_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }).toString(),
    })
  } catch {
    // Swallow — revocation is advisory.
  }
}
