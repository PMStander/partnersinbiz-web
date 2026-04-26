// lib/integrations/app_store_connect/jwt.ts
//
// Sign an ES256 JWT for the App Store Connect API.
//
// Spec: https://developer.apple.com/documentation/appstoreconnectapi/generating-tokens-for-api-requests
//
// Header:
//   { "alg": "ES256", "kid": "<keyId>", "typ": "JWT" }
// Claims:
//   { "iss": "<issuerId>", "iat": <now>, "exp": <now + 600>, "aud": "appstoreconnect-v1" }
//
// We use Node's built-in `crypto.sign` with the EC PEM key the user provides —
// no third-party JWT library, no extra deps.

import crypto from 'crypto'

const ASC_AUDIENCE = 'appstoreconnect-v1'
/** Token lifetime in seconds. ASC permits up to 20 min; 10 is plenty. */
export const ASC_JWT_LIFETIME_SECONDS = 600

/** Base64url encode a Buffer or string. */
function base64url(input: Buffer | string): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8')
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/**
 * The raw signature returned by `crypto.sign('sha256', ...)` for an EC key is
 * a DER-encoded ECDSA-Sig-Value (SEQUENCE of two INTEGERs: r, s). JWTs require
 * the IEEE-P1363 / "fixed" form: the 32-byte r || 32-byte s concatenation.
 *
 * Convert: parse minimal DER, strip leading 0x00 padding INTEGERs use, left-pad
 * each component to 32 bytes.
 */
export function derToJoseEcdsaSignature(derSig: Buffer): Buffer {
  // DER SEQUENCE: 0x30 <len> 0x02 <len_r> <r> 0x02 <len_s> <s>
  if (derSig.length < 8 || derSig[0] !== 0x30) {
    throw new Error('Invalid DER signature: expected SEQUENCE')
  }
  // SEQUENCE length byte handling — for ES256 the total len is small (< 128) so
  // a single length byte is the norm, but handle long form just in case.
  let offset = 2
  if (derSig[1] & 0x80) {
    const lenLen = derSig[1] & 0x7f
    offset = 2 + lenLen
  }
  if (derSig[offset] !== 0x02) {
    throw new Error('Invalid DER signature: expected INTEGER (r)')
  }
  const rLen = derSig[offset + 1]
  let r = derSig.slice(offset + 2, offset + 2 + rLen)
  offset = offset + 2 + rLen
  if (derSig[offset] !== 0x02) {
    throw new Error('Invalid DER signature: expected INTEGER (s)')
  }
  const sLen = derSig[offset + 1]
  let s = derSig.slice(offset + 2, offset + 2 + sLen)

  // Strip leading 0x00 byte (DER INTEGER positivity sign).
  if (r[0] === 0x00 && r.length > 32) r = r.slice(r.length - 32)
  if (s[0] === 0x00 && s.length > 32) s = s.slice(s.length - 32)

  // Left-pad to 32 bytes.
  const rPadded = Buffer.concat([Buffer.alloc(32 - r.length), r])
  const sPadded = Buffer.concat([Buffer.alloc(32 - s.length), s])
  return Buffer.concat([rPadded, sPadded])
}

export interface SignAscJwtInput {
  keyId: string
  issuerId: string
  /** PEM-encoded ES256 private key. */
  privateKey: string
  /** Override the clock — used in tests. Defaults to `Date.now()`. */
  now?: number
  /** Override token lifetime in seconds. Defaults to 600 (10 min). */
  lifetimeSeconds?: number
}

/**
 * Build and sign an ES256 JWT for App Store Connect.
 *
 * Returns the compact JWS (`<header>.<claims>.<sig>`).
 */
export function signAscJwt(input: SignAscJwtInput): string {
  if (!input.keyId || !input.issuerId || !input.privateKey) {
    throw new Error('signAscJwt requires keyId, issuerId, and privateKey')
  }

  const now = Math.floor((input.now ?? Date.now()) / 1000)
  const lifetime = input.lifetimeSeconds ?? ASC_JWT_LIFETIME_SECONDS

  const header = {
    alg: 'ES256',
    kid: input.keyId,
    typ: 'JWT',
  }
  const claims = {
    iss: input.issuerId,
    iat: now,
    exp: now + lifetime,
    aud: ASC_AUDIENCE,
  }

  const signingInput =
    base64url(JSON.stringify(header)) + '.' + base64url(JSON.stringify(claims))

  // ES256 = ECDSA over P-256 with SHA-256. Apple's keys are EC keys; node's
  // `crypto.sign('sha256', ...)` returns DER. Convert to JOSE format.
  const derSig = crypto.sign('sha256', Buffer.from(signingInput), {
    key: input.privateKey,
    dsaEncoding: 'der',
  })
  const joseSig = derToJoseEcdsaSignature(derSig)
  return signingInput + '.' + base64url(joseSig)
}
