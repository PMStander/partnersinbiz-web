// __tests__/lib/ads/providers/google/insights.test.ts
import { fetchInsights } from '@/lib/ads/providers/google/insights'
import type { DailyInsightRow, GoogleInsightsLevel } from '@/lib/ads/providers/google/insights'

global.fetch = jest.fn() as jest.Mock

const baseArgs = {
  customerId: '1234567890',
  accessToken: 'test-access',
  developerToken: 'test-dev',
  entityId: '9876543210',
  dateRange: { startDate: '2026-05-01', endDate: '2026-05-07' },
}

/** A single-object (non-chunked) searchStream response containing one row. */
function makeSingleRow(overrides?: Partial<Record<string, unknown>>) {
  return {
    results: [
      {
        segments: { date: '2026-05-01' },
        metrics: {
          cost_micros: 5_000_000,   // 5.00
          impressions: 1000,
          clicks: 50,
          conversions: 3,
          conversions_value: 30,
          ctr: 0.05,
          average_cpc: 100_000,     // 0.10
          ...overrides,
        },
      },
    ],
  }
}

function mockOk(body: unknown) {
  ;(global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    json: async () => body,
  })
}

function mockError(status: number, text: string) {
  ;(global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: false,
    status,
    text: async () => text,
  })
}

beforeEach(() => {
  ;(global.fetch as jest.Mock).mockReset()
})

describe('fetchInsights — GAQL resource routing', () => {
  it('1. builds correct GAQL query for campaign level', async () => {
    mockOk(makeSingleRow())
    await fetchInsights({ ...baseArgs, level: 'campaign' })
    const [, init] = (global.fetch as jest.Mock).mock.calls[0]
    const body = JSON.parse(init.body as string) as { query: string }
    expect(body.query).toContain('FROM campaign')
    expect(body.query).toContain('campaign.id = 9876543210')
    expect(body.query).toContain("segments.date BETWEEN '2026-05-01' AND '2026-05-07'")
    expect(body.query).toContain('ORDER BY segments.date ASC')
  })

  it('2. uses ad_group resource for ad_group level', async () => {
    mockOk(makeSingleRow())
    await fetchInsights({ ...baseArgs, level: 'ad_group' })
    const [, init] = (global.fetch as jest.Mock).mock.calls[0]
    const body = JSON.parse(init.body as string) as { query: string }
    expect(body.query).toContain('FROM ad_group')
    expect(body.query).toContain('ad_group.id = 9876543210')
  })

  it('3. uses ad_group_ad resource + ad_group_ad.ad.id filter for ad level', async () => {
    mockOk(makeSingleRow())
    await fetchInsights({ ...baseArgs, level: 'ad' })
    const [, init] = (global.fetch as jest.Mock).mock.calls[0]
    const body = JSON.parse(init.body as string) as { query: string }
    expect(body.query).toContain('FROM ad_group_ad')
    expect(body.query).toContain('ad_group_ad.ad.id = 9876543210')
  })
})

describe('fetchInsights — URL and headers', () => {
  it('10a. includes developer-token and Authorization headers', async () => {
    mockOk(makeSingleRow())
    await fetchInsights({ ...baseArgs, level: 'campaign' })
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0]
    const headers = init.headers as Record<string, string>
    expect(url).toContain('/customers/1234567890/googleAds:searchStream')
    expect(headers['developer-token']).toBe('test-dev')
    expect(headers.Authorization).toBe('Bearer test-access')
    expect(headers['login-customer-id']).toBeUndefined()
  })

  it('10b. includes login-customer-id header when set', async () => {
    mockOk(makeSingleRow())
    await fetchInsights({ ...baseArgs, level: 'campaign', loginCustomerId: '9999999999' })
    const [, init] = (global.fetch as jest.Mock).mock.calls[0]
    const headers = init.headers as Record<string, string>
    expect(headers['login-customer-id']).toBe('9999999999')
  })

  it('10c. throws on non-2xx response', async () => {
    mockError(403, 'PERMISSION_DENIED')
    await expect(fetchInsights({ ...baseArgs, level: 'campaign' })).rejects.toThrow(
      /Google Ads insights search failed: HTTP 403/,
    )
  })
})

