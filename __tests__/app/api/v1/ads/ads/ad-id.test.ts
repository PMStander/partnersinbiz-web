// __tests__/app/api/v1/ads/ads/ad-id.test.ts
import { GET, PATCH, DELETE } from '@/app/api/v1/ads/ads/[id]/route'

jest.mock('@/lib/api/auth', () => ({ withAuth: (_r: string, h: any) => h }))
jest.mock('@/lib/ads/ads/store', () => ({
  getAd: jest.fn(),
  updateAd: jest.fn(),
  deleteAd: jest.fn(),
}))
jest.mock('@/lib/ads/api-helpers', () => ({
  requireMetaContext: jest.fn(),
}))
jest.mock('@/lib/ads/providers/meta', () => ({
  metaProvider: { upsertAd: jest.fn() },
}))
jest.mock('@/lib/ads/providers/meta/ads', () => ({
  deleteAd: jest.fn(),
}))

const store = jest.requireMock('@/lib/ads/ads/store')
const helpers = jest.requireMock('@/lib/ads/api-helpers')
const metaProviderMock = jest.requireMock('@/lib/ads/providers/meta')
const metaAdsMock = jest.requireMock('@/lib/ads/providers/meta/ads')

beforeEach(() => jest.clearAllMocks())

const baseAd = {
  id: 'ad_1',
  orgId: 'org_1',
  adSetId: 'ads_1',
  campaignId: 'cmp_1',
  name: 'Test Ad',
  status: 'DRAFT',
  format: 'SINGLE_IMAGE',
  creativeIds: [],
  copy: { primaryText: 'Hello', headline: 'World' },
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

describe('GET /api/v1/ads/ads/[id]', () => {
  it('returns ad for correct org', async () => {
    store.getAd.mockResolvedValueOnce(baseAd)
    const res = await GET(makeReq(), {} as any, { params: Promise.resolve({ id: 'ad_1' }) })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data.id).toBe('ad_1')
  })

  it('returns 404 when ad belongs to different org (tenant isolation)', async () => {
    store.getAd.mockResolvedValueOnce({ ...baseAd, orgId: 'org_other' })
    const res = await GET(makeReq('org_1'), {} as any, { params: Promise.resolve({ id: 'ad_1' }) })
    expect(res.status).toBe(404)
  })

  it('returns 404 when ad does not exist', async () => {
    store.getAd.mockResolvedValueOnce(null)
    const res = await GET(makeReq(), {} as any, { params: Promise.resolve({ id: 'ad_missing' }) })
    expect(res.status).toBe(404)
  })

  it('returns 400 when X-Org-Id missing', async () => {
    const res = await GET(
      new Request('http://x') as any,
      {} as any,
      { params: Promise.resolve({ id: 'ad_1' }) },
    )
    expect(res.status).toBe(400)
  })
})

describe('PATCH /api/v1/ads/ads/[id]', () => {
  it('updates ad locally (name/status only) and returns updated doc', async () => {
    const updated = { ...baseAd, name: 'Updated' }
    store.getAd
      .mockResolvedValueOnce(baseAd) // initial fetch
      .mockResolvedValueOnce(updated) // post-update fetch
    store.updateAd.mockResolvedValueOnce(undefined)

    const res = await PATCH(
      new Request('http://x', {
        method: 'PATCH',
        headers: { 'X-Org-Id': 'org_1', 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated' }),
      }) as any,
      {} as any,
      { params: Promise.resolve({ id: 'ad_1' }) },
    )
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data.name).toBe('Updated')
    expect(store.updateAd).toHaveBeenCalledWith('ad_1', { name: 'Updated' })
  })

  it('includes warnings when Meta sync fails for live ad', async () => {
    const liveAd = {
      ...baseAd,
      providerData: { meta: { id: 'meta_ad_123' } },
    }
    store.getAd
      .mockResolvedValueOnce(liveAd)
      .mockResolvedValueOnce({ ...liveAd, name: 'Updated' })
    store.updateAd.mockResolvedValueOnce(undefined)
    helpers.requireMetaContext.mockResolvedValueOnce(baseCtx)
    metaProviderMock.metaProvider.upsertAd.mockRejectedValueOnce(
      new Error('Meta API error: rate limited'),
    )

    const res = await PATCH(
      new Request('http://x', {
        method: 'PATCH',
        headers: { 'X-Org-Id': 'org_1', 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated' }),
      }) as any,
      {} as any,
      { params: Promise.resolve({ id: 'ad_1' }) },
    )
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data.warnings).toHaveLength(1)
    expect(body.data.warnings[0]).toMatch(/Meta sync warning/)
  })

  it('returns 404 when ad belongs to different org', async () => {
    store.getAd.mockResolvedValueOnce({ ...baseAd, orgId: 'org_other' })
    const res = await PATCH(
      new Request('http://x', {
        method: 'PATCH',
        headers: { 'X-Org-Id': 'org_1', 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'X' }),
      }) as any,
      {} as any,
      { params: Promise.resolve({ id: 'ad_1' }) },
    )
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/v1/ads/ads/[id]', () => {
  it('deletes ad locally and returns {deleted: true}', async () => {
    store.getAd.mockResolvedValueOnce(baseAd)
    store.deleteAd.mockResolvedValueOnce(undefined)
    const res = await DELETE(makeReq(), {} as any, { params: Promise.resolve({ id: 'ad_1' }) })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data.deleted).toBe(true)
    expect(store.deleteAd).toHaveBeenCalledWith('ad_1')
  })

  it('best-effort calls Meta delete when metaId is set', async () => {
    const adWithMeta = { ...baseAd, providerData: { meta: { id: 'meta_ad_123' } } }
    store.getAd.mockResolvedValueOnce(adWithMeta)
    store.deleteAd.mockResolvedValueOnce(undefined)
    helpers.requireMetaContext.mockResolvedValueOnce(baseCtx)
    metaAdsMock.deleteAd.mockResolvedValueOnce(undefined)

    const res = await DELETE(makeReq(), {} as any, { params: Promise.resolve({ id: 'ad_1' }) })
    expect(res.status).toBe(200)
    expect(metaAdsMock.deleteAd).toHaveBeenCalledWith(
      expect.objectContaining({ metaAdId: 'meta_ad_123' }),
    )
    expect(store.deleteAd).toHaveBeenCalledWith('ad_1')
  })

  it('still deletes locally even when Meta delete throws', async () => {
    const adWithMeta = { ...baseAd, providerData: { meta: { id: 'meta_ad_123' } } }
    store.getAd.mockResolvedValueOnce(adWithMeta)
    store.deleteAd.mockResolvedValueOnce(undefined)
    helpers.requireMetaContext.mockResolvedValueOnce(baseCtx)
    metaAdsMock.deleteAd.mockRejectedValueOnce(new Error('Meta down'))

    const res = await DELETE(makeReq(), {} as any, { params: Promise.resolve({ id: 'ad_1' }) })
    expect(res.status).toBe(200)
    expect(store.deleteAd).toHaveBeenCalledWith('ad_1')
  })

  it('returns 404 when ad belongs to different org', async () => {
    store.getAd.mockResolvedValueOnce({ ...baseAd, orgId: 'org_other' })
    const res = await DELETE(makeReq('org_1'), {} as any, { params: Promise.resolve({ id: 'ad_1' }) })
    expect(res.status).toBe(404)
  })
})
