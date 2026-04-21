/**
 * Token Encryption — AES-256-GCM encryption for OAuth tokens.
 *
 * Uses a master key from env (SOCIAL_TOKEN_MASTER_KEY) combined with
 * the orgId to derive per-client encryption keys via HKDF.
 */
import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const TAG_LENGTH = 16

function getMasterKey(): Buffer {
  const key = process.env.SOCIAL_TOKEN_MASTER_KEY?.trim()
  if (!key) throw new Error('Missing env var: SOCIAL_TOKEN_MASTER_KEY')
  // Accept hex-encoded 32-byte key or raw string (hashed to 32 bytes)
  if (key.length === 64 && /^[0-9a-f]+$/i.test(key)) {
    return Buffer.from(key, 'hex')
  }
  return crypto.createHash('sha256').update(key).digest()
}

function deriveKey(orgId: string): Buffer {
  const masterKey = getMasterKey()
  return crypto.createHmac('sha256', masterKey).update(orgId).digest()
}

export interface EncryptedData {
  ciphertext: string // base64
  iv: string // base64
  tag: string // base64
}

export function encryptToken(plaintext: string, orgId: string): EncryptedData {
  const key = deriveKey(orgId)
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  }
}

export function decryptToken(data: EncryptedData, orgId: string): string {
  const key = deriveKey(orgId)
  const iv = Buffer.from(data.iv, 'base64')
  const tag = Buffer.from(data.tag, 'base64')
  const ciphertext = Buffer.from(data.ciphertext, 'base64')
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  return decipher.update(ciphertext) + decipher.final('utf8')
}

/**
 * Encrypt an OAuth token set for storage in Firestore.
 * Returns the EncryptedTokenBlock shape expected by the social_accounts schema.
 */
export function encryptTokenBlock(
  tokens: {
    accessToken: string
    refreshToken?: string | null
    tokenType?: string
    expiresAt?: Date | null
  },
  orgId: string,
): {
  accessToken: string
  refreshToken: string | null
  tokenType: string
  expiresAt: Date | null
  iv: string
  tag: string
} {
  const encrypted = encryptToken(
    JSON.stringify({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken ?? null,
    }),
    orgId,
  )
  return {
    accessToken: encrypted.ciphertext,
    refreshToken: tokens.refreshToken ? 'encrypted' : null,
    tokenType: tokens.tokenType ?? 'Bearer',
    expiresAt: tokens.expiresAt ?? null,
    iv: encrypted.iv,
    tag: encrypted.tag,
  }
}

/**
 * Decrypt an EncryptedTokenBlock back to plain tokens.
 */
export function decryptTokenBlock(
  block: {
    accessToken: string
    iv: string
    tag: string
  },
  orgId: string,
): { accessToken: string; refreshToken: string | null } {
  const decrypted = decryptToken(
    { ciphertext: block.accessToken, iv: block.iv, tag: block.tag },
    orgId,
  )
  return JSON.parse(decrypted)
}
