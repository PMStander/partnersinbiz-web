import {
  createCampaign,
  listCampaigns,
  getCampaign,
  updateCampaign,
  deleteCampaign,
  validateCampaign,
} from '@/lib/ads/providers/meta/campaigns'
import type { AdCampaign } from '@/lib/ads/types'

const ORIGINAL_FETCH = global.fetch

beforeEach(() => {
  global.fetch = jest.fn() as unknown as typeof fetch
})
afterAll(() => {
  global.fetch = ORIGINAL_FETCH
})

function fakeCampaign(): AdCampaign {
  return {
    id: 'cmp_1',
    orgId: 'org_1',
    platform: 'meta',
    adAccountId: 'act_42',
    name: 'Smoke Test Campaign',
    objective: 'TRAFFIC',
    status: 'PAUSED',
    cboEnabled: true,
    dailyBudget: 5000,
    bidStrategy: 'LOWEST_COST',
    specialAdCategories: [],
    providerData: {},
    createdBy: 'u',
    createdAt: { seconds: 1, nanoseconds: 0 } as any,
    updatedAt: { seconds: 1, nanoseconds: 0 } as any,
  }
}

describe('createCampaign', () => {
  it('POSTs form body to /act_<id>/campaigns and returns the new campaign id', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'meta_cmp_999' }),
    })
    const r = await createCampaign({
      adAccountId: 'act_42',
      accessToken: 'EAAO',
      campaign: fakeCampaign(),
    })
    expect(r.metaCampaignId).toBe('meta_cmp_999')
    const call = (global.fetch as jest.Mock).mock.calls[0]
    expect(call[0]).toBe('https://graph.facebook.com/v25.0/act_42/campaigns')
    expect(call[1].method).toBe('POST')
    const body = call[1].body as URLSearchParams
    expect(body.get('name')).toBe('Smoke Test Campaign')
    expect(body.get('objective')).toBe('OUTCOME_TRAFFIC')
    expect(body.get('status')).toBe('PAUSED')
    expect(body.get('access_token')).toBe('EAAO')
  })

  it('strips act_ prefix correctly when caller passes raw numeric id', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'x' }),
    })
    await createCampaign({
      adAccountId: '99',
      accessToken: 't',
      campaign: fakeCampaign(),
    })
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(
      'https://graph.facebook.com/v25.0/act_99/campaigns',
    )
  })

  it('throws on Meta error envelope', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'Invalid objective' } }),
    })
    await expect(
      createCampaign({ adAccountId: 'act_1', accessToken: 't', campaign: fakeCampaign() }),
    ).rejects.toThrow(/Invalid objective/)
  })
})

describe('listCampaigns', () => {
  it('GETs /act_<id>/campaigns with fields + pagination cursor', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{ id: 'c1', name: 'A', objective: 'OUTCOME_TRAFFIC', status: 'ACTIVE' }],
        paging: { cursors: { after: 'cursor_after' } },
      }),
    })
    const r = await listCampaigns({ adAccountId: 'act_42', accessToken: 't', after: 'prev' })
    expect(r.data).toHaveLength(1)
    expect(r.data[0].id).toBe('c1')
    expect(r.nextAfter).toBe('cursor_after')
    const url = (global.fetch as jest.Mock).mock.calls[0][0]
    expect(url).toContain('act_42/campaigns')
    expect(url).toContain('fields=id%2Cname%2Cobjective%2Cstatus')
    expect(url).toContain('after=prev')
  })
})

describe('getCampaign', () => {
  it('GETs /<id> with fields', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'meta_cmp_999', name: 'X', objective: 'OUTCOME_TRAFFIC', status: 'ACTIVE' }),
    })
    const r = await getCampaign({ metaCampaignId: 'meta_cmp_999', accessToken: 't' })
    expect(r.id).toBe('meta_cmp_999')
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain('/meta_cmp_999?')
  })
})

describe('updateCampaign', () => {
  it('POSTs subset of fields and returns success', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    })
    const r = await updateCampaign({
      metaCampaignId: 'meta_cmp_999',
      accessToken: 't',
      patch: { name: 'Renamed', status: 'PAUSED', dailyBudget: 7500 },
    })
    expect(r.success).toBe(true)
    const body = (global.fetch as jest.Mock).mock.calls[0][1].body as URLSearchParams
    expect(body.get('name')).toBe('Renamed')
    expect(body.get('status')).toBe('PAUSED')
    expect(body.get('daily_budget')).toBe('7500')
    expect(body.get('execution_options')).toBeNull()
  })

  it('adds execution_options=["VALIDATE"] when validateOnly=true', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    })
    await updateCampaign({
      metaCampaignId: 'm1',
      accessToken: 't',
      patch: { name: 'X' },
      validateOnly: true,
    })
    const body = (global.fetch as jest.Mock).mock.calls[0][1].body as URLSearchParams
    expect(body.get('execution_options')).toBe('["VALIDATE"]')
  })
})

describe('deleteCampaign', () => {
  it('DELETEs /<id>?access_token=', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true })
    await deleteCampaign({ metaCampaignId: 'm1', accessToken: 't' })
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain('/m1?access_token=t')
    expect((global.fetch as jest.Mock).mock.calls[0][1].method).toBe('DELETE')
  })

  it('throws on non-ok', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ error: { message: 'Not found' } }),
    })
    await expect(deleteCampaign({ metaCampaignId: 'm1', accessToken: 't' })).rejects.toThrow(/Not found/)
  })
})

describe('validateCampaign', () => {
  it('is updateCampaign with validateOnly: true', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    })
    await validateCampaign({ metaCampaignId: 'm1', accessToken: 't', patch: { name: 'X' } })
    const body = (global.fetch as jest.Mock).mock.calls[0][1].body as URLSearchParams
    expect(body.get('execution_options')).toBe('["VALIDATE"]')
  })
})
