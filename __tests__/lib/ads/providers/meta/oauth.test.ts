// __tests__/lib/ads/providers/meta/oauth.test.ts
import { buildAuthorizeUrl } from '@/lib/ads/providers/meta/oauth'

const ORIGINAL_ENV = process.env

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV, FACEBOOK_CLIENT_ID: '133722058771742' }
})
afterAll(() => {
  process.env = ORIGINAL_ENV
})

describe('buildAuthorizeUrl', () => {
  it('returns a v25.0 dialog URL with client_id, redirect_uri, scope, state', () => {
    const url = buildAuthorizeUrl({
      redirectUri: 'https://partnersinbiz.online/api/v1/ads/connections/meta/callback',
      state: 'state_abc',
      orgId: 'org_1',
    })
    expect(url).toContain('https://www.facebook.com/v25.0/dialog/oauth')
    const u = new URL(url)
    expect(u.searchParams.get('client_id')).toBe('133722058771742')
    expect(u.searchParams.get('redirect_uri')).toBe(
      'https://partnersinbiz.online/api/v1/ads/connections/meta/callback',
    )
    expect(u.searchParams.get('scope')).toContain('ads_management')
    expect(u.searchParams.get('scope')).toContain('ads_read')
    expect(u.searchParams.get('scope')).toContain('business_management')
    expect(u.searchParams.get('scope')).toContain('pages_read_engagement')
    expect(u.searchParams.get('state')).toBe('state_abc')
    expect(u.searchParams.get('response_type')).toBe('code')
  })

  it('throws if FACEBOOK_CLIENT_ID is missing', () => {
    delete process.env.FACEBOOK_CLIENT_ID
    expect(() =>
      buildAuthorizeUrl({ redirectUri: 'x', state: 'y', orgId: 'z' }),
    ).toThrow(/FACEBOOK_CLIENT_ID/)
  })
})
