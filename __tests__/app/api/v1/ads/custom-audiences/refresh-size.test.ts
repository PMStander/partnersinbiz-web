// __tests__/app/api/v1/ads/custom-audiences/refresh-size.test.ts
import { POST } from '@/app/api/v1/ads/custom-audiences/[id]/refresh-size/route'

jest.mock('@/lib/api/auth', () => ({ withAuth: (_r: string, h: any) => h }))
jest.mock('@/lib/ads/custom-audiences/store', () => ({
  getCustomAudience: jest.fn(),
  updateCustomAudience: jest.fn(),
}))
jest.mock('@/lib/ads/api-helpers', () => ({
  requireMetaContext: jest.fn(),
}))
jest.mock('@/lib/ads/providers/meta', () => ({
  metaProvider: {
    customAudienceCRUD: jest.fn(),
  },
}))

const store = jest.requireMock('@/lib/ads/custom-audiences/store')
const helpers = jest.requireMock('@/lib/ads/api-helpers')
const metaMock = jest.requireMock('@/lib/ads/providers/meta')

beforeEach(() => jest.clearAllMocks())

const baseCA = {
  id: 'ca_1',
  orgId: 'org_1',
  name: 'My Audience',
  type: 'CUSTOMER_LIST',
  status: 'BUILDING',
  platform: 'meta',
  providerData: { meta: { customAudienceId: 'meta_ca_1' } },
}

const baseCtx = {
  orgId: 'org_1',
  accessToken: 'tok',
  adAccountId: 'act_42',
}

function makeReq(orgId = 'org_1') {
  return new Request('http://x', { method: 'POST', headers: { 'X-Org-Id': orgId } }) as any
}

describe('POST /api/v1/ads/custom-audiences/[id]/refresh-size', () => {
  it('fetches size from Meta and updates Firestore, returns READY when size >= 1000', async () => {
    store.getCustomAudience.mockResolvedValueOnce(baseCA)
    helpers.requireMetaContext.mockResolvedValueOnce(baseCtx)
    metaMock.metaProvider.customAudienceCRUD.mockResolvedValueOnce({
      approximate_count_lower_bound: 5000,
    })
    store.updateCustomAudience.mockResolvedValueOnce(undefined)

    const res = await POST(makeReq(), {} as any, { params: Promise.resolve({ id: 'ca_1' }) })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data.approximateSize).toBe(5000)
    expect(body.data.status).toBe('READY')
    expect(store.updateCustomAudience).toHaveBeenCalledWith(
      'ca_1',
      expect.objectContaining({ approximateSize: 5000, status: 'READY' }),
    )
  })

  it('sets TOO_SMALL when size is between 1 and 999', async () => {
    store.getCustomAudience.mockResolvedValueOnce(baseCA)
    helpers.requireMetaContext.mockResolvedValueOnce(baseCtx)
    metaMock.metaProvider.customAudienceCRUD.mockResolvedValueOnce({
      approximate_count_lower_bound: 500,
    })
    store.updateCustomAudience.mockResolvedValueOnce(undefined)

    const res = await POST(makeReq(), {} as any, { params: Promise.resolve({ id: 'ca_1' }) })
    const body = await res.json()
    expect(body.data.status).toBe('TOO_SMALL')
  })

  it('returns 400 when audience has no metaCaId', async () => {
    store.getCustomAudience.mockResolvedValueOnce({ ...baseCA, providerData: { meta: {} } })
    const res = await POST(makeReq(), {} as any, { params: Promise.resolve({ id: 'ca_1' }) })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('not yet synced')
  })

  it('returns 404 when audience belongs to different org', async () => {
    store.getCustomAudience.mockResolvedValueOnce({ ...baseCA, orgId: 'org_other' })
    const res = await POST(makeReq('org_1'), {} as any, { params: Promise.resolve({ id: 'ca_1' }) })
    expect(res.status).toBe(404)
  })
})
