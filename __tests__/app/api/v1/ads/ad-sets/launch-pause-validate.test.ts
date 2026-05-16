// __tests__/app/api/v1/ads/ad-sets/launch-pause-validate.test.ts
import { POST as launchPOST } from '@/app/api/v1/ads/ad-sets/[id]/launch/route'
import { POST as pausePOST } from '@/app/api/v1/ads/ad-sets/[id]/pause/route'
import { POST as validatePOST } from '@/app/api/v1/ads/ad-sets/[id]/validate/route'

jest.mock('@/lib/api/auth', () => ({ withAuth: (_r: string, h: any) => h }))
jest.mock('@/lib/ads/adsets/store', () => ({
  getAdSet: jest.fn(),
  updateAdSet: jest.fn(),
  setAdSetMetaId: jest.fn(),
}))
jest.mock('@/lib/ads/campaigns/store', () => ({
  getCampaign: jest.fn(),
}))
jest.mock('@/lib/ads/api-helpers', () => ({
  requireMetaContext: jest.fn(),
}))
jest.mock('@/lib/ads/providers/meta', () => ({
  metaProvider: { upsertAdSet: jest.fn() },
}))
jest.mock('@/lib/ads/providers/meta/adsets', () => ({
  validateAdSet: jest.fn(),
}))

const store = jest.requireMock('@/lib/ads/adsets/store')
const campaignsStore = jest.requireMock('@/lib/ads/campaigns/store')
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

const baseCampaign = {
  id: 'cmp_1',
  orgId: 'org_1',
  name: 'Campaign',
  status: 'ACTIVE',
  providerData: { meta: { id: 'meta_cmp_123' } },
}

const baseCtx = {
  orgId: 'org_1',
  accessToken: 'tok',
  adAccountId: 'act_42',
  connection: { id: 'conn_1' },
}

function makeReq(orgId = 'org_1') {
  return new Request('http://x', {
    method: 'POST',
    headers: { 'X-Org-Id': orgId },
  }) as any
}

// ── Launch ────────────────────────────────────────────────────────────────────

