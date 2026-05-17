// __tests__/lib/ads/linkedin-types.test.ts
import type {
  AdPlatform,
  LinkedinAdConnectionData,
} from '@/lib/ads/types'

describe('LinkedIn Ads canonical type extensions', () => {
  it('LinkedinAdConnectionData shape with all fields compiles', () => {
    // Simulate a fully-populated post-OAuth connection data object
    const data: LinkedinAdConnectionData = {
      memberUrn: 'urn:li:person:abc123',
      organizationUrn: 'urn:li:organization:987654',
      selectedAdAccountUrn: 'urn:li:sponsoredAccount:111222',
      // refreshTokenExpiresAt is a Firestore Timestamp — omit here to keep test pure
    }
    expect(data.memberUrn).toBe('urn:li:person:abc123')
    expect(data.organizationUrn).toBe('urn:li:organization:987654')
    expect(data.selectedAdAccountUrn).toBe('urn:li:sponsoredAccount:111222')
  })

  it('all LinkedinAdConnectionData fields are optional (partial population after OAuth)', () => {
    // Empty object must satisfy the type — all fields optional
    const partial: LinkedinAdConnectionData = {}
    expect(partial.memberUrn).toBeUndefined()
    expect(partial.organizationUrn).toBeUndefined()
    expect(partial.selectedAdAccountUrn).toBeUndefined()
    expect(partial.refreshTokenExpiresAt).toBeUndefined()
  })

  it('AdPlatform union narrows to "linkedin"', () => {
    const p: AdPlatform = 'linkedin'
    expect(p).toBe('linkedin')
  })
})
