// lib/integrations/play_console/pull-daily.ts
//
// Daily pull for Google Play Console: pulls yesterday's installs, uninstalls,
// IAP revenue, subscription revenue, and rating metrics for the property's
// `playPackageName` and writes them through writeMetrics.
//
// The adapter NEVER throws on missing credentials, missing config, or any
// expected 4xx from the Play Reporting API. In those cases it returns
// `{ metricsWritten: 0, notes: [...] }` so the dispatcher records a soft skip.
//
// Play Reporting API quirks:
//   - Data is eventually consistent — yesterday's row may not be available
//     until ~24-36h after the day closes. We pull D-2 by default to give
//     the API time to settle.
//   - `financialMetricSet` requires "View financial data" on the SA; absent
//     that, the endpoint 403s and we skip with a note.
//   - `ratingsMetricSet` is in beta — 404 on some apps; soft-fail.
//   - Currency is per-row in the moneyValue envelope; we honour it.

import { adminDb } from '@/lib/firebase/admin'
import { writeMetrics } from '@/lib/metrics/write'
import type { Connection, PullResult } from '@/lib/integrations/types'
import { maybeDecryptCredentials } from '@/lib/integrations/crypto'
import type { Property } from '@/lib/properties/types'
import type { MetricCurrency, MetricInput, MetricKind } from '@/lib/metrics/types'
import {
  createPlayClient,
  PlayApiError,
  type PlayClient,
} from './client'
import { parseServiceAccountJson } from './auth'
import {
  PLAY_FINANCIAL_METRICS,
  PLAY_INSTALLS_METRICS,
  type PlayCredentials,
  type PlayMetricRow,
  type PlayMetricValue,
  type PlayMetricsQueryRequest,
  type PlayMetricsQueryResponse,
} from './schema'

/** Map Play Reporting metric column → MetricKind. */
const METRIC_NAME_MAP: Record<string, MetricKind> = {
  // installs metric set
  activeDevices: 'sessions_app', // closest analog — daily 'active devices' isn't a true session
  dailyDeviceInstalls: 'installs',
  dailyDeviceUninstalls: 'uninstalls',
  // financial metric set
  revenueIap: 'iap_revenue',
  revenueSubscriptions: 'subscription_revenue',
  // ratings metric set
  averageRating: 'ratings_avg',
}

/** Metrics that carry a currency. */
const CURRENCY_METRICS: Set<MetricKind> = new Set([
  'iap_revenue',
  'subscription_revenue',
])

/** Lazily fetched property — cached per call. */
async function getPropertyForConnection(
  connection: Connection,
): Promise<Property | null> {
  try {
    const snap = await adminDb
      .collection('properties')
      .doc(connection.propertyId)
      .get()
    if (!snap.exists) return null
    return { id: snap.id, ...(snap.data() as Omit<Property, 'id'>) }
  } catch {
    return null
  }
}

/**
 * Compute the YYYY-MM-DD that represents "two days ago" relative to now in
 * the given IANA timezone. We pull D-2 instead of D-1 because the Reporting
 * API takes up to 36h to finalise yesterday's totals.
 */
export function targetDateInTimezone(
  now: Date,
  timezone: string | undefined,
  daysBack = 2,
): string {
  const tz = timezone && timezone.length > 0 ? timezone : 'UTC'
  let todayStr: string
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    todayStr = fmt.format(now)
  } catch {
    todayStr = now.toISOString().slice(0, 10)
  }
  const [y, m, d] = todayStr.split('-').map((s) => parseInt(s, 10))
  const ms = Date.UTC(y, m - 1, d) - daysBack * 24 * 60 * 60 * 1000
  return new Date(ms).toISOString().slice(0, 10)
}

/** Build the {year, month, day} envelope the Reporting API expects. */
function dateToPlayDateTime(
  yyyymmdd: string,
  timezone: string | undefined,
): { year: number; month: number; day: number; timeZone: { id: string } } {
  const [y, m, d] = yyyymmdd.split('-').map((s) => parseInt(s, 10))
  return {
    year: y,
    month: m,
    day: d,
    timeZone: { id: timezone && timezone.length > 0 ? timezone : 'UTC' },
  }
}

/** Map [from, to] string range → request body for installsMetricSet:query. */
function buildInstallsRequest(input: {
  from: string
  to: string
  timezone: string | undefined
}): PlayMetricsQueryRequest {
  return {
    timelineSpec: {
      aggregationPeriod: 'DAILY',
      startTime: dateToPlayDateTime(input.from, input.timezone),
      endTime: dateToPlayDateTime(input.to, input.timezone),
    },
    dimensions: [],
    metrics: [...PLAY_INSTALLS_METRICS],
  }
}

