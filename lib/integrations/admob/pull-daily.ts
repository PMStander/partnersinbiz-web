// lib/integrations/admob/pull-daily.ts
//
// Daily pull for AdMob. Default window = "yesterday" in the property's tz.
// Optional backfill window can be provided.
//
// What we write to `metrics`:
//   - ad_revenue (currency-denominated, source='admob')
//   - impressions
//   - clicks
//   - match_rate
//   - ecpm
//   - ad_requests
//   - ctr (impression CTR)
//
// If `Property.config.revenue.admobAppId` is set, we additionally request a
// per-app report (DATE x APP) filtered to that app id and write rows tagged
// with `dimension: 'app'`, `dimensionValue: <admobAppId>`.

import { adminDb } from '@/lib/firebase/admin'
import { writeMetrics } from '@/lib/metrics/write'
import type { MetricInput, MetricCurrency, MetricKind } from '@/lib/metrics/types'
import type { Connection, PullResult } from '@/lib/integrations/types'
import type { Property } from '@/lib/properties/types'
import {
  getAuthForConnection,
  generateNetworkReport,
  decodeMetricValue,
} from './client'
import type {
  AdMobConnectionMeta,
  AdMobDate,
  AdMobMetric,
  AdMobReportRow,
  NetworkReportRequest,
} from './schema'

/* ──────────────────────────────────────────────────────────────────────────
 * Date helpers — keep these self-contained, no external dep.
 * ────────────────────────────────────────────────────────────────────────── */

/** Parse 'YYYY-MM-DD' into AdMob's {year, month, day} object. */
function toAdMobDate(iso: string): AdMobDate {
  const [y, m, d] = iso.split('-').map((s) => Number(s))
  return { year: y, month: m, day: d }
}

/**
 * Today's date in `YYYY-MM-DD` for an IANA timezone. If `tz` is absent or
 * invalid, falls back to the host clock in UTC.
 */
function todayInTz(tz?: string): string {
  const now = new Date()
  if (!tz) return now.toISOString().slice(0, 10)
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    // 'en-CA' formats as YYYY-MM-DD by default.
    return fmt.format(now)
  } catch {
    return now.toISOString().slice(0, 10)
  }
}

/** Subtract one day from a 'YYYY-MM-DD' date string. */
function previousDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

/* ──────────────────────────────────────────────────────────────────────────
 * Property fetch (we don't have a project-level helper yet, so do it inline).
 * ────────────────────────────────────────────────────────────────────────── */

async function fetchProperty(propertyId: string): Promise<Property | null> {
  const snap = await adminDb.collection('properties').doc(propertyId).get()
  if (!snap.exists) return null
  return { id: snap.id, ...(snap.data() as Omit<Property, 'id'>) }
}

/* ──────────────────────────────────────────────────────────────────────────
 * Save refreshed credentials back to Firestore (best-effort).
 * ────────────────────────────────────────────────────────────────────────── */

async function persistRefreshedCredentials(
  connection: Connection,
  credentialsEnc: Connection['credentialsEnc'],
): Promise<void> {
  if (!credentialsEnc) return
  await adminDb
    .collection('properties')
    .doc(connection.propertyId)
    .collection('connections')
    .doc(connection.provider)
    .update({ credentialsEnc })
    .catch(() => {
      // Non-fatal — at worst we'll refresh again on next pull.
    })
}

/* ──────────────────────────────────────────────────────────────────────────
 * Mapping AdMob metric names -> internal MetricKind.
 *
 * AdMob's `MATCH_RATE`, `IMPRESSION_CTR`, and `SHOW_RATE` are doubles in 0..1.
 * We pass them through unchanged (consumers can scale to percentages later).
 * ────────────────────────────────────────────────────────────────────────── */

const METRIC_MAP: Array<{
  api: AdMobMetric
  kind: MetricKind
  /** Currency-denominated metrics — we copy `currency` through. */
  isMoney?: boolean
}> = [
  { api: 'ESTIMATED_EARNINGS', kind: 'ad_revenue', isMoney: true },
  { api: 'IMPRESSIONS', kind: 'impressions' },
  { api: 'CLICKS', kind: 'clicks' },
  { api: 'MATCH_RATE', kind: 'match_rate' },
  { api: 'OBSERVED_ECPM', kind: 'ecpm', isMoney: true },
  { api: 'AD_REQUESTS', kind: 'ad_requests' },
  { api: 'IMPRESSION_CTR', kind: 'ctr' },
]

/* ──────────────────────────────────────────────────────────────────────────
 * Build a network-report request body for the date range and optional app.
 * ────────────────────────────────────────────────────────────────────────── */

function buildReportRequest(input: {
  from: string
  to: string
  currency: MetricCurrency
  timezone?: string
  /** If set, adds DATE+APP dimensions and filters to this app id. */
  admobAppId?: string
}): NetworkReportRequest {
  const dimensions: NetworkReportRequest['reportSpec']['dimensions'] = ['DATE']
  if (input.admobAppId) dimensions.push('APP')

  const reportSpec: NetworkReportRequest['reportSpec'] = {
    dateRange: {
      startDate: toAdMobDate(input.from),
      endDate: toAdMobDate(input.to),
    },
    dimensions,
    metrics: METRIC_MAP.map((m) => m.api),
    localizationSettings: { currencyCode: input.currency },
  }
  if (input.timezone) reportSpec.timeZone = input.timezone
  if (input.admobAppId) {
    reportSpec.dimensionFilters = [
      { dimension: 'APP', matchesAny: { values: [input.admobAppId] } },
    ]
  }
  return { reportSpec }
}

