// lib/ads/providers/meta/insights.ts
import { META_GRAPH_BASE } from './constants'

export type InsightLevel = 'campaign' | 'adset' | 'ad'

export interface MetaInsightRow {
  date_start: string // YYYY-MM-DD
  date_stop: string
  spend?: string // Meta returns as strings
  impressions?: string
  clicks?: string
  ctr?: string // e.g. "1.234" (percent as decimal)
  cpc?: string
  cpm?: string
  actions?: Array<{ action_type: string; value: string }>
  action_values?: Array<{ action_type: string; value: string }>
}

const INSIGHT_FIELDS = [
  'spend',
  'impressions',
  'clicks',
  'ctr',
  'cpc',
  'cpm',
  'actions',
  'action_values',
].join(',')

export async function fetchInsights(args: {
  metaObjectId: string // campaign/adset/ad ID
  accessToken: string
  since: string // 'YYYY-MM-DD'
  until: string // 'YYYY-MM-DD'
  level?: InsightLevel // optional, defaults to Meta's auto
}): Promise<{ data: MetaInsightRow[] }> {
  const url = new URL(`${META_GRAPH_BASE}/${args.metaObjectId}/insights`)
  url.searchParams.set('fields', INSIGHT_FIELDS)
  url.searchParams.set('time_range', JSON.stringify({ since: args.since, until: args.until }))
  if (args.level) url.searchParams.set('level', args.level)
  url.searchParams.set('access_token', args.accessToken)
  const res = await fetch(url.toString())
  const body = await res.json()
  if (!res.ok || (body && typeof body === 'object' && 'error' in body)) {
    const msg = (body as { error?: { message?: string } }).error?.message ?? `HTTP ${res.status}`
    throw new Error(`Meta /insights failed: ${msg}`)
  }
  return { data: (body as { data?: MetaInsightRow[] }).data ?? [] }
}
