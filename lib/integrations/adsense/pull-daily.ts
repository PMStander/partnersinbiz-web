// lib/integrations/adsense/pull-daily.ts
//
// Daily AdSense report → metrics pipeline. Called by the dispatcher once
// per day per connected property.
//
// Behavior:
//   1. Resolve property timezone + currency (defaults: UTC, USD).
//   2. Pick the date window — yesterday in property tz, or the override
//      passed by an admin-triggered backfill.
//   3. Discover the AdSense account name (cached on connection.meta).
//   4. Hit Reports:generate for the chosen window.
//   5. Map each row's metric cells → MetricInput rows and persist via
//      writeMetrics.
//
// This function NEVER throws on expected failures (no env, missing creds,
// 4xx responses, empty reports). It returns a `PullResult` with a `notes`
// array describing what happened so the dispatcher and admin UI can react.

import type {
  Connection,
  PullResult,
  MetricRowDraft,
} from '@/lib/integrations/types'
import type { MetricInput, MetricKind } from '@/lib/metrics/types'
import { writeMetrics } from '@/lib/metrics/write'
import { adminDb } from '@/lib/firebase/admin'
import type { Property } from '@/lib/properties/types'
import { upsertConnection } from '@/lib/integrations/connections'
import { createAdsenseClient } from './client'
import { discoverPrimaryAccount, ADSENSE_SCOPES } from './oauth'
import {
  ADSENSE_METRICS_ORDER,
  type AdsenseMetricName,
  type AdsenseReportResponse,
  type AdsenseConnectionMeta,
} from './schema'

/* Public entry point ──────────────────────────────────────────────── */

export interface PullDailyInput {
  connection: Connection
  window?: { from: string; to: string }
  /**
   * Test seam — defaults to current Date. Tests pass a fixed clock so
   * yesterday-in-tz computation is deterministic.
   */
  now?: () => Date
  /** Test seam — override the property fetcher. */
  fetchProperty?: (propertyId: string) => Promise<Property | null>
}