describe('POST /api/v1/ads/ad-sets/[id]/launch', () => {
  it('creates ad set in Meta and persists metaAdSetId when no metaId exists', async () => {
    const afterUpdate = { ...baseAdSet, status: 'ACTIVE' }
    store.getAdSet
      .mockResolvedValueOnce(baseAdSet)
      .mockResolvedValueOnce(afterUpdate)
    store.updateAdSet.mockResolvedValueOnce(undefined)
    store.setAdSetMetaId.mockResolvedValueOnce(undefined)
    helpers.requireMetaContext.mockResolvedValueOnce(baseCtx)
    campaignsStore.getCampaign.mockResolvedValueOnce(baseCampaign)
    metaProviderMock.metaProvider.upsertAdSet.mockResolvedValueOnce({
      metaAdSetId: 'meta_ads_new',
      created: true,
    })

    const res = await launchPOST(makeReq(), {} as any, {
      params: Promise.resolve({ id: 'ads_1' }),
    })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data.status).toBe('ACTIVE')
    expect(store.setAdSetMetaId).toHaveBeenCalledWith('ads_1', 'meta_ads_new')
    expect(store.updateAdSet).toHaveBeenCalledWith('ads_1', { status: 'ACTIVE' })
  })

  it('does not call setAdSetMetaId when Meta returns created=false (already exists)', async () => {
    const adSetWithMeta = { ...baseAdSet, providerData: { meta: { id: 'meta_ads_123' } } }
    store.getAdSet
      .mockResolvedValueOnce(adSetWithMeta)
      .mockResolvedValueOnce({ ...adSetWithMeta, status: 'ACTIVE' })
    store.updateAdSet.mockResolvedValueOnce(undefined)
    helpers.requireMetaContext.mockResolvedValueOnce(baseCtx)
    campaignsStore.getCampaign.mockResolvedValueOnce(baseCampaign)
    metaProviderMock.metaProvider.upsertAdSet.mockResolvedValueOnce({
      metaAdSetId: 'meta_ads_123',
      created: false,
    })

    await launchPOST(makeReq(), {} as any, { params: Promise.resolve({ id: 'ads_1' }) })
    expect(store.setAdSetMetaId).not.toHaveBeenCalled()
  })

  it('returns 400 when parent campaign is not yet on Meta', async () => {
    store.getAdSet.mockResolvedValueOnce(baseAdSet)
    helpers.requireMetaContext.mockResolvedValueOnce(baseCtx)
    campaignsStore.getCampaign.mockResolvedValueOnce({
      ...baseCampaign,
      providerData: {}, // no meta.id
    })

    const res = await launchPOST(makeReq(), {} as any, {
      params: Promise.resolve({ id: 'ads_1' }),
    })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/campaign/i)
  })

  it('returns 400 when parent campaign does not exist', async () => {
    store.getAdSet.mockResolvedValueOnce(baseAdSet)
    helpers.requireMetaContext.mockResolvedValueOnce(baseCtx)
    campaignsStore.getCampaign.mockResolvedValueOnce(null)

    const res = await launchPOST(makeReq(), {} as any, {
      params: Promise.resolve({ id: 'ads_1' }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 404 when ad set belongs to different org', async () => {
    store.getAdSet.mockResolvedValueOnce({ ...baseAdSet, orgId: 'org_other' })
    const res = await launchPOST(makeReq('org_1'), {} as any, {
      params: Promise.resolve({ id: 'ads_1' }),
    })
    expect(res.status).toBe(404)
  })
})

// ── Pause ─────────────────────────────────────────────────────────────────────

describe('POST /api/v1/ads/ad-sets/[id]/pause', () => {
  it('updates status to PAUSED locally', async () => {
    const afterPause = { ...baseAdSet, status: 'PAUSED' }
    store.getAdSet
      .mockResolvedValueOnce(baseAdSet)
      .mockResolvedValueOnce(afterPause)
    store.updateAdSet.mockResolvedValueOnce(undefined)

    const res = await pausePOST(makeReq(), {} as any, {
      params: Promise.resolve({ id: 'ads_1' }),
    })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data.status).toBe('PAUSED')
    expect(store.updateAdSet).toHaveBeenCalledWith('ads_1', { status: 'PAUSED' })
  })

  it('best-effort syncs to Meta when metaId is set; does not fail on Meta error', async () => {
    const adSetWithMeta = {
      ...baseAdSet,
      status: 'ACTIVE',
      providerData: { meta: { id: 'meta_ads_123' } },
    }
    store.getAdSet
      .mockResolvedValueOnce(adSetWithMeta)
      .mockResolvedValueOnce({ ...adSetWithMeta, status: 'PAUSED' })
    store.updateAdSet.mockResolvedValueOnce(undefined)
    helpers.requireMetaContext.mockResolvedValueOnce(baseCtx)
    campaignsStore.getCampaign.mockResolvedValueOnce(baseCampaign)
    metaProviderMock.metaProvider.upsertAdSet.mockRejectedValueOnce(new Error('Meta down'))

    const res = await pausePOST(makeReq(), {} as any, {
      params: Promise.resolve({ id: 'ads_1' }),
    })
    expect(res.status).toBe(200)
    expect((await res.json()).data.status).toBe('PAUSED')
  })
})

// ── Validate ──────────────────────────────────────────────────────────────────

describe('POST /api/v1/ads/ad-sets/[id]/validate', () => {
  it('returns {valid: true, warnings: []} when Meta validate passes', async () => {
    const adSetWithMeta = { ...baseAdSet, providerData: { meta: { id: 'meta_ads_123' } } }
    store.getAdSet.mockResolvedValueOnce(adSetWithMeta)
    helpers.requireMetaContext.mockResolvedValueOnce(baseCtx)
    metaAdSetsMock.validateAdSet.mockResolvedValueOnce({ success: true })

    const res = await validatePOST(makeReq(), {} as any, {
      params: Promise.resolve({ id: 'ads_1' }),
    })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data.valid).toBe(true)
    expect(body.data.warnings).toHaveLength(0)
  })

  it('returns {valid: false, warnings: [...]} when Meta validate throws', async () => {
    const adSetWithMeta = { ...baseAdSet, providerData: { meta: { id: 'meta_ads_123' } } }
    store.getAdSet.mockResolvedValueOnce(adSetWithMeta)
    helpers.requireMetaContext.mockResolvedValueOnce(baseCtx)
    metaAdSetsMock.validateAdSet.mockRejectedValueOnce(new Error('Budget too low'))

    const res = await validatePOST(makeReq(), {} as any, {
      params: Promise.resolve({ id: 'ads_1' }),
    })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data.valid).toBe(false)
    expect(body.data.warnings[0]).toMatch(/Budget too low/)
  })

  it('returns {valid: true, warnings: [not pushed]} when no metaId', async () => {
    store.getAdSet.mockResolvedValueOnce(baseAdSet) // no providerData.meta.id
    helpers.requireMetaContext.mockResolvedValueOnce(baseCtx)

    const res = await validatePOST(makeReq(), {} as any, {
      params: Promise.resolve({ id: 'ads_1' }),
    })
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data.valid).toBe(true)
    expect(body.data.warnings[0]).toMatch(/not yet pushed/)
  })
})
