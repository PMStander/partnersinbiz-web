// 64-char hex master key for tests (matches the production format)
process.env.SOCIAL_TOKEN_MASTER_KEY =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

import {
  encryptCredentials,
  decryptCredentials,
  maybeDecryptCredentials,
} from '@/lib/integrations/crypto'

describe('integration crypto', () => {
  it('round-trips a credentials object', () => {
    const creds = {
      apiKey: 'sk_live_abc123',
      refreshToken: 'rt_xyz',
      expiresAt: 1700000000,
    }
    const enc = encryptCredentials(creds, 'org_a')
    expect(enc.ciphertext).toBeTruthy()
    expect(enc.iv).toBeTruthy()
    expect(enc.tag).toBeTruthy()

    const dec = decryptCredentials<typeof creds>(enc, 'org_a')
    expect(dec).toEqual(creds)
  })

  it('does not decrypt under a different orgId', () => {
    const enc = encryptCredentials({ apiKey: 'k' }, 'org_a')
    expect(() => decryptCredentials(enc, 'org_b')).toThrow()
  })

  it('produces different ciphertext each call (random IV)', () => {
    const a = encryptCredentials({ apiKey: 'k' }, 'org_a')
    const b = encryptCredentials({ apiKey: 'k' }, 'org_a')
    expect(a.ciphertext).not.toBe(b.ciphertext)
    expect(a.iv).not.toBe(b.iv)
  })

  it('maybeDecryptCredentials returns null for null input', () => {
    expect(maybeDecryptCredentials(null, 'org_a')).toBeNull()
    expect(maybeDecryptCredentials(undefined, 'org_a')).toBeNull()
  })

  it('maybeDecryptCredentials decrypts when input is present', () => {
    const enc = encryptCredentials({ apiKey: 'k' }, 'org_a')
    expect(maybeDecryptCredentials(enc, 'org_a')).toEqual({ apiKey: 'k' })
  })
})
