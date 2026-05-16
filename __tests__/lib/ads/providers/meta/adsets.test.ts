import {
  createAdSet,
  listAdSets,
  getAdSet,
  updateAdSet,
  deleteAdSet,
  validateAdSet,
} from '@/lib/ads/providers/meta/adsets'
import type { AdSet } from '@/lib/ads/types'

const ORIGINAL_FETCH = global.fetch

beforeEach(() => {
  global.fetch = jest.fn() as unknown as typeof fetch
})
afterAll(() => {
  global.fetch = ORIGINAL_FETCH
})

function fakeAdSet(): AdSet {
  return {
    id: 'as_1',
    orgId: 'org_1',
    campaignId: 'cmp_1',
    platform: 'meta',
    name: 'Smoke Test Ad Set',
    status: 'PAUSED',
    dailyBudget: 2000,
    bidAmount: 100,
    optimizationGoal: 'LINK_CLICKS',
    billingEvent: 'IMPRESSIONS',
    targeting: {
      geo: { countries: ['ZA'] },
      demographics: { ageMin: 25, ageMax: 45, genders: ['female'] },
      interests: [{ id: '6003139266461', name: 'Business' }],
    },
    placements: { feeds: true, stories: false, reels: false, marketplace: false },
    providerData: {},
    createdAt: { seconds: 1, nanoseconds: 0 } as any,
    updatedAt: { seconds: 1, nanoseconds: 0 } as any,
  }
}

describe('createAdSet', () => {
  it('POSTs form body to /act_<id>/adsets and returns the new adset id', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'meta_as_999' }),
    })
    const r = await createAdSet({
      adAccountId: 'act_42',
      accessToken: 'EAAO',
      adSet: fakeAdSet(),
      metaCampaignId: 'meta_cmp_123',
    })
    expect(r.metaAdSetId).toBe('meta_as_999')
    const call = (global.fetch as jest.Mock).mock.calls[0]
    expect(call[0]).toBe('https://graph.facebook.com/v25.0/act_42/adsets')
    expect(call[1].method).toBe('POST')
    const body = call[1].body as URLSearchParams
    expect(body.get('name')).toBe('Smoke Test Ad Set')
    expect(body.get('campaign_id')).toBe('meta_cmp_123')
    expect(body.get('optimization_goal')).toBe('LINK_CLICKS')
    expect(body.get('billing_event')).toBe('IMPRESSIONS')
    expect(body.get('status')).toBe('PAUSED')
    expect(body.get('access_token')).toBe('EAAO')
    // targeting JSON should be present and valid
    const targeting = JSON.parse(body.get('targeting')!)
    expect(targeting.geo_locations.countries).toContain('ZA')
    expect(targeting.age_min).toBe(25)
    expect(targeting.genders).toEqual([2]) // female=2
  })

  it('strips act_ prefix correctly when caller passes raw numeric id', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'x' }),
    })
    await createAdSet({
      adAccountId: '99',
      accessToken: 't',
      adSet: fakeAdSet(),
      metaCampaignId: 'cmp',
    })
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(
      'https://graph.facebook.com/v25.0/act_99/adsets',
    )
  })

  it('throws on Meta error envelope', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'Invalid campaign' } }),
    })
    await expect(
      createAdSet({
        adAccountId: 'act_1',
        accessToken: 't',
        adSet: fakeAdSet(),
        metaCampaignId: 'cmp',
      }),
    ).rejects.toThrow(/Invalid campaign/)
  })
})

describe('listAdSets', () => {
  it('GETs /<campaignId>/adsets when campaignId is provided', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{ id: 'as1', name: 'A', campaign_id: 'c1', status: 'ACTIVE', optimization_goal: 'LINK_CLICKS', billing_event: 'IMPRESSIONS' }],
        paging: { cursors: { after: 'cursor_after' } },
      }),
    })
    const r = await listAdSets({ campaignId: 'cmp_123', accessToken: 't' })
    expect(r.data).toHaveLength(1)
    expect(r.data[0].id).toBe('as1')
    expect(r.nextAfter).toBe('cursor_after')
    const url = (global.fetch as jest.Mock).mock.calls[0][0]
    expect(url).toContain('cmp_123/adsets')
    expect(url).toContain('fields=')
  })

  it('GETs /act_<id>/adsets when only adAccountId is provided', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [], paging: {} }),
    })
    await listAdSets({ adAccountId: 'act_42', accessToken: 't' })
    const url = (global.fetch as jest.Mock).mock.calls[0][0]
    expect(url).toContain('act_42/adsets')
  })

  it('passes after cursor for pagination', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [], paging: {} }),
    })
    await listAdSets({ adAccountId: 'act_42', accessToken: 't', after: 'prev_cursor' })
    const url = (global.fetch as jest.Mock).mock.calls[0][0]
    expect(url).toContain('after=prev_cursor')
  })
})

describe('getAdSet', () => {
  it('GETs /<id> with fields', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'meta_as_999', name: 'X', campaign_id: 'c1', status: 'ACTIVE', optimization_goal: 'LINK_CLICKS', billing_event: 'IMPRESSIONS' }),
    })
    const r = await getAdSet({ metaAdSetId: 'meta_as_999', accessToken: 't' })
    expect(r.id).toBe('meta_as_999')
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain('/meta_as_999?')
  })
})

describe('updateAdSet', () => {
  it('POSTs subset of fields and returns success', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    })
    const r = await updateAdSet({
      metaAdSetId: 'meta_as_999',
      accessToken: 't',
      patch: { name: 'Renamed Set', status: 'ACTIVE', dailyBudget: 3000 },
    })
    expect(r.success).toBe(true)
    const body = (global.fetch as jest.Mock).mock.calls[0][1].body as URLSearchParams
    expect(body.get('name')).toBe('Renamed Set')
    expect(body.get('status')).toBe('ACTIVE')
    expect(body.get('daily_budget')).toBe('3000')
    expect(body.get('execution_options')).toBeNull()
  })

  it('adds execution_options=["VALIDATE"] when validateOnly=true', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    })
    await updateAdSet({
      metaAdSetId: 'as1',
      accessToken: 't',
      patch: { name: 'X' },
      validateOnly: true,
    })
    const body = (global.fetch as jest.Mock).mock.calls[0][1].body as URLSearchParams
    expect(body.get('execution_options')).toBe('["VALIDATE"]')
  })
})

describe('deleteAdSet', () => {
  it('DELETEs /<id>?access_token=', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true })
    await deleteAdSet({ metaAdSetId: 'as1', accessToken: 't' })
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain('/as1?access_token=t')
    expect((global.fetch as jest.Mock).mock.calls[0][1].method).toBe('DELETE')
  })

  it('throws on non-ok', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ error: { message: 'Not found' } }),
    })
    await expect(deleteAdSet({ metaAdSetId: 'as1', accessToken: 't' })).rejects.toThrow(/Not found/)
  })
})

describe('validateAdSet', () => {
  it('is updateAdSet with validateOnly: true', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    })
    await validateAdSet({ metaAdSetId: 'as1', accessToken: 't', patch: { name: 'X' } })
    const body = (global.fetch as jest.Mock).mock.calls[0][1].body as URLSearchParams
    expect(body.get('execution_options')).toBe('["VALIDATE"]')
  })
})
