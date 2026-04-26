// lib/integrations/adsense/client.ts
//
// Authenticated AdSense Management API v2 HTTP client. Wraps fetch with:
//   * automatic token refresh (proactive when within 60s of expiry, reactive
//     when AdSense returns 401)
//   * persistence of refreshed credentials back into the encrypted Connection
//   * uniform error shape so pull-daily can decide whether to skip vs throw
//
// The `client.ts` module deliberately knows nothing about metric shapes — it
// only does HTTP + token management.

import type { Connection } from '@/lib/integrations/types'
import { upsertConnection } from '@/lib/integrations/connections'
import {
  decryptCredentials,
  encryptCredentials,
} from '@/lib/integrations/crypto'
import {
  ADSENSE_API_BASE,
  ADSENSE_SCOPES,
  refreshAccessToken,
} from './oauth'
import type { AdsenseCredentials } from './schema'

/* Types ──────────────────────────────────────────────────────────────── */

export interface AdsenseClient {
  /** Provider-managed AdSense account resource name, e.g. `accounts/pub-...`. */
  accountName: string | null
  /** Send an authenticated GET to a path under `/v2/`, with optional query. */
  get<T>(
    path: string,
    query?: Record<string, string | number | string[] | undefined>,
  ): Promise<AdsenseFetchResult<T>>
}

export type AdsenseFetchResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; reason: AdsenseFailureReason; message: string }

export type AdsenseFailureReason =
  | 'no_credentials'
  | 'reauth_required'
  | 'rate_limited'
  | 'forbidden'
  | 'not_found'
  | 'server_error'
  | 'invalid_response'
  | 'no_client_env'
  | 'unknown'

/* Builder ─────────────────────────────────────────────────────────────── */

export interface CreateClientInput {
  connection: Connection
  /**
   * Test seam — defaults to `Date.now()`. Tests pass a fixed value so they
   * can deterministically assert the "expired token → refresh" path.
   */
  now?: () => number
}

/**
 * Build an `AdsenseClient` for a given Connection. Decrypts credentials,
 * proactively refreshes if the access token is expired, and persists the
 * new tokens back to Firestore.
 */
export async function createAdsenseClient(
  input: CreateClientInput,
): Promise<AdsenseClient | { error: AdsenseFailureReason; message: string }> {
  const now = input.now ?? Date.now

  // 1. Read env; without the OAuth client we cannot refresh.
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim()
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim()
  if (!clientId || !clientSecret) {
    return {
      error: 'no_client_env',
      message: 'GOOGLE_OAUTH_CLIENT_ID/SECRET not configured',
    }
  }

  // 2. Decrypt credentials.
  if (!input.connection.credentialsEnc) {
    return { error: 'no_credentials', message: 'connection has no credentials' }
  }
  let creds: AdsenseCredentials
  try {
    creds = decryptCredentials<AdsenseCredentials>(
      input.connection.credentialsEnc,
      input.connection.orgId,
    )
  } catch {
    return { error: 'no_credentials', message: 'failed to decrypt credentials' }
  }

  if (!creds.accessToken) {
    return { error: 'no_credentials', message: 'access token missing' }
  }

  let accessToken = creds.accessToken
  let expiresAt = creds.expiresAt

  // 3. Proactive refresh — if we're within 60s of expiry (or already
  //    expired, indicated by expiresAt <= now), try to refresh.
  const needsRefresh =
    creds.refreshToken &&
    typeof expiresAt === 'number' &&
    expiresAt - now() < 60_000
  if (needsRefresh) {
    const refreshed = await refreshAccessToken({
      refreshToken: creds.refreshToken,
      clientId,
      clientSecret,
    })
    if (refreshed?.access_token) {
      accessToken = refreshed.access_token
      expiresAt = now() + (refreshed.expires_in ?? 0) * 1000
      await persistRefreshedCredentials(input.connection, {
        accessToken,
        refreshToken: refreshed.refresh_token ?? creds.refreshToken,
        expiresAt,
      })
    } else if (creds.refreshToken) {
      // Refresh failed — credentials probably revoked. Surface a typed error.
      await markReauthRequired(input.connection)
      return {
        error: 'reauth_required',
        message: 'refresh token rejected by Google',
      }
    }
  }

  const meta = (input.connection.meta ?? {}) as { accountName?: string }
  const accountName = meta.accountName ?? null

  /** Reactive refresh + retry on 401. */
  async function fetchWithAuth<T>(
    url: string,
  ): Promise<AdsenseFetchResult<T>> {
    let res = await fetch(url, {
      headers: { authorization: `Bearer ${accessToken}` },
    })

    if (res.status === 401 && creds.refreshToken) {
      const refreshed = await refreshAccessToken({
        refreshToken: creds.refreshToken,
        clientId: clientId!,
        clientSecret: clientSecret!,
      })
      if (refreshed?.access_token) {
        accessToken = refreshed.access_token
        expiresAt = now() + (refreshed.expires_in ?? 0) * 1000
        await persistRefreshedCredentials(input.connection, {
          accessToken,
          refreshToken: refreshed.refresh_token ?? creds.refreshToken,
          expiresAt,
        })
        res = await fetch(url, {
          headers: { authorization: `Bearer ${accessToken}` },
        })
      } else {
        await markReauthRequired(input.connection)
        return {
          ok: false,
          status: 401,
          reason: 'reauth_required',
          message: 'refresh token rejected by Google',
        }
      }
    }

    return classifyResponse<T>(res)
  }

  return {
    accountName,
    async get<T>(
      path: string,
      query?: Record<string, string | number | string[] | undefined>,
    ): Promise<AdsenseFetchResult<T>> {
      const url = buildUrl(path, query)
      return fetchWithAuth<T>(url)
    },
  }
}