describe('fetchInsights — canonical row shape and unit conversions', () => {
  it('4. returns canonical DailyInsightRow shape', async () => {
    mockOk(makeSingleRow())
    const rows = await fetchInsights({ ...baseArgs, level: 'campaign' })
    expect(rows).toHaveLength(1)
    const row = rows[0] as DailyInsightRow
    expect(row).toHaveProperty('date')
    expect(row).toHaveProperty('ad_spend')
    expect(row).toHaveProperty('impressions')
    expect(row).toHaveProperty('clicks')
    expect(row).toHaveProperty('conversions')
    expect(row).toHaveProperty('conversions_value')
    expect(row).toHaveProperty('ctr')
    expect(row).toHaveProperty('cpc')
    expect(row).toHaveProperty('roas')
  })

  it('5. converts cost_micros → ad_spend by dividing by 1 000 000', async () => {
    mockOk(makeSingleRow({ cost_micros: 12_500_000 }))
    const rows = await fetchInsights({ ...baseArgs, level: 'campaign' })
    expect(rows[0].ad_spend).toBeCloseTo(12.5)
  })

  it('6. converts average_cpc (micros) → cpc by dividing by 1 000 000', async () => {
    mockOk(makeSingleRow({ average_cpc: 250_000 }))
    const rows = await fetchInsights({ ...baseArgs, level: 'campaign' })
    expect(rows[0].cpc).toBeCloseTo(0.25)
  })

  it('7. computes roas = conversions_value / ad_spend; returns 0 when ad_spend is 0', async () => {
    // Normal case: 30 / 5 = 6
    mockOk(makeSingleRow({ cost_micros: 5_000_000, conversions_value: 30 }))
    const [rowWithSpend] = await fetchInsights({ ...baseArgs, level: 'campaign' })
    expect(rowWithSpend.roas).toBeCloseTo(6)

    // Zero spend → roas = 0
    mockOk(makeSingleRow({ cost_micros: 0, conversions_value: 0 }))
    const [rowNoSpend] = await fetchInsights({ ...baseArgs, level: 'campaign' })
    expect(rowNoSpend.roas).toBe(0)
  })
})

describe('fetchInsights — response shape handling', () => {
  it('8. handles array-of-chunks response from :searchStream', async () => {
    const chunk1 = {
      results: [
        {
          segments: { date: '2026-05-01' },
          metrics: { cost_micros: 1_000_000, impressions: 100, clicks: 5, conversions: 1, conversions_value: 10, ctr: 0.05, average_cpc: 200_000 },
        },
      ],
    }
    const chunk2 = {
      results: [
        {
          segments: { date: '2026-05-02' },
          metrics: { cost_micros: 2_000_000, impressions: 200, clicks: 10, conversions: 2, conversions_value: 20, ctr: 0.05, average_cpc: 200_000 },
        },
      ],
    }
    mockOk([chunk1, chunk2])
    const rows = await fetchInsights({ ...baseArgs, level: 'campaign' })
    expect(rows).toHaveLength(2)
    expect(rows[0].date).toBe('2026-05-01')
    expect(rows[1].date).toBe('2026-05-02')
    expect(rows[0].ad_spend).toBeCloseTo(1)
    expect(rows[1].ad_spend).toBeCloseTo(2)
  })

  it('9. handles single-object response shape (non-array)', async () => {
    mockOk(makeSingleRow())
    const rows = await fetchInsights({ ...baseArgs, level: 'campaign' })
    expect(rows).toHaveLength(1)
    expect(rows[0].date).toBe('2026-05-01')
    expect(rows[0].impressions).toBe(1000)
    expect(rows[0].clicks).toBe(50)
  })
})
