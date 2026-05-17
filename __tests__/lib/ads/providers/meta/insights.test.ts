// __tests__/lib/ads/providers/meta/insights.test.ts
import { fetchInsights } from '@/lib/ads/providers/meta/insights'

const BASE = 'https://graph.facebook.com/v25.0'

beforeEach(() => {
  global.fetch = jest.fn() as unknown as typeof fetch
})

function mockOk(body: unknown) {
  ;(global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    json: async () => body,
  })
}

function mockError(status: number, body: unknown) {
  ;(global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: false,
    status,
    json: async () => body,
  })
}

describe('fetchInsights', () => {
  it('fetches with right URL, fields, and time_range', async () => {
    mockOk({ data: [] })
    await fetchInsights({
      metaObjectId: 'cmp_123',
      accessToken: 'TOK',
      since: '2026-05-01',
      until: '2026-05-07',
    })
    const calledUrl = new URL((global.fetch as jest.Mock).mock.calls[0][0] as string)
    expect(calledUrl.pathname).toBe('/v25.0/cmp_123/insights')
    const fields = calledUrl.searchParams.get('fields')!
    expect(fields).toContain('spend')
    expect(fields).toContain('impressions')
    expect(fields).toContain('clicks')
    expect(fields).toContain('ctr')
    expect(fields).toContain('cpc')
    expect(fields).toContain('cpm')
    expect(fields).toContain('actions')
    expect(fields).toContain('action_values')
    expect(calledUrl.searchParams.get('time_range')).toBe(
      JSON.stringify({ since: '2026-05-01', until: '2026-05-07' }),
    )
    expect(calledUrl.searchParams.get('access_token')).toBe('TOK')
  })

  it('includes level param when provided', async () => {
    mockOk({ data: [] })
    await fetchInsights({
      metaObjectId: 'act_42',
      accessToken: 'TOK',
      since: '2026-05-01',
      until: '2026-05-07',
      level: 'campaign',
    })
    const calledUrl = new URL((global.fetch as jest.Mock).mock.calls[0][0] as string)
    expect(calledUrl.searchParams.get('level')).toBe('campaign')
  })

  it('handles empty data array', async () => {
    mockOk({ data: [] })
    const result = await fetchInsights({
      metaObjectId: 'cmp_999',
      accessToken: 'TOK',
      since: '2026-05-01',
      until: '2026-05-07',
    })
    expect(result.data).toEqual([])
  })

  it('parses spend, impressions, and clicks as strings', async () => {
    mockOk({
      data: [
        {
          date_start: '2026-05-01',
          date_stop: '2026-05-01',
          spend: '12.50',
          impressions: '4800',
          clicks: '96',
          ctr: '2.000',
          cpc: '0.13',
          cpm: '2.60',
        },
      ],
    })
    const result = await fetchInsights({
      metaObjectId: 'cmp_1',
      accessToken: 'TOK',
      since: '2026-05-01',
      until: '2026-05-01',
    })
    const row = result.data[0]
    expect(row.spend).toBe('12.50')
    expect(row.impressions).toBe('4800')
    expect(row.clicks).toBe('96')
    expect(row.ctr).toBe('2.000')
  })

  it('parses actions array with action_type and value', async () => {
    mockOk({
      data: [
        {
          date_start: '2026-05-01',
          date_stop: '2026-05-01',
          spend: '50.00',
          actions: [
            { action_type: 'purchase', value: '5' },
            { action_type: 'lead', value: '12' },
          ],
          action_values: [{ action_type: 'purchase', value: '250.00' }],
        },
      ],
    })
    const result = await fetchInsights({
      metaObjectId: 'cmp_2',
      accessToken: 'TOK',
      since: '2026-05-01',
      until: '2026-05-01',
    })
    const row = result.data[0]
    expect(row.actions).toHaveLength(2)
    expect(row.actions![0]).toEqual({ action_type: 'purchase', value: '5' })
    expect(row.action_values).toHaveLength(1)
    expect(row.action_values![0]).toEqual({ action_type: 'purchase', value: '250.00' })
  })

  it('throws on Meta error response body', async () => {
    mockOk({ error: { message: 'Invalid access token', code: 190 } })
    await expect(
      fetchInsights({
        metaObjectId: 'cmp_bad',
        accessToken: 'EXPIRED',
        since: '2026-05-01',
        until: '2026-05-01',
      }),
    ).rejects.toThrow('Meta /insights failed: Invalid access token')
  })

  it('throws on HTTP 401 without error body', async () => {
    mockError(401, {})
    await expect(
      fetchInsights({
        metaObjectId: 'cmp_bad',
        accessToken: 'EXPIRED',
        since: '2026-05-01',
        until: '2026-05-01',
      }),
    ).rejects.toThrow('Meta /insights failed: HTTP 401')
  })
})
