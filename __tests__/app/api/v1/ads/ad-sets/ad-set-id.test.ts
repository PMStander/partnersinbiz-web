// __tests__/app/api/v1/ads/ad-sets/ad-set-id.test.ts
import { GET, PATCH, DELETE } from '@/app/api/v1/ads/ad-sets/[id]/route'

jest.mock('@/lib/api/auth', () => ({ withAuth: (_r: string, h: any) => h }))
jest.mock('@/lib/ads/adsets/store', () => ({
  getAdSet: jest.fn(),
  updateAdSet: jest.fn(),
  deleteAdSet: jest.fn(),
}))
jest.mock('@/lib/ads/api-helpers', () => ({
  requireMetaContext: jest.fn(),
}))
jest.mock('@/lib/ads/providers/meta', () => ({
  metaProvider: { upsertAdSet: jest.fn() },
}))
jest.mock('@/lib/ads/providers/meta/adsets', () => ({
  deleteAdSet: jest.fn(),
}))

const store = jest.requireMock('@/lib/ads/adsets/store')
const helpers = jest.requireMock('@/lib/ads/api-helpers')
const metaProviderMock = jest.requireMock('@/lib/ads/providers/meta')
const metaAdSetsMock = jest.requireMock('@/lib/ads/providers/meta/adsets')

beforeEach(() => jest.clearAllMocks())

const baseAdSet = {
  id: 'ads_1',
  orgId: 'org_1',
  campaignId: 'cmp_1',
  name: 'Test AdSet',
  status: 'DRAFT',
  providerData: {},
}

const baseCtx = {
  orgId: 'org_1',
  accessToken: 'tok',
  adAccountId: 'act_42',
  connection: { id: 'conn_1' },
}

function makeReq(orgId = 'org_1', extra?: RequestInit) {
  return new Request('http://x', { headers: { 'X-Org-Id': orgId }, ...extra }) as any
}

describe('GET /api/v1/ads/ad-sets/[id]', () => {
  it('returns ad set for correct org', async () => {
    store.getAdSet.mockResolvedValueOnce(baseAdSet)
    const res = await GET(makeReq(), {} as any, { params: Promise.resolve({ id: 'ads_1' }) })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data.id).toBe('ads_1')
  })

  it('returns 404 when ad set belongs to different org (tenant isolation)', async () => {
    store.getAdSet.mockResolvedValueOnce({ ...baseAdSet, orgId: 'org_other' })
    const res = await GET(makeReq('org_1'), {} as any, { params: Promise.resolve({ id: 'ads_1' }) })
    expect(res.status).toBe(404)
  })

  it('returns 404 when ad set does not exist', async () => {
    store.getAdSet.mockResolvedValueOnce(null)
    const res = await GET(makeReq(), {} as any, { params: Promise.resolve({ id: 'ads_missing' }) })
    expect(res.status).toBe(404)
  })

  it('returns 400 when X-Org-Id missing', async () => {
    const res = await GET(
      new Request('http://x') as any,
      {} as any,
      { params: Promise.resolve({ id: 'ads_1' }) },
    )
    expect(res.status).toBe(400)
  })
})

