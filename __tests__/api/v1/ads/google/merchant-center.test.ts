// __tests__/api/v1/ads/google/merchant-center.test.ts
//
// Covers the 4 Merchant Center API endpoints:
//   POST /api/v1/ads/google/merchant-center/oauth/authorize
//   GET  /api/v1/ads/google/merchant-center/oauth/callback
//   GET  /api/v1/ads/google/merchant-center
//   GET/PATCH/DELETE /api/v1/ads/google/merchant-center/[id]
import { POST as AUTHORIZE_POST } from '@/app/api/v1/ads/google/merchant-center/oauth/authorize/route'
import { GET as CALLBACK_GET } from '@/app/api/v1/ads/google/merchant-center/oauth/callback/route'
import { GET as LIST_GET } from '@/app/api/v1/ads/google/merchant-center/route'
import {
  GET as BINDING_GET,
  PATCH as BINDING_PATCH,
  DELETE as BINDING_DELETE,
} from '@/app/api/v1/ads/google/merchant-center/[id]/route'

// ---------------------------------------------------------------------------
// Auth passthrough
// ---------------------------------------------------------------------------
jest.mock('@/lib/api/auth', () => ({ withAuth: (_r: string, h: any) => h }))

// ---------------------------------------------------------------------------
// Firestore in-memory mock
// ---------------------------------------------------------------------------
const states = new Map<string, any>()
const bindings = new Map<string, any>()

jest.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: (path: string) => ({
      doc: (id: string) => {
        const store = path.includes('oauth_states') ? states : bindings
        return {
          id,
          set: async (data: any) => store.set(id, data),
          get: async () => ({ exists: store.has(id), data: () => store.get(id) }),
          delete: async () => store.delete(id),
          update: async (patch: any) => {
            const cur = store.get(id) ?? {}
            store.set(id, { ...cur, ...patch })
          },
        }
      },
      where: () => ({
        orderBy: () => ({
          get: async () => ({
            docs: Array.from(bindings.values()).map((v) => ({ data: () => v })),
          }),
        }),
        get: async () => ({
          docs: Array.from(bindings.values()).map((v) => ({ data: () => v })),
        }),
      }),
    }),
  },
}))

jest.mock('firebase-admin/firestore', () => ({
  Timestamp: {
    now: () => ({ seconds: 1700000000, nanoseconds: 0 }),
    fromMillis: (ms: number) => ({ toMillis: () => ms }),
  },
  FieldValue: {
    serverTimestamp: () => ({ _methodName: 'serverTimestamp' }),
  },
}))

// ---------------------------------------------------------------------------
// Merchant Center provider mocks
// ---------------------------------------------------------------------------
jest.mock('@/lib/ads/providers/google/merchant-center', () => ({
  buildMcAuthorizeUrl: jest.fn(({ redirectUri, state }: any) =>
    `https://accounts.google.com/o/oauth2/v2/auth?redirect_uri=${redirectUri}&state=${state}&scope=https://www.googleapis.com/auth/content`,
  ),
  exchangeMcCode: jest.fn(),
  listMerchantAccounts: jest.fn(),
  listDatafeeds: jest.fn(),
  extractFeedLabels: jest.fn(),
}))

jest.mock('@/lib/ads/merchant-center/store', () => ({
  createMerchantCenter: jest.fn(),
  getMerchantCenter: jest.fn(),
  listMerchantCenters: jest.fn(),
  updateMerchantCenter: jest.fn(),
  deleteMerchantCenter: jest.fn(),
}))

// encryptToken is synchronous: encryptToken(plaintext, orgId) → EncryptedData
jest.mock('@/lib/social/encryption', () => ({
  encryptToken: jest.fn((plaintext: string, _orgId: string) => ({
    ciphertext: Buffer.from(plaintext).toString('base64'),
    iv: 'aXY=',
    tag: 'dGFn',
  })),
}))

// ---------------------------------------------------------------------------
// Import mocked modules for assertions
// ---------------------------------------------------------------------------
const { buildMcAuthorizeUrl, exchangeMcCode, listMerchantAccounts, listDatafeeds, extractFeedLabels } =
  jest.requireMock('@/lib/ads/providers/google/merchant-center')
const { createMerchantCenter, getMerchantCenter, listMerchantCenters, updateMerchantCenter, deleteMerchantCenter } =
  jest.requireMock('@/lib/ads/merchant-center/store')

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
beforeEach(() => {
  states.clear()
  bindings.clear()
  jest.clearAllMocks()
  process.env.NEXT_PUBLIC_APP_URL = 'https://partnersinbiz.online'
  process.env.GOOGLE_OAUTH_CLIENT_ID = 'test-client-id'
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-client-secret'
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeReq(
  url: string,
  method: string,
  headers: Record<string, string> = {},
  body?: unknown,
) {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  })
}

