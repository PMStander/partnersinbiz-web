/**
 * HMAC-signed lead-capture confirmation tokens (double-opt-in).
 *
 * Token format: `${submissionId}.${signature}` where signature is
 * `hex(hmacSha256(submissionId, secret))`.
 *
 * Env:
 *   LEAD_CONFIRM_TOKEN_SECRET — primary HMAC secret
 *   UNSUBSCRIBE_TOKEN_SECRET  — fallback (re-using the unsub secret is
 *                               common in early-stage deployments)
 *
 * If neither secret is set we fall back to a permissive mode that accepts
 * plain Firestore-style ids without a signature. A warning is logged once.
 *
 * Signature comparison is done with `crypto.timingSafeEqual`.
 */
import { createHmac, timingSafeEqual } from 'crypto'

let warnedMissingSecret = false

function getSecret(): string | null {
  const primary = process.env.LEAD_CONFIRM_TOKEN_SECRET
  if (primary && primary.trim()) return primary
  const fallback = process.env.UNSUBSCRIBE_TOKEN_SECRET
  if (fallback && fallback.trim()) return fallback
  if (!warnedMissingSecret) {
    // eslint-disable-next-line no-console
    console.warn(
      '[leadCaptureToken] LEAD_CONFIRM_TOKEN_SECRET and UNSUBSCRIBE_TOKEN_SECRET are not set; running in permissive mode (dev only).',
    )
    warnedMissingSecret = true
  }
  return null
}

function hmacHex(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('hex')
}

/** Sign a confirmation token for a submission id. */
export function signConfirmToken(submissionId: string): string {
  const secret = getSecret()
  if (!secret) return submissionId
  const signature = hmacHex(submissionId, secret)
  return `${submissionId}.${signature}`
}

export type VerifyConfirmResult =
  | { ok: true; submissionId: string }
  | { ok: false; reason: string }

/** Verify a confirmation token and extract its submission id. */
export function verifyConfirmToken(token: string): VerifyConfirmResult {
  if (typeof token !== 'string' || token.length === 0) {
    return { ok: false, reason: 'empty token' }
  }
  const secret = getSecret()
  if (!secret) {
    const id = token.split('.')[0]
    if (/^[A-Za-z0-9]{18,}$/.test(id)) return { ok: true, submissionId: id }
    return { ok: false, reason: 'invalid id format' }
  }
  const parts = token.split('.')
  if (parts.length !== 2) return { ok: false, reason: 'malformed token' }
  const [submissionId, signature] = parts
  if (!submissionId || !signature) return { ok: false, reason: 'malformed token' }
  const expected = hmacHex(submissionId, secret)
  const a = Buffer.from(signature, 'hex')
  const b = Buffer.from(expected, 'hex')
  if (a.length !== b.length || a.length === 0) {
    return { ok: false, reason: 'invalid signature' }
  }
  if (!timingSafeEqual(a, b)) return { ok: false, reason: 'invalid signature' }
  return { ok: true, submissionId }
}