export async function pullDaily(input: PullDailyInput): Promise<PullResult> {
  const now = input.now ?? (() => new Date())
  const notes: string[] = []

  // 1. Resolve property config (currency + tz + adsenseClientId).
  const property = await (input.fetchProperty
    ? input.fetchProperty(input.connection.propertyId)
    : fetchProperty(input.connection.propertyId))
  const tz = property?.config?.revenue?.timezone ?? 'UTC'
  const currency = (property?.config?.revenue?.currency ?? 'USD') as
    | MetricInput['currency']
    | 'USD'
  const adsenseClientId = property?.config?.revenue?.adsenseClientId
  const siteUrl = property?.config?.siteUrl

  // 2. Date window — yesterday-in-tz unless an explicit override window is
  //    passed (used for backfill).
  const window = input.window ?? defaultDailyWindow(tz, now())

  // 3. Build authenticated client.
  const clientOrError = await createAdsenseClient({ connection: input.connection })
  if ('error' in clientOrError) {
    notes.push(`adsense: ${clientOrError.error}: ${clientOrError.message}`)
    return { from: window.from, to: window.to, metricsWritten: 0, notes }
  }
  const client = clientOrError

  // 4. Resolve accountName (cache on connection.meta if not yet set).
  let accountName = client.accountName
  if (!accountName) {
    const meta = (input.connection.meta ?? {}) as AdsenseConnectionMeta
    accountName = meta.accountName ?? null
  }
  if (!accountName) {
    // Use the access token already on the client by piggy-backing on a GET.
    const listed = await client.get<{
      accounts?: Array<{ name: string; state?: string }>
    }>('/accounts')
    if (!listed.ok || !listed.data.accounts?.length) {
      notes.push('adsense: failed to discover account name')
      return { from: window.from, to: window.to, metricsWritten: 0, notes }
    }
    const ready = listed.data.accounts.find((a) => a.state === 'READY')
    accountName = (ready ?? listed.data.accounts[0]).name
    // Cache it so future pulls skip the discovery call.
    await cacheAccountName(input.connection, accountName)
    // Best-effort log.
    notes.push(`adsense: cached accountName=${accountName}`)
  }

  // 5. Build report request.
  const reportPath = `/${accountName}/reports:generate`
  const filters: string[] = []
  // If property has a configured site domain, filter to that domain so a
  // multi-site account doesn't double-count revenue across properties.
  if (adsenseClientId && siteUrl) {
    const host = extractHost(siteUrl)
    if (host) filters.push(`DOMAIN_NAME==${host}`)
  }

  const startParts = parseDate(window.from)
  const endParts = parseDate(window.to)
  if (!startParts || !endParts) {
    notes.push('adsense: invalid window dates')
    return { from: window.from, to: window.to, metricsWritten: 0, notes }
  }

  const result = await client.get<AdsenseReportResponse>(reportPath, {
    dateRange: 'CUSTOM',
    'startDate.year': startParts.year,
    'startDate.month': startParts.month,
    'startDate.day': startParts.day,
    'endDate.year': endParts.year,
    'endDate.month': endParts.month,
    'endDate.day': endParts.day,
    dimensions: ['DATE'],
    metrics: [...ADSENSE_METRICS_ORDER],
    currencyCode: typeof currency === 'string' ? currency : 'USD',
    filters: filters.length ? filters : undefined,
  })

  if (!result.ok) {
    notes.push(`adsense: report failed (${result.status}): ${result.reason}`)
    return { from: window.from, to: window.to, metricsWritten: 0, notes }
  }

  // 6. Map → MetricInput rows.
  const drafts = mapReportToDrafts({
    report: result.data,
    metricsOrder: [...ADSENSE_METRICS_ORDER],
    currency: typeof currency === 'string' ? currency : 'USD',
    fallbackDate: window.to,
  })

  if (drafts.length === 0) {
    notes.push('adsense: report contained no rows')
    return { from: window.from, to: window.to, metricsWritten: 0, notes }
  }

  const rows: MetricInput[] = drafts.map((d) => ({
    orgId: input.connection.orgId,
    propertyId: input.connection.propertyId,
    date: d.date,
    source: 'adsense',
    metric: d.metric,
    value: d.value,
    currency: d.currency ?? null,
    dimension: d.dimension ?? null,
    dimensionValue: d.dimensionValue ?? null,
    raw: d.raw ?? null,
  }))

  const { written } = await writeMetrics(rows, { ingestedBy: 'cron' })

  return {
    from: window.from,
    to: window.to,
    metricsWritten: written,
    notes: notes.length ? notes : undefined,
  }
}

/* Pure helpers (exported for tests) ────────────────────────────────── */

/**
 * Compute the default daily window — yesterday in the given IANA timezone.
 * Both `from` and `to` end up the same day. We use Intl rather than any
 * date library so we don't have to ship moment/luxon.
 */
export function defaultDailyWindow(
  timezone: string,
  now: Date,
): { from: string; to: string } {
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const date = formatYmdInTz(yesterday, timezone)
  return { from: date, to: date }
}

export function formatYmdInTz(date: Date, timezone: string): string {
  // en-CA produces YYYY-MM-DD natively.
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date)
    // en-CA gives "2026-04-25" which is exactly what we want.
    return parts
  } catch {
    // Bad timezone — fall back to UTC.
    return date.toISOString().slice(0, 10)
  }
}

export function parseDate(
  ymd: string,
): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd)
  if (!m) return null
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) }
}

export function extractHost(url: string): string | null {
  try {
    return new URL(url).host.toLowerCase()
  } catch {
    // Tolerate bare hosts e.g. "example.com".
    if (/^[a-z0-9.-]+$/i.test(url)) return url.toLowerCase()
    return null
  }
}

/**
 * Map an AdSense report response → metric drafts. Each row's first cell is
 * the DATE dimension; the remaining cells map 1:1 to `metricsOrder`.
 *
 * Falls back to `fallbackDate` when a row's DATE cell is empty/malformed
 * (rare, but easier than dropping rows silently).
 */