// ---------------------------------------------------------------------------
// POST /authorize
// ---------------------------------------------------------------------------
describe('POST /api/v1/ads/google/merchant-center/oauth/authorize', () => {
  it('returns authorizeUrl containing Google OAuth endpoint', async () => {
    const res = await AUTHORIZE_POST(
      makeReq('http://x', 'POST', { 'X-Org-Id': 'org_1', 'X-Org-Slug': 'acme' }) as any,
    )
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.authorizeUrl).toContain('accounts.google.com/o/oauth2/v2/auth')
    expect(body.data.state).toBeTruthy()
    expect(buildMcAuthorizeUrl).toHaveBeenCalledWith(
      expect.objectContaining({ redirectUri: expect.stringContaining('merchant-center/oauth/callback') }),
    )
  })

  it('persists state doc with platform: google_merchant_center', async () => {
    await AUTHORIZE_POST(
      makeReq('http://x', 'POST', { 'X-Org-Id': 'org_1', 'X-Org-Slug': 'acme' }) as any,
    )
    const stateEntry = Array.from(states.values())[0]
    expect(stateEntry.platform).toBe('google_merchant_center')
    expect(stateEntry.orgId).toBe('org_1')
    expect(stateEntry.orgSlug).toBe('acme')
  })

  it('returns 400 when X-Org-Id is missing', async () => {
    const res = await AUTHORIZE_POST(makeReq('http://x', 'POST') as any)
    expect(res.status).toBe(400)
  })
})

// ---------------------------------------------------------------------------
// GET /callback
// ---------------------------------------------------------------------------
describe('GET /api/v1/ads/google/merchant-center/oauth/callback', () => {
  function seedState(key: string, overrides: Record<string, unknown> = {}) {
    states.set(key, {
      state: key,
      orgId: 'org_1',
      orgSlug: 'acme',
      platform: 'google_merchant_center',
      redirectUri: 'https://partnersinbiz.online/api/v1/ads/google/merchant-center/oauth/callback',
      expiresAt: { toMillis: () => Date.now() + 60_000 },
      ...overrides,
    })
  }

  it('redirects to merchant-center page with status=connected on success', async () => {
    seedState('st_1')
    exchangeMcCode.mockResolvedValueOnce({ accessToken: 'at', refreshToken: 'rt', expiresInSeconds: 3600 })
    listMerchantAccounts.mockResolvedValueOnce([{ merchantId: 'mc_123' }])
    listDatafeeds.mockResolvedValueOnce([{ id: 'df_1', feedLabel: 'US' }])
    extractFeedLabels.mockReturnValueOnce(['US'])
    createMerchantCenter.mockResolvedValueOnce({ id: 'mc_binding_1' })

    const url = new URL('https://x/api/v1/ads/google/merchant-center/oauth/callback')
    url.searchParams.set('code', 'AUTH_CODE')
    url.searchParams.set('state', 'st_1')
    const res = await CALLBACK_GET(new Request(url.toString()) as any)

    expect(res.status).toBe(302)
    const loc = res.headers.get('location') ?? ''
    expect(loc).toContain('/admin/org/acme/ads/merchant-center')
    expect(loc).toContain('status=connected')

    expect(createMerchantCenter).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: 'org_1',
        merchantId: 'mc_123',
        feedLabels: ['US'],
      }),
    )
  })

  it('redirects with status=error when state is unknown', async () => {
    const url = new URL('https://x/api/v1/ads/google/merchant-center/oauth/callback')
    url.searchParams.set('code', 'AUTH_CODE')
    url.searchParams.set('state', 'unknown_state')
    const res = await CALLBACK_GET(new Request(url.toString()) as any)
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toContain('invalid_state')
  })

  it('redirects with error when platform mismatch', async () => {
    seedState('st_2', { platform: 'google' })
    const url = new URL('https://x/api/v1/ads/google/merchant-center/oauth/callback')
    url.searchParams.set('code', 'AUTH_CODE')
    url.searchParams.set('state', 'st_2')
    const res = await CALLBACK_GET(new Request(url.toString()) as any)
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toContain('expired_or_mismatched_state')
  })

  it('redirects with no_merchant_accounts when listMerchantAccounts returns empty', async () => {
    seedState('st_3')
    exchangeMcCode.mockResolvedValueOnce({ accessToken: 'at', refreshToken: 'rt', expiresInSeconds: 3600 })
    listMerchantAccounts.mockResolvedValueOnce([])

    const url = new URL('https://x/api/v1/ads/google/merchant-center/oauth/callback')
    url.searchParams.set('code', 'AUTH_CODE')
    url.searchParams.set('state', 'st_3')
    const res = await CALLBACK_GET(new Request(url.toString()) as any)
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toContain('no_merchant_accounts')
  })
})

