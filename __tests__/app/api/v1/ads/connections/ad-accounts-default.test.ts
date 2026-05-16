// __tests__/app/api/v1/ads/connections/ad-accounts-default.test.ts
import { PATCH } from '@/app/api/v1/ads/connections/[platform]/ad-accounts/[id]/route'

jest.mock('@/lib/api/auth', () => ({ withAuth: (_r: string, h: any) => h }))
jest.mock('@/lib/ads/connections/store', () => ({
  getConnection: jest.fn(),
  updateConnection: jest.fn(),
}))
const store = jest.requireMock('@/lib/ads/connections/store')

beforeEach(() => jest.clearAllMocks())

describe('PATCH /api/v1/ads/connections/[platform]/ad-accounts/[id]', () => {
  it('sets defaultAdAccountId when id matches one of the connection adAccounts', async () => {
    store.getConnection.mockResolvedValueOnce({
      id: 'c1',
      adAccounts: [{ id: 'act_42', name: 'X', currency: 'USD', timezone: 'UTC' }],
    })
    const res = await PATCH(
      new Request('http://x', { method: 'PATCH', headers: { 'X-Org-Id': 'org_1' } }) as any,
      { role: 'admin' } as any,
      { params: Promise.resolve({ platform: 'meta', id: 'act_42' }) } as any,
    )
    expect(res.status).toBe(200)
    expect(store.updateConnection).toHaveBeenCalledWith('c1', { defaultAdAccountId: 'act_42' })
  })

  it('400 when ad account ID is not in the connection', async () => {
    store.getConnection.mockResolvedValueOnce({
      id: 'c1',
      adAccounts: [{ id: 'act_42', name: 'X', currency: 'USD', timezone: 'UTC' }],
    })
    const res = await PATCH(
      new Request('http://x', { method: 'PATCH', headers: { 'X-Org-Id': 'org_1' } }) as any,
      { role: 'admin' } as any,
      { params: Promise.resolve({ platform: 'meta', id: 'act_99' }) } as any,
    )
    expect(res.status).toBe(400)
  })
})
