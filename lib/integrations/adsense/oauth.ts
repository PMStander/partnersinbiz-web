// lib/integrations/adsense/oauth.ts
//
// Google OAuth2 flow for AdSense Management API v2. Implements the
// `beginOAuth` / `completeOAuth` halves of the IntegrationAdapter contract.
//
// We use the standard server-side authorization-code flow with
// `access_type=offline` + `prompt=consent` so we always receive a long-lived
// refresh token (Google only returns one on initial consent).

import type { Connection } from '@/lib/integrations/types'
import { upsertConnection } from '@/lib/integrations/connections'
import type {
  AdsenseConnectionMeta,
  AdsenseCredentials,
  GoogleTokenResponse,
  AdsenseAccountListResponse,
} from './schema'

/* Constants ──────────────────────────────────────────────────────────── */

export const GOOGLE_AUTHORIZE_ENDPOINT =
  'https://accounts.google.com/o/oauth2/v2/auth'
export const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
export const ADSENSE_API_BASE = 'https://adsense.googleapis.com/v2'

export const ADSENSE_SCOPES = [
  'https://www.googleapis.com/auth/adsense.readonly',
] as const

/* Env helpers ────────────────────────────────────────────────────────── */

interface GoogleOAuthEnv {
  clientId: string
  clientSecret: string
}

function readEnv(): GoogleOAuthEnv | null {
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
 * grant our app `adsense.readonly` access. We pass `access_type=offline` plus
 * `prompt=consent` so a refresh token is always returned on completion.
 */
export async function beginOAuth(input: BeginOAuthInput): Promise<BeginOAuthResult> {
  const env = readEnv()
  if (!env) {
    // No exception — the caller (registry/UI) decides what to do. Returning
    // the URL even when env is missing would be misleading; use a safe stub.
    return {
      authorizeUrl: '',
    }
  }

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: env.clientId,
    redirect_uri: input.redirectUri,
    scope: ADSENSE_SCOPES.join(' '),
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
 * Exchange an authorization code for tokens, discover the AdSense account
 * resource name, and persist a Connection.
 *
 * Throws on unexpected network errors. Returns a Connection with status
 * `error` if the token exchange fails — the registry/UI surfaces this.
 */
export async function completeOAuth(input: CompleteOAuthInput): Promise<Connection> {
  const env = readEnv()
  if (!env) {
    return upsertConnection({
      propertyId: input.propertyId,
      orgId: input.orgId,
      provider: 'adsense',
      authKind: 'oauth2',
      credentials: null,
      status: 'error',
      meta: { error: 'GOOGLE_OAUTH_CLIENT_ID/SECRET missing' },
      scope: [...ADSENSE_SCOPES],
      createdBy: 'system',
      createdByType: 'system',
    })
  }

  // 1. Exchange code → tokens.
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
      provider: 'adsense',
      authKind: 'oauth2',
      credentials: null,
      status: 'error',
      meta: { error: 'token_exchange_failed' },
      scope: [...ADSENSE_SCOPES],
      createdBy: 'system',
      createdByType: 'system',
    })
  }

  // 2. Discover account name. Failure here is non-fatal — we still save
  //    tokens so a later pull or admin retry can resolve the account.
  const account = await discoverPrimaryAccount(tokens.access_token)

  const credentials: AdsenseCredentials = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? '',
    expiresAt: Date.now() + (tokens.expires_in ?? 0) * 1000,
  }

  const meta: AdsenseConnectionMeta = {}
  if (account?.name) {
    meta.accountName = account.name
    // accounts/pub-1234567890123456 → pub-1234567890123456
    meta.publisherId = account.name.replace(/^accounts\//, '')
  }

  return upsertConnection({
    propertyId: input.propertyId,
    orgId: input.orgId,
    provider: 'adsense',
    authKind: 'oauth2',
    credentials: credentials as unknown as Record<string, unknown>,
    status: 'connected',
    meta: meta as Record<string, unknown>,
    scope: [...ADSENSE_SCOPES],
    createdBy: 'system',
    createdByType: 'system',
  })
}

/* Lower-level helpers (also used by client.ts) ───────────────────────── */

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
 * GET /v2/accounts → first account in the list. AdSense publishers
 * usually have exactly one account; we pick the first `READY` one (or fall
 * back to the first item if none are READY).
 */
export async function discoverPrimaryAccount(
  accessToken: string,
): Promise<{ name: string; timeZone?: string } | null> {
  const res = await fetch(`${ADSENSE_API_BASE}/accounts`, {
    headers: { authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return null
  const json = (await res.json()) as AdsenseAccountListResponse
  const accounts = json.accounts ?? []
  if (accounts.length === 0) return null
  const ready = accounts.find((a) => a.state === 'READY')
  const picked = ready ?? accounts[0]
  return { name: picked.name, timeZone: picked.timeZone?.id }
}