function buildFinancialRequest(input: {
  from: string
  to: string
  timezone: string | undefined
}): PlayMetricsQueryRequest {
  return {
    timelineSpec: {
      aggregationPeriod: 'DAILY',
      startTime: dateToPlayDateTime(input.from, input.timezone),
      endTime: dateToPlayDateTime(input.to, input.timezone),
    },
    dimensions: [],
    metrics: [...PLAY_FINANCIAL_METRICS],
  }
}

function buildRatingsRequest(input: {
  from: string
  to: string
  timezone: string | undefined
}): PlayMetricsQueryRequest {
  return {
    timelineSpec: {
      aggregationPeriod: 'DAILY',
      startTime: dateToPlayDateTime(input.from, input.timezone),
      endTime: dateToPlayDateTime(input.to, input.timezone),
    },
    dimensions: [],
    metrics: ['averageRating'],
  }
}

/** Recover the date string from a Play API row's startTime envelope. */
function rowDate(row: PlayMetricRow, fallback: string): string {
  const s = row.startTime
  if (!s || s.year == null || s.month == null || s.day == null) return fallback
  const m = String(s.month).padStart(2, '0')
  const d = String(s.day).padStart(2, '0')
  return `${s.year}-${m}-${d}`
}

/** Coerce a Play metric value envelope to a finite number. */
function metricValue(value: PlayMetricValue): number | null {
  if (!value) return null
  if (value.decimalValue?.value != null) {
    const n = Number(value.decimalValue.value)
    return Number.isFinite(n) ? n : null
  }
  if (typeof value.doubleValue?.value === 'number') {
    return Number.isFinite(value.doubleValue.value) ? value.doubleValue.value : null
  }
  if (value.int64Value != null) {
    const n = Number(value.int64Value)
    return Number.isFinite(n) ? n : null
  }
  if (value.moneyValue) {
    const units = value.moneyValue.units != null ? Number(value.moneyValue.units) : 0
    const nanos = value.moneyValue.nanos ?? 0
    const total = units + nanos / 1e9
    return Number.isFinite(total) ? total : null
  }
  return null
}

/** Pull the per-row currency code from a moneyValue envelope, if any. */
function metricCurrency(value: PlayMetricValue): string | null {
  if (!value) return null
  return value.moneyValue?.currencyCode ?? null
}

/** Convert a raw Play API response into MetricInput rows. */
function rowsFromResponse(input: {
  payload: PlayMetricsQueryResponse
  connection: Connection
  fallbackDate: string
  fallbackCurrency: MetricCurrency
  packageName: string
  source: 'play_store'
  endpoint: string
}): MetricInput[] {
  const rows = input.payload.rows ?? []
  const out: MetricInput[] = []
  for (const r of rows) {
    const dateStr = rowDate(r, input.fallbackDate)
    const metrics = r.metrics ?? []
    for (const m of metrics) {
      const kind = METRIC_NAME_MAP[m.metric]
      if (!kind) continue
      const value = metricValue(m)
      if (value == null) continue

      let currency: MetricCurrency | null = null
      if (CURRENCY_METRICS.has(kind)) {
        const code = (metricCurrency(m) ?? input.fallbackCurrency).toUpperCase()
        if (
          code === 'ZAR' || code === 'USD' || code === 'EUR' || code === 'GBP' ||
          code === 'AUD' || code === 'CAD' || code === 'NZD' || code === 'JPY'
        ) {
          currency = code as MetricCurrency
        } else {
          currency = input.fallbackCurrency
        }
      }

      out.push({
        orgId: input.connection.orgId,
        propertyId: input.connection.propertyId,
        date: dateStr,
        source: input.source,
        metric: kind,
        value,
        currency,
        dimension: 'package',
        dimensionValue: input.packageName,
        raw: {
          provider: 'play_console',
          endpoint: input.endpoint,
          metricColumn: m.metric,
          row: r,
        },
      })
    }
  }
  return out
}

interface PullDailyDeps {
  /** Override for tests — ignored in prod. */
  client?: PlayClient
  /** Stable "now" for tests. */
  now?: Date
  /** Override property loader — for tests. */
  loadProperty?: (connection: Connection) => Promise<Property | null>
  /** Override the metrics writer — for tests. */
  writeMetrics?: typeof writeMetrics
}

/**
 * Pull daily metrics for a Play Console connection. Returns a PullResult
 * with the number of metric rows written. Soft-fails (returns 0 written)
 * for any recoverable error.
 */