/* URL + response helpers ──────────────────────────────────────────────── */

function buildUrl(
  path: string,
  query?: Record<string, string | number | string[] | undefined>,
): string {
  const base = path.startsWith('http')
    ? path
    : `${ADSENSE_API_BASE}${path.startsWith('/') ? path : `/${path}`}`
  if (!query) return base
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue
    if (Array.isArray(value)) {
      // AdSense allows repeated `metrics=` query params for list-typed fields.
      for (const item of value) params.append(key, String(item))
    } else {
      params.append(key, String(value))
    }
  }
  const qs = params.toString()
  return qs ? `${base}?${qs}` : base
}

async function classifyResponse<T>(
  res: Response,
): Promise<AdsenseFetchResult<T>> {
  if (res.ok) {
    try {
      const data = (await res.json()) as T
      return { ok: true, data }
    } catch {
      return {
        ok: false,
        status: res.status,
        reason: 'invalid_response',
        message: 'response body was not valid JSON',
      }
    }
  }
  const reason = classifyStatus(res.status)
  let message = `${res.status} ${res.statusText}`
  try {
    const body = await res.text()
    if (body) message = `${message}: ${body.slice(0, 500)}`
  } catch {
    // ignore
  }
  return { ok: false, status: res.status, reason, message }
}

function classifyStatus(status: number): AdsenseFailureReason {
  if (status === 401) return 'reauth_required'
  if (status === 403) return 'forbidden'
  if (status === 404) return 'not_found'
  if (status === 429) return 'rate_limited'
  if (status >= 500) return 'server_error'
  return 'unknown'
}

/* Credential persistence ─────────────────────────────────────────────── */

async function persistRefreshedCredentials(
  connection: Connection,
  next: AdsenseCredentials,
): Promise<void> {
  // We re-encrypt and upsert through `upsertConnection` so the audit fields
  // stay consistent. This intentionally also bumps `updatedAt`.
  // We use the existing meta unchanged.
  // encryptCredentials is exported by the integrations crypto helper but
  // upsertConnection takes plaintext + encrypts internally, so we just hand
  // it the plaintext shape.
  void encryptCredentials // referenced for potential future direct-write path
  await upsertConnection({
    propertyId: connection.propertyId,
    orgId: connection.orgId,
    provider: 'adsense',
    authKind: 'oauth2',
    credentials: next as unknown as Record<string, unknown>,
    meta: connection.meta as Record<string, unknown>,
    scope: connection.scope.length ? connection.scope : [...ADSENSE_SCOPES],
    status: 'connected',
    createdBy: connection.createdBy ?? 'system',
    createdByType: connection.createdByType ?? 'system',
  })
}

async function markReauthRequired(connection: Connection): Promise<void> {
  await upsertConnection({
    propertyId: connection.propertyId,
    orgId: connection.orgId,
    provider: 'adsense',
    authKind: 'oauth2',
    // Keep existing credentials so admin sees what was there.
    credentials: undefined as unknown as Record<string, unknown> | null,
    meta: connection.meta as Record<string, unknown>,
    scope: connection.scope,
    status: 'reauth_required',
    createdBy: connection.createdBy ?? 'system',
    createdByType: connection.createdByType ?? 'system',
  })
}
