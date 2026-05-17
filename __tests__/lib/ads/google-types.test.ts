import type {
  AdPlatform,
  AdConnection,
  GoogleAdsConnectionData,
} from '@/lib/ads/types'

describe('Google Ads canonical type extensions', () => {
  it('AdPlatform includes "google"', () => {
    const p: AdPlatform = 'google'
    expect(p).toBe('google')
  })

  it('GoogleAdsConnectionData shape compiles', () => {
    const data: GoogleAdsConnectionData = {
      developerToken: 'encrypted-token-ref',
      loginCustomerId: '1234567890',
    }
    expect(data.developerToken).toBeDefined()
    expect(data.loginCustomerId).toBe('1234567890')
  })

  it('GoogleAdsConnectionData allows omitting loginCustomerId', () => {
    const data: GoogleAdsConnectionData = {
      developerToken: 'token',
    }
    expect(data.loginCustomerId).toBeUndefined()
  })
})
