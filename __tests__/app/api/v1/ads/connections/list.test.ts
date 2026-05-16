// __tests__/app/api/v1/ads/connections/list.test.ts
import { GET } from '@/app/api/v1/ads/connections/route'

jest.mock('@/lib/api/auth', () => ({
  withAuth: (_role: string, handler: any) => handler,
}))
jest.mock('@/lib/ads/connections/store', () => ({
  listConnections: jest.fn(),
}))

const { listConnections } = jest.requireMock('@/lib/ads/connections/store')

function makeReq(orgId: string) {
  return new Request('http://x', { headers: { 'X-Org-Id': orgId } })
}

describe('GET /api/v1/ads/connections', () => {
  it('returns the connections for the X-Org-Id with tokens stripped', async () => {
    listConnections.mockResolvedValueOnce([
      {
        id: 'conn_1',
        orgId: 'org_1',
        platform: 'meta',
        status: 'active',
        userId: 'meta_user_123',
        scopes: ['ads_management'],
        adAccounts: [],
        accessTokenEnc: { ciphertext: 'a', iv: 'b', tag: 'c' },
      },
    ])
    const res = await GET(makeReq('org_1') as any, { role: 'admin' } as any, {} as any)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data).toHaveLength(1)
    expect(body.data[0].id).toBe('conn_1')
    expect(body.data[0].accessTokenEnc).toBeUndefined()
    expect(body.data[0].refreshTokenEnc).toBeUndefined()
  })

  it('returns 400 if X-Org-Id is missing', async () => {
    const res = await GET(
      new Request('http://x') as any,
      { role: 'admin' } as any,
      {} as any,
    )
    expect(res.status).toBe(400)
  })
})
