// lib/integrations/crypto.ts
//
// Wraps the existing AES-256-GCM helper at lib/social/encryption so every
// integration uses the same per-org key derivation and master key.
// Adapters call these — never `crypto` directly, never the social helper directly.

import {
  encryptToken,
  decryptToken,
  type EncryptedData,
} from '@/lib/social/encryption'

export type EncryptedCredentials = EncryptedData

/**
 * Encrypt a credentials object (anything JSON-serialisable) with the
 * org-scoped master key. Use the returned object as `Connection.credentialsEnc`.
 */
export function encryptCredentials(
  credentials: Record<string, unknown>,
  orgId: string,
): EncryptedCredentials {
  const json = JSON.stringify(credentials)
  return encryptToken(json, orgId)
}

/**
 * Decrypt a credentials blob back to its original object. Throws if the
 * ciphertext was produced under a different org or master key.
 */
export function decryptCredentials<T = Record<string, unknown>>(
  data: EncryptedCredentials,
  orgId: string,
): T {
  const json = decryptToken(data, orgId)
  return JSON.parse(json) as T
}

/**
 * Convenience for adapters that only need to know the credentials decrypt.
 * Returns `null` if the connection has never been credentialed.
 */
export function maybeDecryptCredentials<T = Record<string, unknown>>(
  data: EncryptedCredentials | null | undefined,
  orgId: string,
): T | null {
  if (!data) return null
  return decryptCredentials<T>(data, orgId)
}
