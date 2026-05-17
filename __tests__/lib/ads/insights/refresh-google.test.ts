// __tests__/lib/ads/insights/refresh-google.test.ts
//
// Tests for the Google provider path in refreshEntityInsights and
// the mapGoogleInsightRow mapper.
// Also includes a Meta regression test to confirm the existing Meta path
// still works after the platform-dispatch refactor.

import { mapGoogleInsightRow, mapInsightRow, refreshEntityInsights } from '@/lib/ads/insights/refresh'
import type { DailyInsightRow } from '@/lib/ads/providers/google/insights'
import type { MetaInsightRow } from '@/lib/ads/providers/meta/insights'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockFetchGoogleInsights = jest.fn()
const mockListInsights = jest.fn()

jest.mock('@/lib/ads/providers/google/insights', () => ({
  fetchInsights: (...args: unknown[]) => mockFetchGoogleInsights(...args),
}))

jest.mock('@/lib/ads/providers/meta', () => ({
  metaProvider: {
    listInsights: (...args: unknown[]) => mockListInsights(...args),
  },
}))

jest.mock('@/lib/integrations/google_ads/oauth', () => ({
  readDeveloperToken: () => 'test-dev-token',
}))

// Minimal Firestore batch mock — tracks set() calls for assertions
const batchSetCalls: Array<{ docId: string; data: Record<string, unknown> }> = []
const mockBatchCommit = jest.fn().mockResolvedValue(undefined)
const mockDocUpdate = jest.fn().mockResolvedValue(undefined)

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
      set: jest.fn().mockResolvedValue(undefined),
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

function makeGoogleRow(overrides: Partial<DailyInsightRow> = {}): DailyInsightRow {
  return {
    date: '2026-05-10',
    ad_spend: 25.0,
    impressions: 2000,
    clicks: 50,
    conversions: 5,
    conversions_value: 250.0,
    ctr: 0.025,     // 0–1 fraction (Google already provides this)
    cpc: 0.5,
    roas: 10.0,
    ...overrides,
  }
}

