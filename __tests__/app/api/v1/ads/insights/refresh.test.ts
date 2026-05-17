// __tests__/app/api/v1/ads/insights/refresh.test.ts
import { POST } from '@/app/api/v1/ads/insights/refresh/route'

jest.mock('@/lib/api/auth', () => ({ withAuth: (_r: string, h: any) => h }))
jest.mock('@/lib/ads/campaigns/store', () => ({ getCampaign: jest.fn() }))
jest.mock('@/lib/ads/adsets/store', () => ({ getAdSet: jest.fn() }))
jest.mock('@/lib/ads/ads/store', () => ({ getAd: jest.fn() }))
jest.mock('@/lib/ads/insights/queue', () => ({ enqueueRefresh: jest.fn() }))

const campaignStore = jest.requireMock('@/lib/ads/campaigns/store')
const adSetStore = jest.requireMock('@/lib/ads/adsets/store')
const adStore = jest.requireMock('@/lib/ads/ads/store')
const queue = jest.requireMock('@/lib/ads/insights/queue')

beforeEach(() => jest.clearAllMocks())

function makeReq(orgId = 'org_1', body: Record<string, unknown> = {}) {
  return new Request('http://x', {
    method: 'POST',
    headers: { 'X-Org-Id': orgId, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as any
}

const baseCampaign = {
  id: 'cmp_1',
  orgId: 'org_1',
  providerData: { meta: { id: 'meta_cmp_1' } },
}
const baseAdSet = {
  id: 'ads_1',
  orgId: 'org_1',
  providerData: { meta: { id: 'meta_ads_1' } },
}
const baseAd = {
  id: 'ad_1',
  orgId: 'org_1',
  providerData: { meta: { id: 'meta_ad_1' } },
}

describe('POST /api/v1/ads/insights/refresh', () => {
  it('enqueues refresh for a campaign entity', async () => {
    campaignStore.getCampaign.mockResolvedValueOnce(baseCampaign)
    queue.enqueueRefresh.mockResolvedValueOnce({ enqueued: true })

    const res = await POST(makeReq('org_1', { level: 'campaign', pibEntityId: 'cmp_1' }), {} as any)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.enqueued).toBe(true)
    expect(campaignStore.getCampaign).toHaveBeenCalledWith('cmp_1')
    expect(queue.enqueueRefresh).toHaveBeenCalledWith({
      orgId: 'org_1',
      pibEntityId: 'cmp_1',
      metaObjectId: 'meta_cmp_1',
      level: 'campaign',
    })
  })

  it('enqueues refresh for an adset entity', async () => {
    adSetStore.getAdSet.mockResolvedValueOnce(baseAdSet)
    queue.enqueueRefresh.mockResolvedValueOnce({ enqueued: true })

    const res = await POST(makeReq('org_1', { level: 'adset', pibEntityId: 'ads_1' }), {} as any)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.enqueued).toBe(true)
    expect(adSetStore.getAdSet).toHaveBeenCalledWith('ads_1')
    expect(queue.enqueueRefresh).toHaveBeenCalledWith({
      orgId: 'org_1',
      pibEntityId: 'ads_1',
      metaObjectId: 'meta_ads_1',
      level: 'adset',
    })
  })

  it('enqueues refresh for an ad entity', async () => {
    adStore.getAd.mockResolvedValueOnce(baseAd)
    queue.enqueueRefresh.mockResolvedValueOnce({ enqueued: true })

    const res = await POST(makeReq('org_1', { level: 'ad', pibEntityId: 'ad_1' }), {} as any)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.enqueued).toBe(true)
    expect(adStore.getAd).toHaveBeenCalledWith('ad_1')
    expect(queue.enqueueRefresh).toHaveBeenCalledWith({
      orgId: 'org_1',
      pibEntityId: 'ad_1',
      metaObjectId: 'meta_ad_1',
      level: 'ad',
    })
  })

  it('returns 404 when entity belongs to a different org', async () => {
    campaignStore.getCampaign.mockResolvedValueOnce({ ...baseCampaign, orgId: 'org_other' })

    const res = await POST(makeReq('org_1', { level: 'campaign', pibEntityId: 'cmp_1' }), {} as any)

    expect(res.status).toBe(404)
    expect(queue.enqueueRefresh).not.toHaveBeenCalled()
  })
})
