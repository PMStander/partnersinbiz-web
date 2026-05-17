// __tests__/api/v1/ads/google/customers.test.ts
//
// Covers `GET /api/v1/ads/google/customers?connectionId=...`. Verifies the
// cross-tenant guard (404 when the connectionId belongs to another org) and
// the happy path that calls `listAccessibleCustomers` with the decrypted
// access token + the platform-wide developer token.
import { GET } from '@/app/api/v1/ads/google/customers/route'

jest.mock('@/lib/api/auth', () => ({ withAuth: (_r: string, h: any) => h }))

const connections = new Map<string, any>()
jest.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: (_path: string) => ({
      doc: (id: string) => ({
        get: async () => ({
          exists: connections.has(id),
          data: () => connections.get(id),
        }),
      }),
    }),
  },
}))

jest.mock('@/lib/ads/connections/store', () => ({
  decryptAccessToken: jest.fn(),
}))

jest.mock('@/lib/ads/providers/google/customers', () => ({
  listAccessibleCustomers: jest.fn(),
}))

const { decryptAccessToken } = jest.requireMock(
  '@/lib/ads/connections/store',
)
const { listAccessibleCustomers } = jest.requireMock(
  '@/lib/ads/providers/google/customers',
)

beforeEach(() => {
  connections.clear()
  jest.clearAllMocks()
  process.env.GOOGLE_ADS_DEVELOPER_TOKEN = 'fake-dev-token'
})

function makeReq(orgId: string, connectionId?: string) {
  const url = new URL('http://x/api/v1/ads/google/customers')
  if (connectionId) url.searchParams.set('connectionId', connectionId)
  return new Request(url.toString(), {
    method: 'GET',
    headers: { 'X-Org-Id': orgId },
  })
}

describe('GET /api/v1/ads/google/customers', () => {
  it('returns the customers list when connection found + valid', async () => {
    connections.set('conn_g_1', {
      id: 'conn_g_1',
      orgId: 'org_1',
      platform: 'google',
      accessTokenEnc: {},
    })
    decryptAccessToken.mockReturnValueOnce('decrypted-access')
    listAccessibleCustomers.mockResolvedValueOnce([
      { customerId: '1234567890', resourceName: 'customers/1234567890' },
      { customerId: '9876543210', resourceName: 'customers/9876543210' },
    ])

    const res = await GET(
      makeReq('org_1', 'conn_g_1') as any,
      { role: 'admin' } as any,
    )
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.customers).toHaveLength(2)
    expect(body.data.customers[0].customerId).toBe('1234567890')

    expect(listAccessibleCustomers).toHaveBeenCalledWith({
      accessToken: 'decrypted-access',
      developerToken: 'fake-dev-token',
    })
  })

  it('returns 404 when connectionId belongs to a different org', async () => {
    connections.set('conn_other_org', {
      id: 'conn_other_org',
      orgId: 'org_2',
      platform: 'google',
      accessTokenEnc: {},
    })

    const res = await GET(
      makeReq('org_1', 'conn_other_org') as any,
      { role: 'admin' } as any,
    )
    expect(res.status).toBe(404)
    expect(listAccessibleCustomers).not.toHaveBeenCalled()
  })

  it('returns 404 when connectionId is meta (wrong platform)', async () => {
    connections.set('conn_meta_1', {
      id: 'conn_meta_1',
      orgId: 'org_1',
      platform: 'meta',
      accessTokenEnc: {},
    })

    const res = await GET(
      makeReq('org_1', 'conn_meta_1') as any,
      { role: 'admin' } as any,
    )
    expect(res.status).toBe(404)
    expect(listAccessibleCustomers).not.toHaveBeenCalled()
  })

  it('returns 400 when connectionId missing', async () => {
    const res = await GET(
      makeReq('org_1') as any,
      { role: 'admin' } as any,
    )
    expect(res.status).toBe(400)
  })

  it('returns 500 when GOOGLE_ADS_DEVELOPER_TOKEN env missing', async () => {
    delete process.env.GOOGLE_ADS_DEVELOPER_TOKEN
    connections.set('conn_g_1', {
      id: 'conn_g_1',
      orgId: 'org_1',
      platform: 'google',
      accessTokenEnc: {},
    })
    const res = await GET(
      makeReq('org_1', 'conn_g_1') as any,
      { role: 'admin' } as any,
    )
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toMatch(/GOOGLE_ADS_DEVELOPER_TOKEN/)
  })
})
