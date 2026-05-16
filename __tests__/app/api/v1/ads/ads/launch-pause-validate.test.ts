// __tests__/app/api/v1/ads/ads/launch-pause-validate.test.ts
import { POST as launchPOST } from '@/app/api/v1/ads/ads/[id]/launch/route'
import { POST as pausePOST } from '@/app/api/v1/ads/ads/[id]/pause/route'
import { POST as validatePOST } from '@/app/api/v1/ads/ads/[id]/validate/route'

jest.mock('@/lib/api/auth', () => ({ withAuth: (_r: string, h: any) => h }))
jest.mock('@/lib/ads/ads/store', () => ({
  getAd: jest.fn(),
  updateAd: jest.fn(),
  setAdMetaIds: jest.fn(),
}))
jest.mock('@/lib/ads/adsets/store', () => ({
  getAdSet: jest.fn(),
}))
jest.mock('@/lib/ads/api-helpers', () => ({
  requireMetaContext: jest.fn(),
}))
jest.mock('@/lib/ads/providers/meta', () => ({
  metaProvider: { upsertAd: jest.fn() },
}))
jest.mock('@/lib/ads/providers/meta/ads', () => ({
  validateAd: jest.fn(),
}))

const store = jest.requireMock('@/lib/ads/ads/store')
const adSetsStore = jest.requireMock('@/lib/ads/adsets/store')
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

const baseAdSet = {
  id: 'ads_1',
  orgId: 'org_1',
  campaignId: 'cmp_1',
  name: 'AdSet',
  status: 'ACTIVE',
  providerData: { meta: { id: 'meta_ads_123' } },
}

const baseCtx = {
  orgId: 'org_1',
  accessToken: 'tok',
  adAccountId: 'act_42',
  connection: { id: 'conn_1' },
}

function makeReq(orgId = 'org_1', pageId = 'page_456') {
  return new Request('http://x', {
    method: 'POST',
    headers: { 'X-Org-Id': orgId, 'X-Page-Id': pageId },
  }) as any
}

// ── Launch ────────────────────────────────────────────────────────────────────