// ---------------------------------------------------------------------------
// GET /merchant-center (list)
// ---------------------------------------------------------------------------
describe('GET /api/v1/ads/google/merchant-center', () => {
  it('returns bindings list without token refs', async () => {
    listMerchantCenters.mockResolvedValueOnce([
      { id: 'mc_1', orgId: 'org_1', merchantId: '111', accessTokenRef: 'secret_a', refreshTokenRef: 'secret_r', feedLabels: [], createdAt: {}, updatedAt: {} },
    ])
    const res = await LIST_GET(
      makeReq('http://x/api/v1/ads/google/merchant-center', 'GET', { 'X-Org-Id': 'org_1' }) as any,
    )
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.bindings).toHaveLength(1)
    expect(body.data.bindings[0].accessTokenRef).toBeUndefined()
    expect(body.data.bindings[0].refreshTokenRef).toBeUndefined()
    expect(body.data.bindings[0].merchantId).toBe('111')
  })

  it('returns 400 without X-Org-Id', async () => {
    const res = await LIST_GET(makeReq('http://x', 'GET') as any)
    expect(res.status).toBe(400)
  })
})

// ---------------------------------------------------------------------------
// PATCH + DELETE /merchant-center/[id]
// ---------------------------------------------------------------------------
describe('PATCH /api/v1/ads/google/merchant-center/[id]', () => {
  const makeCtx = (id: string) => ({ params: Promise.resolve({ id }) })

  it('updates primaryFeedId and returns safe binding', async () => {
    getMerchantCenter.mockResolvedValueOnce({
      id: 'mc_1', orgId: 'org_1', merchantId: '111', accessTokenRef: 's', refreshTokenRef: 's', feedLabels: ['US'], createdAt: {}, updatedAt: {},
    })
    updateMerchantCenter.mockResolvedValueOnce({
      id: 'mc_1', orgId: 'org_1', merchantId: '111', primaryFeedId: 'US', accessTokenRef: 's', refreshTokenRef: 's', feedLabels: ['US'], createdAt: {}, updatedAt: {},
    })

    const res = await BINDING_PATCH(
      makeReq('http://x', 'PATCH', { 'X-Org-Id': 'org_1' }, { primaryFeedId: 'US' }) as any,
      undefined,
      makeCtx('mc_1'),
    )
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.binding.primaryFeedId).toBe('US')
    expect(body.data.binding.accessTokenRef).toBeUndefined()
  })

  it('returns 404 when binding belongs to another org', async () => {
    getMerchantCenter.mockResolvedValueOnce({
      id: 'mc_1', orgId: 'org_other', merchantId: '111', accessTokenRef: 's', refreshTokenRef: 's', feedLabels: [], createdAt: {}, updatedAt: {},
    })
    const res = await BINDING_PATCH(
      makeReq('http://x', 'PATCH', { 'X-Org-Id': 'org_1' }, { primaryFeedId: 'US' }) as any,
      undefined,
      makeCtx('mc_1'),
    )
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/v1/ads/google/merchant-center/[id]', () => {
  const makeCtx = (id: string) => ({ params: Promise.resolve({ id }) })

  it('deletes the binding and returns the id', async () => {
    getMerchantCenter.mockResolvedValueOnce({
      id: 'mc_1', orgId: 'org_1', merchantId: '111', accessTokenRef: 's', refreshTokenRef: 's', feedLabels: [], createdAt: {}, updatedAt: {},
    })
    deleteMerchantCenter.mockResolvedValueOnce(undefined)

    const res = await BINDING_DELETE(
      makeReq('http://x', 'DELETE', { 'X-Org-Id': 'org_1' }) as any,
      undefined,
      makeCtx('mc_1'),
    )
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.id).toBe('mc_1')
    expect(deleteMerchantCenter).toHaveBeenCalledWith('mc_1')
  })

  it('returns 404 when binding not found', async () => {
    getMerchantCenter.mockResolvedValueOnce(null)
    const res = await BINDING_DELETE(
      makeReq('http://x', 'DELETE', { 'X-Org-Id': 'org_1' }) as any,
      undefined,
      makeCtx('mc_does_not_exist'),
    )
    expect(res.status).toBe(404)
  })
})
