import crypto from 'crypto'
import type { CapiUserRaw } from './types'
import type { CapiUserHash } from '@/lib/ads/types'

/**
 * SHA-256 hex of lowercased + trimmed input.
 * Returns undefined for falsy or empty-after-trim input.
 * Normalization matches Meta's Conversions API spec.
 */
export function sha256Norm(input: string | undefined): string | undefined {
  if (!input) return undefined
  const normalized = input.toLowerCase().trim()
  if (!normalized) return undefined
  return crypto.createHash('sha256').update(normalized).digest('hex')
}

/**
 * Hash a CapiUserRaw into a CapiUserHash.
 * fbp and fbc pass through unchanged — Meta accepts browser pixel cookies as raw values.
 */
export function hashUser(user: CapiUserRaw): CapiUserHash {
  return {
    em: sha256Norm(user.email),
    ph: sha256Norm(user.phone),
    fn: sha256Norm(user.firstName),
    ln: sha256Norm(user.lastName),
    ge: sha256Norm(user.gender),
    ct: sha256Norm(user.city),
    st: sha256Norm(user.state),
    country: sha256Norm(user.country),
    zp: sha256Norm(user.zip),
    db: sha256Norm(user.dob),
    external_id: sha256Norm(user.externalId),
    fbp: user.fbp,
    fbc: user.fbc,
  }
}
