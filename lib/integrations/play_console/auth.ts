// lib/integrations/play_console/auth.ts
//
// Service-account JWT bearer token construction for the Google Play Developer
// Reporting API. We sign a self-issued JWT with RS256 using node:crypto (no
// SDK), exchange it at https://oauth2.googleapis.com/token for a 1h access
// token, and cache the token in memory keyed by connection.id.
//
// Reference:
//   https://developers.google.com/identity/protocols/oauth2/service-account
//
// IMPORTANT: never import @firebase/admin or googleapis here. Native fetch +
// node:crypto only.

import crypto from 'crypto'
import {
  GOOGLE_TOKEN_URL,
  PLAY_REPORTING_SCOPE,
  type GoogleTokenError,
  type GoogleTokenResponse,
  type PlayServiceAccountKey,
} from './schema'

/* Cache ─────────────────────────────────────────────────────────────── */

interface CachedToken {
  accessToken: string
  /** Unix epoch ms when the token expires (with a 60s safety margin). */
  expiresAtMs: number
}

const tokenCache = new Map<string, CachedToken>()

/** Remove all cached tokens — exported for tests. */
export function _clearTokenCache(): void {
  tokenCache.clear()
}

/* Base64url helpers ─────────────────────────────────────────────────── */

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/* Service account JSON parsing ──────────────────────────────────────── */

/**
 * Validate + parse a service account JSON string. Throws a helpful Error if
 * the shape is wrong. Adapters that want to soft-fail on bad creds should
 * catch this and return a PullResult with notes.
 */
export function parseServiceAccountJson(json: string): PlayServiceAccountKey {
  if (!json || typeof json !== 'string' || json.trim().length === 0) {
    throw new Error('Empty service account JSON')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch (err) {
    throw new Error(
      `Service account JSON is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Service account JSON did not parse to an object')
  }
  const obj = parsed as Record<string, unknown>
  if (obj.type !== 'service_account') {
    throw new Error(
      `Service account JSON has type '${String(obj.type)}', expected 'service_account'`,
    )
  }
  if (typeof obj.private_key !== 'string' || !obj.private_key.includes('BEGIN')) {
    throw new Error('Service account JSON missing PEM-encoded private_key')
  }
  if (typeof obj.client_email !== 'string' || !obj.client_email.includes('@')) {
    throw new Error('Service account JSON missing client_email')
  }
  return obj as unknown as PlayServiceAccountKey
}

/* JWT signing ───────────────────────────────────────────────────────── */

export interface JwtClaims {
  iss: string
  scope: string
  aud: string
  exp: number
  iat: number
  /** Optional Google-style 'sub' for domain-wide delegation. */
  sub?: string
}

/**
 * Sign a JWT (RS256) with the service-account private key. Pure function,
 * no network. Exposed so tests can sign+verify without going to Google.
 */
export function signJwt(input: {
  key: PlayServiceAccountKey
  claims: JwtClaims
}): string {
  const header = { alg: 'RS256', typ: 'JWT', kid: input.key.private_key_id }
  const headerB64 = base64UrlEncode(JSON.stringify(header))
  const payloadB64 = base64UrlEncode(JSON.stringify(input.claims))
  const toSign = `${headerB64}.${payloadB64}`

  const signer = crypto.createSign('RSA-SHA256')
  signer.update(toSign)
  signer.end()
  const signature = signer.sign(input.key.private_key)
  const sigB64 = base64UrlEncode(signature)
  return `${toSign}.${sigB64}`
}

/**
 * Build a JWT for the Google token endpoint. 1h expiry — Google accepts
 * up to 1h.
 */
export function buildAssertionJwt(input: {
  key: PlayServiceAccountKey
  /** Override `now` for tests. */
  nowMs?: number
  /** Override expiry — defaults to 3600s (Google max). */
  ttlSeconds?: number
}): string {
  const nowMs = input.nowMs ?? Date.now()
  const iat = Math.floor(nowMs / 1000)
  const exp = iat + (input.ttlSeconds ?? 3600)
  const claims: JwtClaims = {
    iss: input.key.client_email,
    scope: PLAY_REPORTING_SCOPE,
    aud: GOOGLE_TOKEN_URL,
    exp,
    iat,
  }
  return signJwt({ key: input.key, claims })
}

/* Token exchange ────────────────────────────────────────────────────── */

/**
 * Fetch (or reuse cached) an access token for the service account. The
 * cache key defaults to `cacheKey` (typically connection.id) so multiple
 * connections backed by the same SA still each get a stable cache slot.
 */
export async function getAccessToken(input: {
  key: PlayServiceAccountKey
  cacheKey: string
  /** Override fetch — for tests. */
  fetcher?: typeof fetch
  /** Override now — for tests. */
  nowMs?: number
}): Promise<string> {
  const nowMs = input.nowMs ?? Date.now()
  const cached = tokenCache.get(input.cacheKey)
  // 60s safety margin so we don't hand out a token about to expire mid-call.
  if (cached && cached.expiresAtMs - 60_000 > nowMs) {
    return cached.accessToken
  }

  const assertion = buildAssertionJwt({ key: input.key, nowMs })
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  })

  const fetcher = input.fetcher ?? fetch
  const res = await fetcher(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  const text = await res.text()
  let parsed: GoogleTokenResponse | GoogleTokenError
  try {
    parsed = JSON.parse(text) as GoogleTokenResponse | GoogleTokenError
  } catch {
    throw new Error(
      `Google token endpoint returned non-JSON ${res.status}: ${text.slice(0, 200)}`,
    )
  }

  if (!res.ok || 'error' in parsed) {
    const err = parsed as GoogleTokenError
    throw new Error(
      `Google token exchange failed (${res.status}): ${err.error ?? 'unknown'}${
        err.error_description ? ` — ${err.error_description}` : ''
      }`,
    )
  }

  const ok = parsed as GoogleTokenResponse
  if (!ok.access_token || typeof ok.expires_in !== 'number') {
    throw new Error(
      `Google token response missing access_token or expires_in: ${text.slice(0, 200)}`,
    )
  }

  const expiresAtMs = nowMs + ok.expires_in * 1000
  tokenCache.set(input.cacheKey, {
    accessToken: ok.access_token,
    expiresAtMs,
  })
  return ok.access_token
}
