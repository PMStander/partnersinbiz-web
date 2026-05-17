// lib/ads/providers/google/insights.ts
//
// Fetches daily campaign / ad-group / ad metrics via the Google Ads
// `searchStream` GAQL endpoint. Returns canonical DailyInsightRow values
// compatible with the Sub-1 Phase 5 insights queue (same field names and
// units as the `mapInsightRow` output in lib/ads/insights/refresh.ts).

import { GOOGLE_ADS_API_BASE_URL } from './constants'

interface CallArgs {
  customerId: string
  accessToken: string
  developerToken: string
  loginCustomerId?: string
}

function buildHeaders(args: CallArgs): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${args.accessToken}`,
    'developer-token': args.developerToken,
    'Content-Type': 'application/json',
  }
  if (args.loginCustomerId) h['login-customer-id'] = args.loginCustomerId
  return h
}

export type GoogleInsightsLevel = 'campaign' | 'ad_group' | 'ad'

export interface DailyInsightRow {
  date: string              // 'YYYY-MM-DD'
  ad_spend: number          // major units (micros ÷ 1 000 000)
  impressions: number
  clicks: number
  conversions: number
  conversions_value: number
  ctr: number               // 0.0–1.0 fraction
  cpc: number               // major units (average_cpc micros ÷ 1 000 000)
  roas: number              // conversions_value / ad_spend; 0 when ad_spend = 0
}

const FIELDS = [
  'segments.date',
  'metrics.cost_micros',
  'metrics.impressions',
  'metrics.clicks',
  'metrics.conversions',
  'metrics.conversions_value',
  'metrics.ctr',
  'metrics.average_cpc',
]

function fromResourceField(level: GoogleInsightsLevel): { from: string; where: string } {
  switch (level) {
    case 'campaign':
      return { from: 'campaign', where: 'campaign.id' }
    case 'ad_group':
      return { from: 'ad_group', where: 'ad_group.id' }
    case 'ad':
      return { from: 'ad_group_ad', where: 'ad_group_ad.ad.id' }
  }
}

/** Fetch daily insights for a single Google Ads entity within a date range. */
export async function fetchInsights(
  args: CallArgs & {
    level: GoogleInsightsLevel
    /** Numeric Google entity ID (campaign id, ad group id, ad id). */
    entityId: string
    dateRange: { startDate: string; endDate: string } // 'YYYY-MM-DD'
  },
): Promise<DailyInsightRow[]> {
  const { from, where } = fromResourceField(args.level)
  const query = `
    SELECT ${FIELDS.join(', ')}
    FROM ${from}
    WHERE ${where} = ${args.entityId}
      AND segments.date BETWEEN '${args.dateRange.startDate}' AND '${args.dateRange.endDate}'
    ORDER BY segments.date ASC
  `
    .trim()
    .replace(/\s+/g, ' ')

  const url = `${GOOGLE_ADS_API_BASE_URL}/customers/${args.customerId}/googleAds:searchStream`
  const res = await fetch(url, {
    method: 'POST',
    headers: buildHeaders(args),
    body: JSON.stringify({ query }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Google Ads insights search failed: HTTP ${res.status} — ${text}`)
  }

  // `:searchStream` may return either:
  //   • a single JSON object  → { results: [...] }
  //   • an array of chunks    → [{ results: [...] }, { results: [...] }, ...]
  const data = (await res.json()) as unknown
  const chunks: Array<{ results?: Array<unknown> }> = Array.isArray(data)
    ? (data as Array<{ results?: Array<unknown> }>)
    : [data as { results?: Array<unknown> }]

  const rows: DailyInsightRow[] = []
  for (const chunk of chunks) {
    for (const row of chunk.results ?? []) {
      const r = row as {
        segments?: { date?: string }
        metrics?: Record<string, unknown>
      }
      const date = r.segments?.date
      if (!date) continue

      const costMicros = Number(r.metrics?.cost_micros ?? 0)
      const ad_spend = costMicros / 1_000_000
      const impressions = Number(r.metrics?.impressions ?? 0)
      const clicks = Number(r.metrics?.clicks ?? 0)
      const conversions = Number(r.metrics?.conversions ?? 0)
      const conversions_value = Number(r.metrics?.conversions_value ?? 0)
      const ctr = Number(r.metrics?.ctr ?? 0)
      const averageCpcMicros = Number(r.metrics?.average_cpc ?? 0)
      const cpc = averageCpcMicros / 1_000_000
      const roas = ad_spend > 0 ? conversions_value / ad_spend : 0

      rows.push({ date, ad_spend, impressions, clicks, conversions, conversions_value, ctr, cpc, roas })
    }
  }
  return rows
}
