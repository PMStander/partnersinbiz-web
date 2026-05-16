import { randomBytes } from 'crypto'

const ACCESS_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no I, O, 0, 1

export function generateEditShareToken(): string {
  return randomBytes(16).toString('hex')
}

export function generateAccessCode(): string {
  const len = 6
  const bytes = randomBytes(len)
  let out = ''
  for (let i = 0; i < len; i++) {
    out += ACCESS_ALPHABET[bytes[i] % ACCESS_ALPHABET.length]
  }
  return out
}

export function verifyAccessCode(stored: string | undefined | null, provided: string | undefined | null): boolean {
  if (!stored || !provided) return false
  return stored.toUpperCase() === provided.toUpperCase()
}
