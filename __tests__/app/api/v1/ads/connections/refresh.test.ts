// __tests__/app/api/v1/ads/connections/refresh.test.ts
import { POST } from '@/app/api/v1/ads/connections/[platform]/refresh/route'

jest.mock('@/lib/api/auth', () => ({ withAuth: (_r: string, h: any) => h }))
jest.mock('@/lib/ads/connections/store', () => ({
  getConnection: jest.fn(),
  decryptAccessToken: jest.fn(),
  updateConnection: jest.fn(),
}))
jest.mock('@/lib/ads/providers/meta/oauth', () => ({
  exchangeForLongLived: jest.fn(),
}))
jest.mock('@/lib/social/encryption', () => ({
  encryptToken: jest.fn().mockReturnValue({ ciphertext: 'c', iv: 'i', tag: 't' }),
  decryptToken: jest.fn().mockReturnValue('decrypted'),
}))
jest.mock('firebase-admin/firestore', () => ({
  Timestamp: {
    fromMillis: jest.fn().mockReturnValue({ toMillis: () => Date.now() + 5184000 * 1000 }),
    now: jest.fn().mockReturnValue({ toMillis: () => Date.now() }),
  },
}))

const store = jest.requireMock('@/lib/ads/connections/store')
const oauth = jest.requireMock('@/lib/ads/providers/meta/oauth')

beforeEach(() => jest.clearAllMocks())

describe('POST /api/v1/ads/connections/[platform]/refresh', () => {
  it('re-swaps the current token for a fresh long-lived and updates expiresAt', async () => {
    store.getConnection.mockResolvedValueOnce({
      id: 'conn_1',
      orgId: 'org_1',
      platform: 'meta',
      accessTokenEnc: {},
    })
    store.decryptAccessToken.mockReturnValueOnce('EAAO_long_old')
    oauth.exchangeForLongLived.mockResolvedValueOnce({
      accessToken: 'EAAO_long_new',
      expiresInSeconds: 5184000,
    })

    const res = await POST(
      new Request('http://x', { method: 'POST', headers: { 'X-Org-Id': 'org_1' } }) as any,
      { role: 'admin' } as any,
      { params: Promise.resolve({ platform: 'meta' }) } as any,
    )
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(oauth.exchangeForLongLived).toHaveBeenCalledWith({ accessToken: 'EAAO_long_old' })
    expect(store.updateConnection).toHaveBeenCalled()
  })

  it('returns 404 when no connection exists', async () => {
    store.getConnection.mockResolvedValueOnce(null)
    const res = await POST(
      new Request('http://x', { method: 'POST', headers: { 'X-Org-Id': 'org_1' } }) as any,
      { role: 'admin' } as any,
      { params: Promise.resolve({ platform: 'meta' }) } as any,
    )
    expect(res.status).toBe(404)
  })
})