describe('POST /api/v1/ads/ads/[id]/launch', () => {
  it('creates ad in Meta and persists metaAdId + metaCreativeId when created=true', async () => {
    const afterUpdate = { ...baseAd, status: 'ACTIVE' }
    store.getAd
      .mockResolvedValueOnce(baseAd)
      .mockResolvedValueOnce(afterUpdate)
    store.updateAd.mockResolvedValueOnce(undefined)
    store.setAdMetaIds.mockResolvedValueOnce(undefined)
    helpers.requireMetaContext.mockResolvedValueOnce(baseCtx)
    adSetsStore.getAdSet.mockResolvedValueOnce(baseAdSet)
    metaProviderMock.metaProvider.upsertAd.mockResolvedValueOnce({
      metaAdId: 'meta_ad_new',
      metaCreativeId: 'meta_cr_new',
      created: true,
    })

    const res = await launchPOST(makeReq(), {} as any, {
      params: Promise.resolve({ id: 'ad_1' }),
    })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data.status).toBe('ACTIVE')
    expect(store.setAdMetaIds).toHaveBeenCalledWith('ad_1', {
      metaAdId: 'meta_ad_new',
      metaCreativeId: 'meta_cr_new',
    })
    expect(store.updateAd).toHaveBeenCalledWith('ad_1', { status: 'ACTIVE' })
    expect(metaProviderMock.metaProvider.upsertAd).toHaveBeenCalledWith(
      expect.objectContaining({ pageId: 'page_456' }),
    )
  })

  it('does not call setAdMetaIds when Meta returns created=false (already exists)', async () => {
    const adWithMeta = { ...baseAd, providerData: { meta: { id: 'meta_ad_123' } } }
    store.getAd
      .mockResolvedValueOnce(adWithMeta)
      .mockResolvedValueOnce({ ...adWithMeta, status: 'ACTIVE' })
    store.updateAd.mockResolvedValueOnce(undefined)
    helpers.requireMetaContext.mockResolvedValueOnce(baseCtx)
    adSetsStore.getAdSet.mockResolvedValueOnce(baseAdSet)
    metaProviderMock.metaProvider.upsertAd.mockResolvedValueOnce({
      metaAdId: 'meta_ad_123',
      created: false,
    })

    await launchPOST(makeReq(), {} as any, { params: Promise.resolve({ id: 'ad_1' }) })
    expect(store.setAdMetaIds).not.toHaveBeenCalled()
  })

  it('returns 400 when X-Page-Id header is missing', async () => {
    store.getAd.mockResolvedValueOnce(baseAd)
    helpers.requireMetaContext.mockResolvedValueOnce(baseCtx)

    const res = await launchPOST(
      new Request('http://x', {
        method: 'POST',
        headers: { 'X-Org-Id': 'org_1' }, // no X-Page-Id
      }) as any,
      {} as any,
      { params: Promise.resolve({ id: 'ad_1' }) },
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/page/i)
  })

  it('returns 400 when parent ad set is not yet on Meta', async () => {
    store.getAd.mockResolvedValueOnce(baseAd)
    helpers.requireMetaContext.mockResolvedValueOnce(baseCtx)
    adSetsStore.getAdSet.mockResolvedValueOnce({
      ...baseAdSet,
      providerData: {}, // no meta.id
    })

    const res = await launchPOST(makeReq(), {} as any, {
      params: Promise.resolve({ id: 'ad_1' }),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/ad set/i)
  })

  it('returns 400 when parent ad set does not exist', async () => {
    store.getAd.mockResolvedValueOnce(baseAd)
    helpers.requireMetaContext.mockResolvedValueOnce(baseCtx)
    adSetsStore.getAdSet.mockResolvedValueOnce(null)

    const res = await launchPOST(makeReq(), {} as any, {
      params: Promise.resolve({ id: 'ad_1' }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 404 when ad belongs to different org', async () => {
    store.getAd.mockResolvedValueOnce({ ...baseAd, orgId: 'org_other' })
    const res = await launchPOST(makeReq('org_1'), {} as any, {
      params: Promise.resolve({ id: 'ad_1' }),
    })
    expect(res.status).toBe(404)
  })
})

// ── Pause ─────────────────────────────────────────────────────────────────────

describe('POST /api/v1/ads/ads/[id]/pause', () => {
  it('updates status to PAUSED locally', async () => {
    const afterPause = { ...baseAd, status: 'PAUSED' }
    store.getAd
      .mockResolvedValueOnce(baseAd)
      .mockResolvedValueOnce(afterPause)
    store.updateAd.mockResolvedValueOnce(undefined)

    const res = await pausePOST(makeReq(), {} as any, {
      params: Promise.resolve({ id: 'ad_1' }),
    })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data.status).toBe('PAUSED')
    expect(store.updateAd).toHaveBeenCalledWith('ad_1', { status: 'PAUSED' })
  })

  it('best-effort syncs to Meta when metaId is set; does not fail on Meta error', async () => {
    const adWithMeta = {
      ...baseAd,
      status: 'ACTIVE',
      providerData: { meta: { id: 'meta_ad_123' } },
    }
    store.getAd
      .mockResolvedValueOnce(adWithMeta)
      .mockResolvedValueOnce({ ...adWithMeta, status: 'PAUSED' })
    store.updateAd.mockResolvedValueOnce(undefined)
    helpers.requireMetaContext.mockResolvedValueOnce(baseCtx)
    adSetsStore.getAdSet.mockResolvedValueOnce(baseAdSet)
    metaProviderMock.metaProvider.upsertAd.mockRejectedValueOnce(new Error('Meta down'))

    const res = await pausePOST(makeReq(), {} as any, {
      params: Promise.resolve({ id: 'ad_1' }),
    })
    expect(res.status).toBe(200)
    expect((await res.json()).data.status).toBe('PAUSED')
  })
})

// ── Validate ──────────────────────────────────────────────────────────────────

describe('POST /api/v1/ads/ads/[id]/validate', () => {
  it('returns {valid: true, warnings: []} when Meta validate passes', async () => {
    const adWithMeta = { ...baseAd, providerData: { meta: { id: 'meta_ad_123' } } }
    store.getAd.mockResolvedValueOnce(adWithMeta)
    helpers.requireMetaContext.mockResolvedValueOnce(baseCtx)
    metaAdsMock.validateAd.mockResolvedValueOnce({ success: true })

    const res = await validatePOST(makeReq(), {} as any, {
      params: Promise.resolve({ id: 'ad_1' }),
    })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data.valid).toBe(true)
    expect(body.data.warnings).toHaveLength(0)
  })

  it('returns {valid: false, warnings: [...]} when Meta validate throws', async () => {
    const adWithMeta = { ...baseAd, providerData: { meta: { id: 'meta_ad_123' } } }
    store.getAd.mockResolvedValueOnce(adWithMeta)
    helpers.requireMetaContext.mockResolvedValueOnce(baseCtx)
    metaAdsMock.validateAd.mockRejectedValueOnce(new Error('Creative spec invalid'))

    const res = await validatePOST(makeReq(), {} as any, {
      params: Promise.resolve({ id: 'ad_1' }),
    })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data.valid).toBe(false)
    expect(body.data.warnings[0]).toMatch(/Creative spec invalid/)
  })

  it('returns {valid: true, warnings: [not pushed]} when no metaId', async () => {
    store.getAd.mockResolvedValueOnce(baseAd) // no providerData.meta.id
    helpers.requireMetaContext.mockResolvedValueOnce(baseCtx)

    const res = await validatePOST(makeReq(), {} as any, {
      params: Promise.resolve({ id: 'ad_1' }),
    })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data.valid).toBe(true)
    expect(body.data.warnings[0]).toMatch(/not yet pushed/)
  })
})