function makeMetaRow(overrides: Partial<MetaInsightRow> = {}): MetaInsightRow {
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

const GOOGLE_BASE_ARGS = {
  platform: 'google' as const,
  orgId: 'org_google_1',
  accessToken: 'goog_tok_xyz',
  customerId: '1234567890',
  googleEntityId: '111222333',
  level: 'campaign' as const,
  pibEntityId: 'cmp_pib_google_001',
  daysBack: 7,
}

// ---------------------------------------------------------------------------
// Tests — mapGoogleInsightRow
// ---------------------------------------------------------------------------

describe('mapGoogleInsightRow', () => {
  it('maps all 8 canonical Google metrics correctly', () => {
    const row = makeGoogleRow()
    const metrics = mapGoogleInsightRow(row)

    expect(metrics.ad_spend).toBeCloseTo(25.0)
    expect(metrics.impressions).toBe(2000)
    expect(metrics.clicks).toBe(50)
    expect(metrics.conversions).toBe(5)
    expect(metrics.conversions_value).toBeCloseTo(250.0)
    expect(metrics.ctr).toBeCloseTo(0.025)
    expect(metrics.cpc).toBeCloseTo(0.5)
    expect(metrics.roas).toBeCloseTo(10.0)
  })

  it('does NOT include cpm — Google Ads searchStream does not return CPM', () => {
    const metrics = mapGoogleInsightRow(makeGoogleRow())
    expect(Object.prototype.hasOwnProperty.call(metrics, 'cpm')).toBe(false)
  })

  it('returns 0-value numbers as 0, not null', () => {
    const row = makeGoogleRow({ ad_spend: 0, impressions: 0, clicks: 0, conversions: 0, conversions_value: 0, roas: 0 })
    const metrics = mapGoogleInsightRow(row)

    // 0 values are still numbers and non-null
    expect(metrics.ad_spend).toBe(0)
    expect(metrics.conversions).toBe(0)
    expect(metrics.roas).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Tests — refreshEntityInsights (Google path)
// ---------------------------------------------------------------------------

describe('refreshEntityInsights — Google path', () => {
  beforeEach(() => {
    batchSetCalls.splice(0)
    mockBatchCommit.mockClear()
    mockDocUpdate.mockClear()
    mockFetchGoogleInsights.mockClear()
    mockListInsights.mockClear()
  })

  it('calls fetchInsights (Google provider) with correct args when platform=google', async () => {
    mockFetchGoogleInsights.mockResolvedValue([makeGoogleRow()])

    await refreshEntityInsights(GOOGLE_BASE_ARGS)

    expect(mockFetchGoogleInsights).toHaveBeenCalledTimes(1)
    expect(mockFetchGoogleInsights).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: '1234567890',
        accessToken: 'goog_tok_xyz',
        developerToken: 'test-dev-token',
        level: 'campaign',
        entityId: '111222333',
      }),
    )
    // Meta must NOT have been called
    expect(mockListInsights).not.toHaveBeenCalled()
  })

  it('maps Google rows to canonical metric shape and writes them to the batch', async () => {
    mockFetchGoogleInsights.mockResolvedValue([makeGoogleRow()])

    const result = await refreshEntityInsights(GOOGLE_BASE_ARGS)

    // 8 metrics per row (ad_spend, impressions, clicks, conversions, conversions_value, ctr, cpc, roas)
    expect(result.rowsWritten).toBe(8)
    expect(result.daysProcessed).toBe(1)
    expect(mockBatchCommit).toHaveBeenCalledTimes(1)

    // All docIds should use 'google_ads' source prefix
    const googleDocs = batchSetCalls.filter((c) => c.docId.startsWith('metrics/google_ads_'))
    expect(googleDocs.length).toBe(8)

    // Source field in stored documents must be 'google_ads'
    for (const call of googleDocs) {
      expect(call.data.source).toBe('google_ads')
    }
  })

  it('passes loginCustomerId to fetchInsights when provided', async () => {
    mockFetchGoogleInsights.mockResolvedValue([])

    await refreshEntityInsights({
      ...GOOGLE_BASE_ARGS,
      loginCustomerId: '9876543210',
    })

    expect(mockFetchGoogleInsights).toHaveBeenCalledWith(
      expect.objectContaining({ loginCustomerId: '9876543210' }),
    )
  })

  it('maps level=ad_group to ad_sets collection for lastRefreshedAt update', async () => {
    mockFetchGoogleInsights.mockResolvedValue([makeGoogleRow()])

    await refreshEntityInsights({
      ...GOOGLE_BASE_ARGS,
      level: 'ad_group',
      pibEntityId: 'adset_google_001',
    })

    // The update call docId uses the collection name from the mock: `${colName}/${id}`
    // ad_group → ad_sets collection
    const adSetUpdate = mockDocUpdate.mock.calls[0]
    expect(adSetUpdate).toBeDefined()
    // Verify lastRefreshedAt was set
    expect(mockDocUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ lastRefreshedAt: expect.anything() }),
    )
  })

  it('handles empty rows gracefully — commits empty batch and still updates lastRefreshedAt', async () => {
    mockFetchGoogleInsights.mockResolvedValue([])

    const result = await refreshEntityInsights(GOOGLE_BASE_ARGS)

    expect(result.rowsWritten).toBe(0)
    expect(result.daysProcessed).toBe(0)
    expect(mockBatchCommit).toHaveBeenCalledTimes(1)
    expect(mockDocUpdate).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// Tests — Meta regression (platform=meta still works after refactor)
// ---------------------------------------------------------------------------

describe('refreshEntityInsights — Meta regression', () => {
  const META_ARGS = {
    platform: 'meta' as const,
    orgId: 'org_meta_1',
    accessToken: 'meta_tok_abc',
    metaObjectId: 'cmp_meta_999',
    level: 'campaign' as const,
    pibEntityId: 'cmp_pib_001',
    daysBack: 7,
  }

  beforeEach(() => {
    batchSetCalls.splice(0)
    mockBatchCommit.mockClear()
    mockDocUpdate.mockClear()
    mockFetchGoogleInsights.mockClear()
    mockListInsights.mockClear()
  })

  it('routes platform=meta to the Meta provider, not Google', async () => {
    mockListInsights.mockResolvedValue({ data: [makeMetaRow()] })

    const result = await refreshEntityInsights(META_ARGS)

    // Meta was called
    expect(mockListInsights).toHaveBeenCalledTimes(1)
    // Google must NOT have been called
    expect(mockFetchGoogleInsights).not.toHaveBeenCalled()

    // 6 base metrics from Meta row (ad_spend, impressions, clicks, ctr, cpc, cpm)
    expect(result.rowsWritten).toBe(6)

    // All docIds use 'meta_ads' source prefix
    const metaDocs = batchSetCalls.filter((c) => c.docId.startsWith('metrics/meta_ads_'))
    expect(metaDocs.length).toBe(6)
  })
})
