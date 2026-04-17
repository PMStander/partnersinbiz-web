import { randomBytes } from 'node:crypto'

export function generateIngestKey(): string {
  return randomBytes(32).toString('hex')
}

export function isValidIngestKeyFormat(key: string): boolean {
  return /^[0-9a-f]{64}$/.test(key)
}
