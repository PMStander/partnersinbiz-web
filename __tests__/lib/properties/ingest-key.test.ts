import { generateIngestKey, isValidIngestKeyFormat } from '@/lib/properties/ingest-key'

describe('generateIngestKey', () => {
  it('returns a 64-char lowercase hex string', () => {
    const key = generateIngestKey()
    expect(key).toMatch(/^[0-9a-f]{64}$/)
  })

  it('returns a unique key on each call', () => {
    const keys = new Set(Array.from({ length: 10 }, generateIngestKey))
    expect(keys.size).toBe(10)
  })
})

describe('isValidIngestKeyFormat', () => {
  it('accepts a valid 64-char hex key', () => {
    expect(isValidIngestKeyFormat('a'.repeat(64))).toBe(true)
  })

  it('rejects a short key', () => {
    expect(isValidIngestKeyFormat('a'.repeat(63))).toBe(false)
  })

  it('rejects non-hex characters', () => {
    expect(isValidIngestKeyFormat('g' + 'a'.repeat(63))).toBe(false)
  })

  it('rejects empty string', () => {
    expect(isValidIngestKeyFormat('')).toBe(false)
  })
})
