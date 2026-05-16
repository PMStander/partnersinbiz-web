// __tests__/app/api/v1/ads/connections/callback.test.ts
import { GET } from '@/app/api/v1/ads/connections/[platform]/callback/route'

jest.mock('@/lib/ads/providers/meta/oauth', () => ({
  exchangeCode: jest.fn(),
  exchangeForLongLived: jest.fn(),
  buildAuthorizeUrl: jest.fn(),
  refresh: jest.fn(),
}))
jest.mock('@/lib/ads/providers/meta/client', () => ({
  listAdAccounts: jest.fn(),
}))
jest.mock('@/lib/ads/connections/store', () => ({
  createConnection: jest.fn(),
}))

const states = new Map<string, any>()
jest.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: (_path: string) => ({
      doc: (id: string) => ({
        get: async () => ({
          exists: states.has(id),
          data: () => states.get(id),
        }),
        delete: async () => states.delete(id),
      }),
    }),
  },
}))

const oauth = jest.requireMock('@/lib/ads/providers/meta/oauth')
const client = jest.requireMock('@/lib/ads/providers/meta/client')
const store = jest.requireMock('@/lib/ads/connections/store')

beforeEach(() => {
  states.clear()
  jest.clearAllMocks()
  process.env.NEXT_PUBLIC_APP_URL = 'https://partnersinbiz.online'
})

describe('GET /api/v1/ads/connections/[platform]/callback', () => {
  it('exchanges code, swaps for long-lived, lists ad accounts, creates connection, redirects', async () => {
    states.set('s_abc', {
      state: 's_abc',
      orgId: 'org_1',
      platform: 'meta',
      redirectUri: 'https://partnersinbiz.online/api/v1/ads/connections/meta/callback',
      expiresAt: { toMillis: () => Date.now() + 60_000 },
    })

    oauth.exchangeCode.mockResolvedValueOnce({
      accessToken: 'short',
      expiresInSeconds: 3600,
      userId: 'meta_user_123',
    })
    oauth.exchangeForLongLived.mockResolvedValueOnce({
      accessToken: 'long',
      expiresInSeconds: 5184000,
    })
    client.listAdAccounts.mockResolvedValueOnce([
      { id: 'act_42', name: 'X', currency: 'USD', timezone: 'UTC' },
    ])
    store.createConnection.mockResolvedValueOnce({ id: 'conn_new' })

    const url = new URL('https://x/api/v1/ads/connections/meta/callback')
    url.searchParams.set('code', 'AUTH')
    url.searchParams.set('state', 's_abc')

    const res = await GET(
      new Request(url.toString()) as any,
      { params: Promise.resolve({ platform: 'meta' }) } as any,
    )
    expect(res.status).toBe(302)
    const loc = res.headers.get('location') ?? ''
    expect(loc).toContain('status=connected')
    expect(loc).toContain('connectionId=conn_new')

    expect(store.createConnection).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: 'org_1',
        platform: 'meta',
        userId: 'meta_user_123',
        accessToken: 'long',
        expiresInSeconds: 5184000,
        adAccounts: [{ id: 'act_42', name: 'X', currency: 'USD', timezone: 'UTC' }],
      }),
    )
  })

  it('redirects with status=error when state is unknown', async () => {
    const url = new URL('https://x/api/v1/ads/connections/meta/callback')
    url.searchParams.set('code', 'AUTH')
    url.searchParams.set('state', 'unknown')
    const res = await GET(
      new Request(url.toString()) as any,
      { params: Promise.resolve({ platform: 'meta' }) } as any,
    )
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toContain('status=error')
  })
})