export async function pullDaily(
  input: { connection: Connection; window?: { from: string; to: string } },
  deps: PullDailyDeps = {},
): Promise<PullResult> {
  const { connection } = input
  const now = deps.now ?? new Date()
  const writer = deps.writeMetrics ?? writeMetrics

  // 1. Decrypt credentials (soft-fail if missing).
  const creds = maybeDecryptCredentials<PlayCredentials>(
    connection.credentialsEnc,
    connection.orgId,
  )
  if (!creds || !creds.serviceAccountJson) {
    return {
      from: '',
      to: '',
      metricsWritten: 0,
      notes: ['No Play Console service-account credentials on connection — skipping pull.'],
    }
  }

  // 2. Parse the service account JSON (soft-fail on bad shape).
  let key: PlayCredentials['key']
  try {
    key = creds.key ?? parseServiceAccountJson(creds.serviceAccountJson)
  } catch (err) {
    return {
      from: '',
      to: '',
      metricsWritten: 0,
      notes: [
        `Could not parse Play service-account JSON: ${err instanceof Error ? err.message : String(err)}`,
      ],
    }
  }

  // 3. Resolve packageName (Property.config.revenue.playPackageName, then meta).
  const property = deps.loadProperty
    ? await deps.loadProperty(connection)
    : await getPropertyForConnection(connection)
  const revCfg = property?.config?.revenue ?? {}
  const packageName =
    revCfg.playPackageName ?? (connection.meta?.packageName as string | undefined)

  if (!packageName) {
    return {
      from: '',
      to: '',
      metricsWritten: 0,
      notes: [
        'No Play packageName resolved (set Property.config.revenue.playPackageName).',
      ],
    }
  }

  // 4. Window resolution: window override > D-2 in property tz.
  const fallbackCurrency: MetricCurrency =
    (revCfg.currency as MetricCurrency | undefined) ?? 'USD'
  const target = targetDateInTimezone(now, revCfg.timezone)
  const from = input.window?.from ?? target
  const to = input.window?.to ?? target

  const client =
    deps.client ?? createPlayClient({ key, cacheKey: connection.id })

  const allRows: MetricInput[] = []
  const notes: string[] = []

  // 5. Installs metric set — required.
  try {
    const installs = await client.queryInstallsMetrics({
      packageName,
      body: buildInstallsRequest({ from, to, timezone: revCfg.timezone }),
    })
    allRows.push(
      ...rowsFromResponse({
        payload: installs,
        connection,
        fallbackDate: to,
        fallbackCurrency,
        packageName,
        source: 'play_store',
        endpoint: 'v1beta1/installsMetricSet:query',
      }),
    )
  } catch (err) {
    if (err instanceof PlayApiError && err.status >= 400 && err.status < 500) {
      notes.push(
        `Play installsMetricSet:query returned ${err.status} — check service-account permissions for ${packageName}.`,
      )
    } else {
      throw err
    }
  }

  // 6. Financial metric set — optional (requires Financial Data role).
  try {
    const financial = await client.queryFinancialMetrics({
      packageName,
      body: buildFinancialRequest({ from, to, timezone: revCfg.timezone }),
    })
    allRows.push(
      ...rowsFromResponse({
        payload: financial,
        connection,
        fallbackDate: to,
        fallbackCurrency,
        packageName,
        source: 'play_store',
        endpoint: 'v1beta1/financialMetricSet:query',
      }),
    )
  } catch (err) {
    if (err instanceof PlayApiError && err.status >= 400 && err.status < 500) {
      notes.push(
        `Play financialMetricSet:query returned ${err.status} — service account may lack 'View financial data' role; skipping IAP/sub revenue.`,
      )
    } else {
      throw err
    }
  }

  // 7. Ratings metric set — optional, in beta.
  try {
    const ratings = await client.queryRatingsMetrics({
      packageName,
      body: buildRatingsRequest({ from, to, timezone: revCfg.timezone }),
    })
    allRows.push(
      ...rowsFromResponse({
        payload: ratings,
        connection,
        fallbackDate: to,
        fallbackCurrency,
        packageName,
        source: 'play_store',
        endpoint: 'v1beta1/ratingsMetricSet:query',
      }),
    )
  } catch (err) {
    if (err instanceof PlayApiError && err.status >= 400 && err.status < 500) {
      notes.push(
        `Play ratingsMetricSet:query returned ${err.status} — endpoint not available for this app; skipping ratings.`,
      )
    } else {
      throw err
    }
  }

  if (allRows.length === 0) {
    return {
      from,
      to,
      metricsWritten: 0,
      notes: notes.length > 0
        ? notes
        : ['Play Reporting API returned no mappable metrics for this window.'],
    }
  }

  const { written } = await writer(allRows, { ingestedBy: 'cron' })
  return {
    from,
    to,
    metricsWritten: written,
    notes: notes.length > 0 ? notes : undefined,
  }
}
