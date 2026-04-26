// lib/integrations/admob/client.ts
//
// Authenticated AdMob API client.
// - Auto-refreshes the access token using the refresh_token grant.
// - Single fetch helper that throws on non-2xx with the response body.
// - listAccounts() and generateNetworkReport() are the only two endpoints
//   the adapter actually uses.

import { decryptCredentials, encryptCredentials } from '@/lib/integrations/crypto'
import type {
  AdMobAccount,
  AdMobCredentials,
  GoogleTokenResponse,
  ListAdMobAccountsResponse,
  NetworkReportRequest,
  NetworkReportResponse,
  AdMobReportRow,
} from './schema'
import type { Connection } from '@/lib/integrations/types'

const ADMOB_API_BASE = 'https://admob.googleapis.com/v1'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
/** Refresh slightly before the token actually expires. */
const REFRESH_LEEWAY_MS = 60_000

function googleClientCreds(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim()
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim()
  if (!clientId || !clientSecret) return null
  return { clientId, clientSecret }
}

/**
 * Refresh an AdMob access token using the stored refresh_token. Used both as
 * a periodic refresh and as a recovery step on a 401.
 */
export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
  const creds = googleClientCreds()
  if (!creds) {
    throw new Error('Missing GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET')
  }
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`AdMob token refresh failed (${res.status}): ${text.slice(0, 500)}`)
  }
  return (await res.json()) as GoogleTokenResponse
}

/**
 * Returns a known-fresh access token. If the cached one is past its
 * expiry-with-leeway, refresh and return the new one. Caller is responsible
 * for persisting the refreshed token if it changed.
 */
export async function ensureAccessToken(creds: AdMobCredentials): Promise<{
  accessToken: string
  refreshed: boolean
  next: AdMobCredentials
}> {
  const now = Date.now()
  if (creds.accessToken && creds.expiresAt && creds.expiresAt - REFRESH_LEEWAY_MS > now) {
    return { accessToken: creds.accessToken, refreshed: false, next: creds }
  }
  const token = await refreshAccessToken(creds.refreshToken)
  const next: AdMobCredentials = {
    accessToken: token.access_token,
    // Google does not always rotate refresh_token — keep the old one if absent.
    refreshToken: token.refresh_token ?? creds.refreshToken,
    expiresAt: Date.now() + (token.expires_in ?? 3600) * 1000,
    scope: token.scope ?? creds.scope,
  }
  return { accessToken: token.access_token, refreshed: true, next }
}

/**
 * Helper that takes a `Connection` and returns a usable access token plus an
 * updated `credentialsEnc` blob if a refresh occurred. The caller is expected
 * to write that blob back to Firestore.
 */
export async function getAuthForConnection(connection: Connection): Promise<{
  accessToken: string
  refreshed: boolean
  /** New encrypted credentials if `refreshed` is true; otherwise the original. */
  credentialsEnc: Connection['credentialsEnc']
  /** Decrypted credentials object — useful for callers that want to inspect. */
  credentials: AdMobCredentials
} | null> {
  if (!connection.credentialsEnc) return null
  const creds = decryptCredentials<AdMobCredentials>(
    connection.credentialsEnc,
    connection.orgId,
  )
  if (!creds.refreshToken) return null

  const { accessToken, refreshed, next } = await ensureAccessToken(creds)
  const credentialsEnc = refreshed
    ? encryptCredentials(next as unknown as Record<string, unknown>, connection.orgId)
    : connection.credentialsEnc
  return { accessToken, refreshed, credentialsEnc, credentials: next }
}

/**
 * GET https://admob.googleapis.com/v1/accounts
 *
 * Returns the AdMob publisher accounts visible to the OAuth token. AdMob's
 * response shape varies — some clients see `account`, others `accounts` —
 * we accept both.
 */
export async function listAccounts(accessToken: string): Promise<AdMobAccount[]> {
  const res = await fetch(`${ADMOB_API_BASE}/accounts`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`AdMob listAccounts failed (${res.status}): ${text.slice(0, 500)}`)
  }
  const data = (await res.json()) as ListAdMobAccountsResponse
  return data.account ?? data.accounts ?? []
}

/**
 * POST https://admob.googleapis.com/v1/{accountName}/networkReport:generate
 *
 * `accountName` is the full resource name, e.g. 'accounts/pub-1234567890123456'.
 */
export async function generateNetworkReport(input: {
  accessToken: string
  accountName: string
  body: NetworkReportRequest
}): Promise<NetworkReportResponse> {
  const url = `${ADMOB_API_BASE}/${input.accountName}/networkReport:generate`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(input.body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(
      `AdMob networkReport.generate failed (${res.status}): ${text.slice(0, 500)}`,
    )
  }
  // AdMob returns either a JSON array of rows OR a streamed JSON sequence.
  // We try strict JSON first; if that fails, treat the body as JSON-Lines.
  const raw = await res.text()
  const trimmed = raw.trim()
  if (!trimmed) return []
  try {
    const parsed = JSON.parse(trimmed) as NetworkReportResponse
    return Array.isArray(parsed) ? parsed : [parsed as unknown as AdMobReportRow]
  } catch {
    // JSON-Lines / NDJSON fallback: one JSON object per line.
    const out: AdMobReportRow[] = []
    for (const line of trimmed.split('\n')) {
      const piece = line.trim()
      if (!piece) continue
      try {
        out.push(JSON.parse(piece) as AdMobReportRow)
      } catch {
        // Ignore malformed line — best-effort parse.
      }
    }
    return out
  }
}

/**
 * Decode an AdMob metric value object into a plain number.
 * - integerValue: string-encoded int
 * - microsValue:  string-encoded micros (1e-6 of the currency unit)
 * - doubleValue:  raw float (rates are 0..1; we leave them as-is so writers
 *                 can decide whether to scale to a percentage).
 */
export function decodeMetricValue(value: {
  integerValue?: string
  microsValue?: string
  doubleValue?: number
}): number {
  if (value.microsValue !== undefined) {
    const n = Number(value.microsValue)
    if (Number.isFinite(n)) return n / 1_000_000
    return 0
  }
  if (value.integerValue !== undefined) {
    const n = Number(value.integerValue)
    return Number.isFinite(n) ? n : 0
  }
  if (typeof value.doubleValue === 'number' && Number.isFinite(value.doubleValue)) {
    return value.doubleValue
  }
  return 0
}
