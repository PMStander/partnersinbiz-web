/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'

// Mock recharts — jsdom cannot render SVG; replace with simple div stubs
jest.mock('recharts', () => {
  const React = require('react')
  return {
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', { 'data-testid': 'responsive-container' }, children),
    LineChart: ({ children, data }: { children: React.ReactNode; data: unknown[] }) =>
      React.createElement('div', { 'data-testid': 'line-chart', 'data-rows': data?.length ?? 0 }, children),
    Line: () => null,
    XAxis: () => null,
    YAxis: () => null,
    Tooltip: () => null,
    CartesianGrid: () => null,
  }
})

import { InsightsChart } from '@/components/ads/InsightsChart'

const METRIC_ROWS = [
  { date: '2026-05-10', value: 12.5, metric: 'ad_spend' },
  { date: '2026-05-11', value: 18.0, metric: 'ad_spend' },
  { date: '2026-05-12', value: 9.75, metric: 'ad_spend' },
]

function makeSuccessResponse(data: unknown[]) {
  return {
    ok: true,
    json: async () => ({ success: true, data }),
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  global.fetch = jest.fn().mockResolvedValue(makeSuccessResponse([])) as unknown as typeof fetch
})

describe('InsightsChart', () => {
  it('renders the metric selector with all 7 options', () => {
    render(
      <InsightsChart orgId="org_1" level="campaign" pibEntityId="camp_1" />
    )
    const select = screen.getByRole('combobox', { name: /metric/i })
    expect(select).toBeInTheDocument()

    const expectedLabels = ['Spend', 'Impressions', 'Clicks', 'CTR', 'CPC', 'Conversions', 'ROAS']
    for (const label of expectedLabels) {
      expect(screen.getByRole('option', { name: label })).toBeInTheDocument()
    }
    // Default selection is ad_spend → "Spend"
    expect((select as HTMLSelectElement).value).toBe('ad_spend')
  })

  it('fetches from /api/v1/ads/insights with correct URL params and X-Org-Id header', async () => {
    render(
      <InsightsChart orgId="org_abc" level="adset" pibEntityId="adset_xyz" daysBack={14} />
    )

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1)
    })

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit]

    // URL must contain expected query params
    expect(url).toContain('/api/v1/ads/insights')
    expect(url).toContain('level=adset')
    expect(url).toContain('dimensionId=adset_xyz')
    expect(url).toContain('metric=ad_spend')
    expect(url).toMatch(/since=\d{4}-\d{2}-\d{2}/)
    expect(url).toMatch(/until=\d{4}-\d{2}-\d{2}/)

    // X-Org-Id header must be set
    expect((init.headers as Record<string, string>)['X-Org-Id']).toBe('org_abc')
  })

  it('re-fetches and renders the chart when data is loaded', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue(makeSuccessResponse(METRIC_ROWS))

    render(
      <InsightsChart orgId="org_1" level="campaign" pibEntityId="camp_1" />
    )

    // The chart container should appear once data resolves
    await waitFor(() => {
      expect(screen.getByTestId('line-chart')).toBeInTheDocument()
    })

    // Verify row count propagated to the mocked LineChart
    const chart = screen.getByTestId('line-chart')
    expect(chart.getAttribute('data-rows')).toBe(String(METRIC_ROWS.length))
  })
})
