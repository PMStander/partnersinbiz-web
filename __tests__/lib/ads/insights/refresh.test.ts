import { mapInsightRow, refreshEntityInsights } from '@/lib/ads/insights/refresh'
import type { MetaInsightRow } from '@/lib/ads/providers/meta/insights'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockListInsights = jest.fn()

jest.mock('@/lib/ads/providers/meta', () => ({
  metaProvider: {
    listInsights: (...args: unknown[]) => mockListInsights(...args),
  },
}))

// Minimal batch mock — tracks set() calls so tests can inspect them
const batchSetCalls: Array<{ docId: string; data: Record<string, unknown> }> = []
const mockBatchCommit = jest.fn().mockResolvedValue(undefined)

const mockDocUpdate = jest.fn().mockResolvedValue(undefined)
const mockDocSet = jest.fn().mockResolvedValue(undefined)

jest.mock('@/lib/firebase/admin', () => {
  const batch = {
    set: (ref: { id: string }, data: Record<string, unknown>) => {
      batchSetCalls.push({ docId: ref.id, data })
    },
    commit: () => mockBatchCommit(),
  }

  const collection = (colName: string) => ({
    doc: (id: string) => ({
      id: `${colName}/${id}`,
      set: mockDocSet,
      update: mockDocUpdate,
    }),
  })

  return {
    adminDb: {
      batch: () => batch,
      collection,
    },
  }
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRow(overrides: Partial<MetaInsightRow> = {}): MetaInsightRow {
  return {
    date_start: '2026-05-10',
    date_stop: '2026-05-10',
    spend: '12.50',
    impressions: '1000',
    clicks: '25',
    ctr: '2.500',
    cpc: '0.50',
    cpm: '12.50',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('mapInsightRow', () => {
  beforeEach(() => batchSetCalls.splice(0))

  it('parses all 6 base metrics from string fields', () => {
    const row = makeRow()
    const metrics = mapInsightRow(row)

    expect(metrics.ad_spend).toBeCloseTo(12.5)
    expect(metrics.impressions).toBe(1000)
    expect(metrics.clicks).toBe(25)
    // CTR is divided by 100: "2.500" → 0.025
    expect(metrics.ctr).toBeCloseTo(0.025)
    expect(metrics.cpc).toBeCloseTo(0.5)
    expect(metrics.cpm).toBeCloseTo(12.5)
  })

  it('returns null for missing base metrics', () => {
    const row = makeRow({ spend: undefined, impressions: undefined, clicks: undefined })
    const metrics = mapInsightRow(row)

    expect(metrics.ad_spend).toBeNull()
    expect(metrics.impressions).toBeNull()
    expect(metrics.clicks).toBeNull()
  })

  it('sums purchase + lead + complete_registration + omni_purchase into conversions', () => {
    const row = makeRow({
      actions: [
        { action_type: 'purchase', value: '3' },
        { action_type: 'lead', value: '5' },
        { action_type: 'complete_registration', value: '2' },
        { action_type: 'omni_purchase', value: '1' },
        { action_type: 'link_click', value: '99' }, // should be ignored
      ],
    })
    const metrics = mapInsightRow(row)

    expect(metrics.conversions).toBeCloseTo(11) // 3+5+2+1
  })

  it('does not set conversions when no matching actions present', () => {
    const row = makeRow({
      actions: [{ action_type: 'link_click', value: '10' }],
    })
    const metrics = mapInsightRow(row)

    expect(metrics.conversions).toBeUndefined()
  })

  it('computes ROAS only when both action_values (purchase/omni) and spend are present', () => {
    const row = makeRow({
      spend: '50.00',
      action_values: [
        { action_type: 'purchase', value: '150.00' },
        { action_type: 'omni_purchase', value: '50.00' },
        { action_type: 'some_other', value: '999.00' }, // should be ignored
      ],
    })
    const metrics = mapInsightRow(row)

    // ROAS = (150 + 50) / 50 = 4.0
    expect(metrics.roas).toBeCloseTo(4.0)
  })

  it('does NOT set ROAS when action_values are absent', () => {
    const row = makeRow({ spend: '50.00', action_values: undefined })
    const metrics = mapInsightRow(row)

    expect(metrics.roas).toBeUndefined()
  })

  it('does NOT set ROAS when spend is zero', () => {
    const row = makeRow({
      spend: '0.00',
      action_values: [{ action_type: 'purchase', value: '100.00' }],
    })
    const metrics = mapInsightRow(row)

    expect(metrics.roas).toBeUndefined()
  })
})

describe('refreshEntityInsights', () => {
  const BASE_ARGS = {
    orgId: 'org_123',
    accessToken: 'tok_abc',
    metaObjectId: 'cmp_meta_999',
    level: 'campaign' as const,
    pibEntityId: 'cmp_pib_001',
    daysBack: 7,
  }

  beforeEach(() => {
    batchSetCalls.splice(0)
    mockBatchCommit.mockClear()
    mockDocUpdate.mockClear()
    mockListInsights.mockClear()
  })

  it('calls Meta listInsights with correct args and writes batch + updates lastRefreshedAt', async () => {
    mockListInsights.mockResolvedValue({
      data: [makeRow({ spend: '20.00', impressions: '500', clicks: '10', ctr: '2.0', cpc: '2.0', cpm: '40.0' })],
    })

    const result = await refreshEntityInsights(BASE_ARGS)

    // Meta was called with right args
    expect(mockListInsights).toHaveBeenCalledWith(
      expect.objectContaining({
        metaObjectId: 'cmp_meta_999',
        accessToken: 'tok_abc',
        level: 'campaign',
      }),
    )

    // Batch should have been committed
    expect(mockBatchCommit).toHaveBeenCalledTimes(1)

    // Rows written: 6 base metrics (ad_spend, impressions, clicks, ctr, cpc, cpm)
    expect(result.rowsWritten).toBe(6)
    expect(result.daysProcessed).toBe(1)

    // lastRefreshedAt updated on the campaign doc
    expect(mockDocUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ lastRefreshedAt: expect.anything() }),
    )
  })

  it('uses the correct collection for each level', async () => {
    mockListInsights.mockResolvedValue({ data: [makeRow()] })

    // adset
    await refreshEntityInsights({ ...BASE_ARGS, level: 'adset', pibEntityId: 'adset_001' })
    // The update call should target ad_sets/<id> — check the docId passed to collection()
    // We verify via the mockDocUpdate path constructed in our mock: `${colName}/${id}`
    // The mock returns a ref with id = `${colName}/${id}`; we check the set calls docId pattern
    const adsetSetCalls = batchSetCalls.filter((c) => c.docId.includes('adset'))
    expect(adsetSetCalls.length).toBeGreaterThan(0)

    batchSetCalls.splice(0)
    mockDocUpdate.mockClear()

    // ad
    await refreshEntityInsights({ ...BASE_ARGS, level: 'ad', pibEntityId: 'ad_001' })
    const adSetCalls = batchSetCalls.filter((c) => c.docId.includes('ad_001'))
    expect(adSetCalls.length).toBeGreaterThan(0)
  })

  it('handles empty data gracefully — commits empty batch, still updates lastRefreshedAt', async () => {
    mockListInsights.mockResolvedValue({ data: [] })

    const result = await refreshEntityInsights(BASE_ARGS)

    expect(result.rowsWritten).toBe(0)
    expect(result.daysProcessed).toBe(0)
    expect(mockBatchCommit).toHaveBeenCalledTimes(1)
    // lastRefreshedAt should still be updated even with 0 rows
    expect(mockDocUpdate).toHaveBeenCalledTimes(1)
  })

  it('skips null metric values — does not write them to the batch', async () => {
    mockListInsights.mockResolvedValue({
      data: [makeRow({ spend: undefined, impressions: undefined, clicks: undefined, ctr: undefined, cpc: undefined, cpm: undefined })],
    })

    const result = await refreshEntityInsights(BASE_ARGS)

    // All base metrics are null → nothing written
    expect(result.rowsWritten).toBe(0)
    expect(batchSetCalls).toHaveLength(0)
  })
})