/* ──────────────────────────────────────────────────────────────────────────
 * Convert AdMob report rows -> MetricInput[].
 *
 * `dimension` and `dimensionValue` are non-null only for the per-app rows.
 * ────────────────────────────────────────────────────────────────────────── */

function rowsToMetrics(input: {
  rows: AdMobReportRow[]
  orgId: string
  propertyId: string
  currency: MetricCurrency
  /** When set, every emitted row is tagged with this dimension/value. */
  dimension?: string
  dimensionValue?: string
}): MetricInput[] {
  const out: MetricInput[] = []
  for (const r of input.rows) {
    const row = r.row
    if (!row) continue
    const date = row.dimensionValues?.DATE?.value
    if (!date || !/^\d{8}$/.test(date)) continue // AdMob returns YYYYMMDD
    const iso = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`

    for (const m of METRIC_MAP) {
      const v = row.metricValues?.[m.api]
      if (!v) continue
      const value = decodeMetricValue(v)
      out.push({
        orgId: input.orgId,
        propertyId: input.propertyId,
        date: iso,
        source: 'admob',
        metric: m.kind,
        value,
        currency: m.isMoney ? input.currency : null,
        dimension: input.dimension ?? null,
        dimensionValue: input.dimensionValue ?? null,
        raw: { metric: m.api, dimensionValues: row.dimensionValues },
      })
    }
  }
  return out
}

/* ──────────────────────────────────────────────────────────────────────────
 * Main entry — what the adapter exports as `pullDaily`.
 * Never throws on missing credentials/account; returns notes instead.
 * ────────────────────────────────────────────────────────────────────────── */

export async function pullDaily(input: {
  connection: Connection
  window?: { from: string; to: string }
}): Promise<PullResult> {
  const { connection } = input
  const notes: string[] = []

  const meta = (connection.meta ?? {}) as AdMobConnectionMeta
  const property = await fetchProperty(connection.propertyId).catch(() => null)
  const tz = property?.config?.revenue?.timezone
  const currency = (property?.config?.revenue?.currency ?? 'USD') as MetricCurrency
  const admobAppId = property?.config?.revenue?.admobAppId

  // Default window: yesterday in property tz, both ends inclusive.
  const yesterday = previousDay(todayInTz(tz))
  const from = input.window?.from ?? yesterday
  const to = input.window?.to ?? yesterday

  // Guard: missing credentials.
  if (!connection.credentialsEnc) {
    notes.push('No credentials on connection — skipping pull.')
    return { from, to, metricsWritten: 0, notes }
  }

  // Guard: missing account name on connection meta.
  if (!meta.accountName) {
    notes.push('connection.meta.accountName is missing — connect AdMob via OAuth first.')
    return { from, to, metricsWritten: 0, notes }
  }

  // Resolve / refresh access token.
  let accessToken: string
  try {
    const auth = await getAuthForConnection(connection)
    if (!auth) {
      notes.push('Decryption returned no credentials — re-auth required.')
      return { from, to, metricsWritten: 0, notes }
    }
    accessToken = auth.accessToken
    if (auth.refreshed) {
      await persistRefreshedCredentials(connection, auth.credentialsEnc)
      notes.push('Refreshed access token.')
    }
  } catch (err) {
    notes.push(`Auth failure: ${err instanceof Error ? err.message : String(err)}`)
    return { from, to, metricsWritten: 0, notes }
  }

  // 1) Account-wide network report.
  let metrics: MetricInput[] = []
  try {
    const body = buildReportRequest({ from, to, currency, timezone: tz })
    const rows = await generateNetworkReport({
      accessToken,
      accountName: meta.accountName,
      body,
    })
    metrics = metrics.concat(
      rowsToMetrics({
        rows,
        orgId: connection.orgId,
        propertyId: connection.propertyId,
        currency,
      }),
    )
  } catch (err) {
    notes.push(
      `Account report failed: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  // 2) Optional per-app breakdown.
  if (admobAppId) {
    try {
      const body = buildReportRequest({
        from,
        to,
        currency,
        timezone: tz,
        admobAppId,
      })
      const rows = await generateNetworkReport({
        accessToken,
        accountName: meta.accountName,
        body,
      })
      metrics = metrics.concat(
        rowsToMetrics({
          rows,
          orgId: connection.orgId,
          propertyId: connection.propertyId,
          currency,
          dimension: 'app',
          dimensionValue: admobAppId,
        }),
      )
    } catch (err) {
      notes.push(
        `App-level report failed: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  if (metrics.length === 0) {
    return { from, to, metricsWritten: 0, notes }
  }

  const { written } = await writeMetrics(metrics, { ingestedBy: 'cron' })
  return { from, to, metricsWritten: written, notes }
}
