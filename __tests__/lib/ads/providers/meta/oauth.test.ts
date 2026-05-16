// __tests__/lib/ads/providers/meta/oauth.test.ts
import { buildAuthorizeUrl, exchangeCode, exchangeForLongLived, refresh } from '@/lib/ads/providers/meta/oauth'

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

describe('exchangeCode', () => {
  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      FACEBOOK_CLIENT_ID: '133722058771742',
      FACEBOOK_CLIENT_SECRET: 'secret',
    }
    global.fetch = jest.fn() as unknown as typeof fetch
  })

  it('hits v25.0/oauth/access_token and returns { accessToken, expiresInSeconds, userId? }', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'EAAO_short', expires_in: 3600 }),
    })
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'meta_user_123' }),
    })

    const r = await exchangeCode({ code: 'AUTH_CODE', redirectUri: 'https://cb/' })
    expect(r.accessToken).toBe('EAAO_short')
    expect(r.expiresInSeconds).toBe(3600)
    expect(r.userId).toBe('meta_user_123')

    const firstCall = (global.fetch as jest.Mock).mock.calls[0][0]
    expect(firstCall).toContain('https://graph.facebook.com/v25.0/oauth/access_token')
    expect(firstCall).toContain('code=AUTH_CODE')
    expect(firstCall).toContain('client_id=133722058771742')
    expect(firstCall).toContain('client_secret=secret')
  })

  it('throws with Meta error message on non-ok response', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'Invalid verification code format.' } }),
    })
    await expect(
      exchangeCode({ code: 'BAD', redirectUri: 'https://cb/' }),
    ).rejects.toThrow(/Invalid verification code format/)
  })
})

describe('exchangeForLongLived', () => {
  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      FACEBOOK_CLIENT_ID: '133722058771742',
      FACEBOOK_CLIENT_SECRET: 'secret',
    }
    global.fetch = jest.fn() as unknown as typeof fetch
  })

  it('swaps short-lived for long-lived (~60d) token via grant_type=fb_exchange_token', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'EAAO_long', expires_in: 5184000 }),
    })
    const r = await exchangeForLongLived({ accessToken: 'EAAO_short' })
    expect(r.accessToken).toBe('EAAO_long')
    expect(r.expiresInSeconds).toBe(5184000)
    const url = (global.fetch as jest.Mock).mock.calls[0][0]
    expect(url).toContain('grant_type=fb_exchange_token')
    expect(url).toContain('fb_exchange_token=EAAO_short')
  })
})

describe('refresh', () => {
  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      FACEBOOK_CLIENT_ID: '133722058771742',
      FACEBOOK_CLIENT_SECRET: 'secret',
    }
    global.fetch = jest.fn() as unknown as typeof fetch
  })

  it('takes the current long-lived token as "refreshToken" arg, returns a fresh long-lived', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'EAAO_long2', expires_in: 5184000 }),
    })
    const r = await refresh({ refreshToken: 'EAAO_long1' })
    expect(r.accessToken).toBe('EAAO_long2')
    expect(r.expiresInSeconds).toBe(5184000)
    expect(r.refreshToken).toBeUndefined()
  })
})
