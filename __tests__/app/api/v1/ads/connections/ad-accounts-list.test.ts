// __tests__/app/api/v1/ads/connections/ad-accounts-list.test.ts
import { GET } from '@/app/api/v1/ads/connections/[platform]/ad-accounts/route'

jest.mock('@/lib/api/auth', () => ({ withAuth: (_r: string, h: any) => h }))
jest.mock('@/lib/ads/connections/store', () => ({
  getConnection: jest.fn(),
  decryptAccessToken: jest.fn(),
  updateConnection: jest.fn(),
}))
jest.mock('@/lib/ads/providers/meta/client', () => ({
  listAdAccounts: jest.fn(),
}))

const store = jest.requireMock('@/lib/ads/connections/store')
const client = jest.requireMock('@/lib/ads/providers/meta/client')

beforeEach(() => jest.clearAllMocks())

describe('GET /api/v1/ads/connections/[platform]/ad-accounts', () => {
  it('returns cached adAccounts when ?refresh is not set', async () => {
    store.getConnection.mockResolvedValueOnce({
      id: 'c1',
      adAccounts: [{ id: 'act_42', name: 'X', currency: 'USD', timezone: 'UTC' }],
    })
    const res = await GET(
      new Request('http://x/ad-accounts', { headers: { 'X-Org-Id': 'org_1' } }) as any,
      { role: 'admin' } as any,
      { params: Promise.resolve({ platform: 'meta' }) } as any,
    )
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data).toHaveLength(1)
    expect(client.listAdAccounts).not.toHaveBeenCalled()
  })

  it('fetches fresh + persists when ?refresh=1', async () => {
    store.getConnection.mockResolvedValueOnce({ id: 'c1', orgId: 'org_1', accessTokenEnc: {} })
    store.decryptAccessToken.mockReturnValueOnce('long')
    client.listAdAccounts.mockResolvedValueOnce([
      { id: 'act_99', name: 'Y', currency: 'EUR', timezone: 'UTC' },
    ])

    const res = await GET(
      new Request('http://x/ad-accounts?refresh=1', { headers: { 'X-Org-Id': 'org_1' } }) as any,
      { role: 'admin' } as any,
      { params: Promise.resolve({ platform: 'meta' }) } as any,
    )
    const body = await res.json()
    expect(client.listAdAccounts).toHaveBeenCalledWith({ accessToken: 'long' })
    expect(store.updateConnection).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({
        adAccounts: [{ id: 'act_99', name: 'Y', currency: 'EUR', timezone: 'UTC' }],
      }),
    )
    expect(body.data[0].id).toBe('act_99')
  })
})
