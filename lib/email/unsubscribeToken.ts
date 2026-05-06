/**
 * HMAC-signed unsubscribe tokens.
 *
 * Token format: `${contactId}.${signature}` where signature is
 * `hex(hmacSha256(contactId, secret))`.
 *
 * Env: UNSUBSCRIBE_TOKEN_SECRET — the HMAC secret. If unset (e.g. local dev),
 * we fall back to a permissive mode that accepts plain Firestore-style ids
 * (alphanumeric, 20+ chars) without a signature. A warning is logged once.
 *
 * Compares signatures with crypto.timingSafeEqual.
 */
import { createHmac, timingSafeEqual } from 'crypto'

let warnedMissingSecret = false

function getSecret(): string | null {
  const s = process.env.UNSUBSCRIBE_TOKEN_SECRET
  if (!s || !s.trim()) {
    if (!warnedMissingSecret) {
      // eslint-disable-next-line no-console
      console.warn(
        '[unsubscribeToken] UNSUBSCRIBE_TOKEN_SECRET is not set; falling back to permissive mode (dev only).'
      )
      warnedMissingSecret = true
    }
    return null
  }
  return s
}

function hmacHex(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('hex')
}

/**
 * Sign an unsubscribe token.
 *
 * Without campaignId: `${contactId}.${hmac(contactId)}`
 * With    campaignId: `${contactId}.${campaignId}.${hmac(contactId+'.'+campaignId)}`
 *
 * Backward-compatible: tokens without campaignId continue to verify correctly.
 */
export function signUnsubscribeToken(contactId: string, campaignId?: string): string {
  const secret = getSecret()
  if (!secret) {
    // Permissive fallback: emit just the contactId (or contactId.campaignId).
    // Receiver will accept it when no secret is configured.
    return campaignId ? `${contactId}.${campaignId}` : contactId
  }
  if (campaignId) {
    const payload = `${contactId}.${campaignId}`
    const signature = hmacHex(payload, secret)
    return `${contactId}.${campaignId}.${signature}`
  }
  const signature = hmacHex(contactId, secret)
  return `${contactId}.${signature}`
}

export type VerifyResult =
  | { ok: true; contactId: string; campaignId?: string }
  | { ok: false; reason: string }

export function verifyUnsubscribeToken(token: string): VerifyResult {
  if (typeof token !== 'string' || token.length === 0) {
    return { ok: false, reason: 'empty token' }
  }

  const secret = getSecret()

  // Permissive fallback — no secret configured.
  if (!secret) {
    // Accept either a plain id, `id.campaignId`, or a fully-signed token.
    const parts = token.split('.')
    const id = parts[0]
    if (/^[A-Za-z0-9]{20,}$/.test(id)) {
      // If there are 2 parts and neither looks like a hex signature, treat as campaignId
      const campaignId = parts.length === 2 && /^[A-Za-z0-9]{20,}$/.test(parts[1])
        ? parts[1]
        : undefined
      return { ok: true, contactId: id, ...(campaignId ? { campaignId } : {}) }
    }
    return { ok: false, reason: 'invalid id format' }
  }

  const parts = token.split('.')

  // 3-part token: contactId.campaignId.signature
  if (parts.length === 3) {
    const [contactId, campaignId, signature] = parts
    if (!contactId || !campaignId || !signature) {
      return { ok: false, reason: 'malformed token' }
    }
    const payload = `${contactId}.${campaignId}`
    const expected = hmacHex(payload, secret)
    const a = Buffer.from(signature, 'hex')
    const b = Buffer.from(expected, 'hex')
    if (a.length !== b.length || a.length === 0) {
      return { ok: false, reason: 'invalid signature' }
    }
    if (!timingSafeEqual(a, b)) {
      return { ok: false, reason: 'invalid signature' }
    }
    return { ok: true, contactId, campaignId }
  }

  // 2-part token (legacy): contactId.signature
  if (parts.length === 2) {
    const [contactId, signature] = parts
    if (!contactId || !signature) {
      return { ok: false, reason: 'malformed token' }
    }
    const expected = hmacHex(contactId, secret)
    const a = Buffer.from(signature, 'hex')
    const b = Buffer.from(expected, 'hex')
    if (a.length !== b.length || a.length === 0) {
      return { ok: false, reason: 'invalid signature' }
    }
    if (!timingSafeEqual(a, b)) {
      return { ok: false, reason: 'invalid signature' }
    }
    return { ok: true, contactId }
  }

  return { ok: false, reason: 'malformed token' }
}
