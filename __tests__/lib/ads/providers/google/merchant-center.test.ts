import {
  buildMcAuthorizeUrl,
  exchangeMcCode,
  listMerchantAccounts,
  listDatafeeds,
  extractFeedLabels,
  MC_SCOPE,
  MerchantDatafeed,
} from '../../../../../lib/ads/providers/google/merchant-center'

const originalEnv = process.env

beforeEach(() => {
  jest.resetAllMocks()
  process.env = {
    ...originalEnv,
    GOOGLE_OAUTH_CLIENT_ID: 'test-client-id',
    GOOGLE_OAUTH_CLIENT_SECRET: 'test-client-secret',
  }
})

afterEach(() => {
  process.env = originalEnv
})

describe('buildMcAuthorizeUrl', () => {
  it('includes content scope, state, and access_type=offline', () => {
    const url = buildMcAuthorizeUrl({
      redirectUri: 'https://example.com/callback',
      state: 'my-state-123',
    })
    const parsed = new URL(url)
    expect(parsed.searchParams.get('scope')).toBe(MC_SCOPE)
    expect(parsed.searchParams.get('state')).toBe('my-state-123')
    expect(parsed.searchParams.get('access_type')).toBe('offline')
    expect(parsed.searchParams.get('response_type')).toBe('code')
    expect(parsed.searchParams.get('client_id')).toBe('test-client-id')
    expect(parsed.searchParams.get('redirect_uri')).toBe('https://example.com/callback')
    expect(parsed.searchParams.get('prompt')).toBe('consent')
  })

  it('throws when GOOGLE_OAUTH_CLIENT_ID is missing', () => {
    delete process.env.GOOGLE_OAUTH_CLIENT_ID
    expect(() =>
      buildMcAuthorizeUrl({
        redirectUri: 'https://example.com/callback',
        state: 'state',
      })
    ).toThrow('Missing env var: GOOGLE_OAUTH_CLIENT_ID')
  })
})

describe('exchangeMcCode', () => {
  it('posts to oauth2.googleapis.com/token with grant_type=authorization_code', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'acc-token',
        refresh_token: 'ref-token',
        expires_in: 3600,
        token_type: 'Bearer',
      }),
    })
    global.fetch = mockFetch as unknown as typeof fetch

    const result = await exchangeMcCode({
      code: 'auth-code',
      redirectUri: 'https://example.com/callback',
    })

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, options] = mockFetch.mock.calls[0]
    expect(url).toBe('https://oauth2.googleapis.com/token')
    expect(options.method).toBe('POST')

    const body = new URLSearchParams(options.body as string)
    expect(body.get('grant_type')).toBe('authorization_code')
    expect(body.get('code')).toBe('auth-code')
    expect(body.get('client_id')).toBe('test-client-id')
    expect(body.get('client_secret')).toBe('test-client-secret')

    expect(result).toEqual({
      accessToken: 'acc-token',
      refreshToken: 'ref-token',
      expiresInSeconds: 3600,
    })
  })

  it('throws on non-2xx response', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    })
    global.fetch = mockFetch as unknown as typeof fetch

    await expect(
      exchangeMcCode({ code: 'bad-code', redirectUri: 'https://example.com/callback' })
    ).rejects.toThrow('MC token exchange failed: HTTP 401')
  })
})

describe('listMerchantAccounts', () => {
  it('returns merchant IDs from accountIdentifiers', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        accountIdentifiers: [
          { merchantId: '111111' },
          { merchantId: '222222' },
        ],
      }),
    })
    global.fetch = mockFetch as unknown as typeof fetch

    const accounts = await listMerchantAccounts({ accessToken: 'token' })

    expect(accounts).toEqual([
      { merchantId: '111111' },
      { merchantId: '222222' },
    ])

    const [url, options] = mockFetch.mock.calls[0]
    expect(url).toContain('/accounts/authinfo')
    expect(options.headers.Authorization).toBe('Bearer token')
  })

  it('falls back to aggregatorId when merchantId is absent', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        accountIdentifiers: [
          { aggregatorId: 'agg-999' },
          { merchantId: '333333' },
        ],
      }),
    })
    global.fetch = mockFetch as unknown as typeof fetch

    const accounts = await listMerchantAccounts({ accessToken: 'token' })

    expect(accounts).toEqual([
      { merchantId: 'agg-999' },
      { merchantId: '333333' },
    ])
  })
})

describe('listDatafeeds', () => {
  it('returns shape with feed labels', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        resources: [
          {
            id: 'feed-1',
            name: 'My Feed',
            targets: [{ country: 'US', feedLabel: 'US_FEED' }],
          },
          {
            id: 'feed-2',
            name: 'Another Feed',
            targets: [{ country: 'ZA' }],
          },
        ],
      }),
    })
    global.fetch = mockFetch as unknown as typeof fetch

    const feeds = await listDatafeeds({ accessToken: 'token', merchantId: '12345' })

    expect(feeds).toHaveLength(2)
    expect(feeds[0]).toEqual({
      id: 'feed-1',
      name: 'My Feed',
      targetCountry: 'US',
      feedLabel: 'US_FEED',
    })
    // falls back to country when feedLabel absent
    expect(feeds[1]).toEqual({
      id: 'feed-2',
      name: 'Another Feed',
      targetCountry: 'ZA',
      feedLabel: 'ZA',
    })

    const [url] = mockFetch.mock.calls[0]
    expect(url).toContain('/12345/datafeeds')
  })
})

describe('extractFeedLabels', () => {
  it('deduplicates and sorts feed labels', () => {
    const feeds: MerchantDatafeed[] = [
      { id: '1', feedLabel: 'ZA' },
      { id: '2', feedLabel: 'US' },
      { id: '3', feedLabel: 'ZA' },
      { id: '4', feedLabel: 'AU' },
      { id: '5' }, // no feedLabel
    ]

    const labels = extractFeedLabels(feeds)
    expect(labels).toEqual(['AU', 'US', 'ZA'])
  })
})