describe('PATCH /api/v1/ads/ad-sets/[id]', () => {
  it('updates ad set locally and returns updated doc', async () => {
    const updated = { ...baseAdSet, name: 'Updated' }
    store.getAdSet
      .mockResolvedValueOnce(baseAdSet) // initial fetch
      .mockResolvedValueOnce(updated) // post-update fetch
    store.updateAdSet.mockResolvedValueOnce(undefined)

    const res = await PATCH(
      new Request('http://x', {
        method: 'PATCH',
        headers: { 'X-Org-Id': 'org_1', 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated' }),
      }) as any,
      {} as any,
      { params: Promise.resolve({ id: 'ads_1' }) },
    )
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data.name).toBe('Updated')
    expect(store.updateAdSet).toHaveBeenCalledWith('ads_1', { name: 'Updated' })
  })

  it('includes warnings when Meta sync fails for live ad set', async () => {
    const liveAdSet = {
      ...baseAdSet,
      providerData: { meta: { id: 'meta_ads_123' } },
    }
    store.getAdSet
      .mockResolvedValueOnce(liveAdSet)
      .mockResolvedValueOnce({ ...liveAdSet, name: 'Updated' })
    store.updateAdSet.mockResolvedValueOnce(undefined)
    helpers.requireMetaContext.mockResolvedValueOnce(baseCtx)
    metaProviderMock.metaProvider.upsertAdSet.mockRejectedValueOnce(
      new Error('Meta API error: rate limited'),
    )

    const res = await PATCH(
      new Request('http://x', {
        method: 'PATCH',
        headers: { 'X-Org-Id': 'org_1', 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated' }),
      }) as any,
      {} as any,
      { params: Promise.resolve({ id: 'ads_1' }) },
    )
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data.warnings).toHaveLength(1)
    expect(body.data.warnings[0]).toMatch(/Meta sync warning/)
  })

  it('returns 404 when ad set belongs to different org', async () => {
    store.getAdSet.mockResolvedValueOnce({ ...baseAdSet, orgId: 'org_other' })
    const res = await PATCH(
      new Request('http://x', {
        method: 'PATCH',
        headers: { 'X-Org-Id': 'org_1', 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'X' }),
      }) as any,
      {} as any,
      { params: Promise.resolve({ id: 'ads_1' }) },
    )
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/v1/ads/ad-sets/[id]', () => {
  it('deletes ad set locally and returns {deleted: true}', async () => {
    store.getAdSet.mockResolvedValueOnce(baseAdSet)
    store.deleteAdSet.mockResolvedValueOnce(undefined)
    const res = await DELETE(makeReq(), {} as any, { params: Promise.resolve({ id: 'ads_1' }) })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data.deleted).toBe(true)
    expect(store.deleteAdSet).toHaveBeenCalledWith('ads_1')
  })

  it('best-effort calls Meta delete when metaId is set', async () => {
    const adSetWithMeta = { ...baseAdSet, providerData: { meta: { id: 'meta_ads_123' } } }
    store.getAdSet.mockResolvedValueOnce(adSetWithMeta)
    store.deleteAdSet.mockResolvedValueOnce(undefined)
    helpers.requireMetaContext.mockResolvedValueOnce(baseCtx)
    metaAdSetsMock.deleteAdSet.mockResolvedValueOnce(undefined)

    const res = await DELETE(makeReq(), {} as any, { params: Promise.resolve({ id: 'ads_1' }) })
    expect(res.status).toBe(200)
    expect(metaAdSetsMock.deleteAdSet).toHaveBeenCalledWith(
      expect.objectContaining({ metaAdSetId: 'meta_ads_123' }),
    )
    expect(store.deleteAdSet).toHaveBeenCalledWith('ads_1')
  })

  it('still deletes locally even when Meta delete throws', async () => {
    const adSetWithMeta = { ...baseAdSet, providerData: { meta: { id: 'meta_ads_123' } } }
    store.getAdSet.mockResolvedValueOnce(adSetWithMeta)
    store.deleteAdSet.mockResolvedValueOnce(undefined)
    helpers.requireMetaContext.mockResolvedValueOnce(baseCtx)
    metaAdSetsMock.deleteAdSet.mockRejectedValueOnce(new Error('Meta down'))

    const res = await DELETE(makeReq(), {} as any, { params: Promise.resolve({ id: 'ads_1' }) })
    expect(res.status).toBe(200)
    expect(store.deleteAdSet).toHaveBeenCalledWith('ads_1')
  })

  it('returns 404 when ad set belongs to different org', async () => {
    store.getAdSet.mockResolvedValueOnce({ ...baseAdSet, orgId: 'org_other' })
    const res = await DELETE(makeReq('org_1'), {} as any, { params: Promise.resolve({ id: 'ads_1' }) })
    expect(res.status).toBe(404)
  })
})
