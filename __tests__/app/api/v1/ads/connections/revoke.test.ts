// __tests__/app/api/v1/ads/connections/revoke.test.ts
import { DELETE } from '@/app/api/v1/ads/connections/[platform]/route'

jest.mock('@/lib/api/auth', () => ({ withAuth: (_r: string, h: any) => h }))
jest.mock('@/lib/ads/connections/store', () => ({
  getConnection: jest.fn(),
  deleteConnection: jest.fn(),
  decryptAccessToken: jest.fn(),
}))

const store = jest.requireMock('@/lib/ads/connections/store')

beforeEach(() => {
  jest.clearAllMocks()
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as any
})

describe('DELETE /api/v1/ads/connections/[platform]', () => {
  it('best-effort revokes Meta permissions then deletes the local doc', async () => {
    store.getConnection.mockResolvedValueOnce({ id: 'conn_1', orgId: 'org_1', platform: 'meta' })
    store.decryptAccessToken.mockReturnValueOnce('EAAO_long')

    const res = await DELETE(
      new Request('http://x', { method: 'DELETE', headers: { 'X-Org-Id': 'org_1' } }) as any,
      { role: 'admin' } as any,
      { params: Promise.resolve({ platform: 'meta' }) } as any,
    )
    expect(res.status).toBe(200)
    expect(store.deleteConnection).toHaveBeenCalledWith('conn_1')

    const fetchUrl = (global.fetch as jest.Mock).mock.calls[0]?.[0] ?? ''
    expect(fetchUrl).toContain('https://graph.facebook.com/v25.0/me/permissions')
  })

  it('still succeeds if Meta revoke call fails (best-effort)', async () => {
    store.getConnection.mockResolvedValueOnce({ id: 'conn_1', orgId: 'org_1', platform: 'meta' })
    store.decryptAccessToken.mockReturnValueOnce('EAAO_long')
    ;(global.fetch as jest.Mock).mockRejectedValueOnce(new Error('network'))

    const res = await DELETE(
      new Request('http://x', { method: 'DELETE', headers: { 'X-Org-Id': 'org_1' } }) as any,
      { role: 'admin' } as any,
      { params: Promise.resolve({ platform: 'meta' }) } as any,
    )
    expect(res.status).toBe(200)
    expect(store.deleteConnection).toHaveBeenCalled()
  })

  it('returns 404 when no connection exists', async () => {
    store.getConnection.mockResolvedValueOnce(null)
    const res = await DELETE(
      new Request('http://x', { method: 'DELETE', headers: { 'X-Org-Id': 'org_1' } }) as any,
      { role: 'admin' } as any,
      { params: Promise.resolve({ platform: 'meta' }) } as any,
    )
    expect(res.status).toBe(404)
  })
})
