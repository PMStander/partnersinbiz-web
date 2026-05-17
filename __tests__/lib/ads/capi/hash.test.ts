import crypto from 'crypto'
import { sha256Norm, hashUser } from '@/lib/ads/capi/hash'
import type { CapiUserRaw } from '@/lib/ads/capi/types'

describe('sha256Norm', () => {
  it('lowercases and trims input before hashing', () => {
    const a = sha256Norm('  Hello@World.COM  ')
    const b = sha256Norm('hello@world.com')
    expect(a).toBe(b)
    expect(a).toHaveLength(64)
  })

  it('returns undefined for empty string, undefined, and whitespace-only', () => {
    expect(sha256Norm('')).toBeUndefined()
    expect(sha256Norm(undefined)).toBeUndefined()
    expect(sha256Norm('   ')).toBeUndefined()
  })

  it('produces correct SHA-256 for known reference vector', () => {
    // Meta spec: lowercase + trim before hashing
    const expected = crypto.createHash('sha256').update('john@example.com').digest('hex')
    expect(sha256Norm('John@Example.com  ')).toBe(expected)
  })
})

describe('hashUser', () => {
  it('hashes all PII fields', () => {
    const user: CapiUserRaw = {
      email: 'Test@Example.com',
      phone: '+27821234567',
      firstName: 'Jane',
      lastName: 'Doe',
      gender: 'f',
      city: 'Cape Town',
      state: 'WC',
      country: 'ZA',
      zip: '8001',
      dob: '19900115',
      externalId: 'usr_abc123',
    }
    const hashed = hashUser(user)

    expect(hashed.em).toBe(sha256Norm(user.email))
    expect(hashed.ph).toBe(sha256Norm(user.phone))
    expect(hashed.fn).toBe(sha256Norm(user.firstName))
    expect(hashed.ln).toBe(sha256Norm(user.lastName))
    expect(hashed.ge).toBe(sha256Norm(user.gender))
    expect(hashed.ct).toBe(sha256Norm(user.city))
    expect(hashed.st).toBe(sha256Norm(user.state))
    expect(hashed.country).toBe(sha256Norm(user.country))
    expect(hashed.zp).toBe(sha256Norm(user.zip))
    expect(hashed.db).toBe(sha256Norm(user.dob))
    expect(hashed.external_id).toBe(sha256Norm(user.externalId))

    // All hashed values should be 64-char hex strings
    for (const field of [
      hashed.em, hashed.ph, hashed.fn, hashed.ln, hashed.ge,
      hashed.ct, hashed.st, hashed.country, hashed.zp, hashed.db, hashed.external_id,
    ]) {
      expect(field).toMatch(/^[0-9a-f]{64}$/)
    }
  })

  it('passes fbp and fbc through unchanged (Meta accepts raw cookie values)', () => {
    const user: CapiUserRaw = {
      email: 'user@test.com',
      fbp: 'fb.1.1558571054389.1098115397',
      fbc: 'fb.1.1554763741205.AbCdEfGhIjKlMnOpQrStUvWxYz1234567890',
    }
    const hashed = hashUser(user)

    expect(hashed.fbp).toBe(user.fbp)
    expect(hashed.fbc).toBe(user.fbc)
    // email is still hashed
    expect(hashed.em).toHaveLength(64)
  })
})
