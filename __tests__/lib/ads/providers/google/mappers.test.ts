// __tests__/lib/ads/providers/google/mappers.test.ts
import {
  googleEntityStatusFromCanonical,
  canonicalEntityStatusFromGoogle,
  googleSearchNetworkSettings,
  googleDisplayNetworkSettings,
  defaultBiddingStrategy,
  microsFromMajor,
  majorFromMicros,
  googleKeywordMatchType,
  canonicalKeywordMatchTypeFromGoogle,
} from '@/lib/ads/providers/google/mappers'

describe('googleEntityStatusFromCanonical', () => {
  it('maps ACTIVE → ENABLED', () => {
    expect(googleEntityStatusFromCanonical('ACTIVE')).toBe('ENABLED')
  })
  it('maps PAUSED → PAUSED', () => {
    expect(googleEntityStatusFromCanonical('PAUSED')).toBe('PAUSED')
  })
  it('maps ARCHIVED → REMOVED', () => {
    expect(googleEntityStatusFromCanonical('ARCHIVED')).toBe('REMOVED')
  })
  it('maps DRAFT → PAUSED (ships paused so it does not immediately spend)', () => {
    expect(googleEntityStatusFromCanonical('DRAFT')).toBe('PAUSED')
  })
  it('maps PENDING_REVIEW → PAUSED', () => {
    expect(googleEntityStatusFromCanonical('PENDING_REVIEW')).toBe('PAUSED')
  })
})

describe('canonicalEntityStatusFromGoogle', () => {
  it('maps ENABLED → ACTIVE', () => {
    expect(canonicalEntityStatusFromGoogle('ENABLED')).toBe('ACTIVE')
  })
  it('maps PAUSED → PAUSED', () => {
    expect(canonicalEntityStatusFromGoogle('PAUSED')).toBe('PAUSED')
  })
  it('maps REMOVED → ARCHIVED', () => {
    expect(canonicalEntityStatusFromGoogle('REMOVED')).toBe('ARCHIVED')
  })
  it('maps unknown value → DRAFT', () => {
    expect(canonicalEntityStatusFromGoogle('UNKNOWN_STATUS')).toBe('DRAFT')
  })
})

describe('googleSearchNetworkSettings', () => {
  it('returns expected defaults for Search campaigns', () => {
    expect(googleSearchNetworkSettings()).toEqual({
      targetGoogleSearch: true,
      targetSearchNetwork: true,
      targetContentNetwork: false,
      targetPartnerSearchNetwork: false,
    })
  })
})

describe('googleDisplayNetworkSettings', () => {
  it('returns expected defaults for Display campaigns', () => {
    expect(googleDisplayNetworkSettings()).toEqual({
      targetGoogleSearch: false,
      targetSearchNetwork: false,
      targetContentNetwork: true,
      targetPartnerSearchNetwork: false,
    })
  })
})

describe('defaultBiddingStrategy', () => {
  it('returns MANUAL_CPC with no extra fields', () => {
    expect(defaultBiddingStrategy()).toEqual({ type: 'MANUAL_CPC' })
  })
})

describe('microsFromMajor', () => {
  it('converts 1.50 → "1500000"', () => {
    expect(microsFromMajor(1.5)).toBe('1500000')
  })
  it('converts 0 → "0"', () => {
    expect(microsFromMajor(0)).toBe('0')
  })
  it('throws on negative amount', () => {
    expect(() => microsFromMajor(-1)).toThrow('Invalid major amount: -1')
  })
})

describe('majorFromMicros', () => {
  it('converts "1500000" → 1.5', () => {
    expect(majorFromMicros('1500000')).toBe(1.5)
  })
  it('converts numeric 1500000 → 1.5', () => {
    expect(majorFromMicros(1500000)).toBe(1.5)
  })
})

describe('keyword match type mappers', () => {
  const matchTypes = ['EXACT', 'PHRASE', 'BROAD'] as const

  it.each(matchTypes)('googleKeywordMatchType(%s) is identity', (m) => {
    expect(googleKeywordMatchType(m)).toBe(m)
  })

  it.each(matchTypes)('canonicalKeywordMatchTypeFromGoogle(%s) round-trips', (m) => {
    expect(canonicalKeywordMatchTypeFromGoogle(m)).toBe(m)
  })

  it('canonicalKeywordMatchTypeFromGoogle(BROAD_MATCH_MODIFIER) falls back to BROAD', () => {
    expect(canonicalKeywordMatchTypeFromGoogle('BROAD_MATCH_MODIFIER')).toBe('BROAD')
  })
})
