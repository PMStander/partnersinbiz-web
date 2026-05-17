// __tests__/lib/ads/providers/linkedin/constants.test.ts
import {
  LINKEDIN_ADS_SCOPES,
  LINKEDIN_ADS_API_BASE,
  LINKEDIN_ADS_VERSION,
} from '@/lib/ads/providers/linkedin/constants'

describe('LinkedIn Ads constants', () => {
  it('LINKEDIN_ADS_SCOPES contains all 4 required scopes', () => {
    expect(LINKEDIN_ADS_SCOPES).toContain('r_ads')
    expect(LINKEDIN_ADS_SCOPES).toContain('rw_ads')
    expect(LINKEDIN_ADS_SCOPES).toContain('r_ads_reporting')
    expect(LINKEDIN_ADS_SCOPES).toContain('rw_organization_admin')
    expect(LINKEDIN_ADS_SCOPES).toHaveLength(4)
  })

  it('LINKEDIN_ADS_API_BASE is the REST endpoint', () => {
    expect(LINKEDIN_ADS_API_BASE).toBe('https://api.linkedin.com/rest')
  })

  it('LINKEDIN_ADS_VERSION is a YYYYMM string', () => {
    expect(LINKEDIN_ADS_VERSION).toMatch(/^\d{6}$/)
  })
})