export function mapReportToDrafts(input: {
  report: AdsenseReportResponse
  metricsOrder: AdsenseMetricName[]
  currency: string
  fallbackDate: string
}): MetricRowDraft[] {
  const drafts: MetricRowDraft[] = []
  const rows = input.report.rows ?? []

  for (const row of rows) {
    const cells = row.cells ?? []
    if (cells.length === 0) continue

    // First cell is DATE dimension. AdSense returns it as YYYY-MM-DD.
    const rawDate = cells[0]?.value ?? ''
    const date = isYmd(rawDate) ? rawDate : input.fallbackDate

    for (let i = 0; i < input.metricsOrder.length; i += 1) {
      const cell = cells[i + 1]
      if (!cell || cell.value === undefined || cell.value === '') continue
      const value = Number(cell.value)
      if (!Number.isFinite(value)) continue
      const adsenseMetric = input.metricsOrder[i]
      const mapped = mapAdsenseMetric(adsenseMetric)
      if (!mapped) continue
      drafts.push({
        date,
        metric: mapped.metric,
        value,
        currency: mapped.hasCurrency ? coerceCurrency(input.currency) : undefined,
        raw: { source: 'adsense', column: adsenseMetric },
      })
    }
  }

  return drafts
}

/**
 * Map an AdSense metric column → our canonical MetricKind. Returns null
 * when we deliberately don't track the column (e.g. CPC — covered by
 * `cpc` in MetricKind but we don't emit it from AdSense reports).
 */
function mapAdsenseMetric(
  name: AdsenseMetricName,
): { metric: MetricKind; hasCurrency: boolean } | null {
  switch (name) {
    case 'ESTIMATED_EARNINGS':
      return { metric: 'ad_revenue', hasCurrency: true }
    case 'IMPRESSIONS':
      return { metric: 'impressions', hasCurrency: false }
    case 'CLICKS':
      return { metric: 'clicks', hasCurrency: false }
    case 'CTR':
      return { metric: 'ctr', hasCurrency: false }
    case 'IMPRESSIONS_RPM':
      // IMPRESSIONS_RPM is a currency-typed value (per 1000 impressions).
      // We track it without currency on the metric row to keep `rpm` shape
      // consistent across providers; raw cell preserves the dollar amount.
      return { metric: 'rpm', hasCurrency: true }
    case 'AD_REQUESTS':
      return { metric: 'ad_requests', hasCurrency: false }
    case 'COST_PER_CLICK':
      // CPC isn't reported as a metric kind we emit here — AdSense CPC is
      // an average derived from ESTIMATED_EARNINGS / CLICKS, so skip it.
      return null
    default:
      return null
  }
}

function coerceCurrency(currency: string): MetricInput['currency'] {
  const upper = currency.toUpperCase()
  switch (upper) {
    case 'ZAR':
    case 'USD':
    case 'EUR':
    case 'GBP':
    case 'AUD':
    case 'CAD':
    case 'NZD':
    case 'JPY':
      return upper
    default:
      return 'USD'
  }
}

function isYmd(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

/* Wiring helpers ─────────────────────────────────────────────────── */

async function fetchProperty(propertyId: string): Promise<Property | null> {
  try {
    const snap = await adminDb.collection('properties').doc(propertyId).get()
    if (!snap.exists) return null
    return { id: snap.id, ...(snap.data() as Omit<Property, 'id'>) }
  } catch {
    return null
  }
}

/**
 * Persist accountName on the connection so future pulls skip the
 * `/accounts` discovery call.
 */
async function cacheAccountName(
  connection: Connection,
  accountName: string,
): Promise<void> {
  const nextMeta: AdsenseConnectionMeta = {
    ...((connection.meta ?? {}) as AdsenseConnectionMeta),
    accountName,
    publisherId: accountName.replace(/^accounts\//, ''),
  }
  // We intentionally do not pass `credentials` so existing ones are kept.
  await upsertConnection({
    propertyId: connection.propertyId,
    orgId: connection.orgId,
    provider: 'adsense',
    authKind: 'oauth2',
    meta: nextMeta as Record<string, unknown>,
    scope: connection.scope.length ? connection.scope : [...ADSENSE_SCOPES],
    status: connection.status === 'reauth_required' ? 'reauth_required' : 'connected',
    createdBy: connection.createdBy ?? 'system',
    createdByType: connection.createdByType ?? 'system',
  })
}
