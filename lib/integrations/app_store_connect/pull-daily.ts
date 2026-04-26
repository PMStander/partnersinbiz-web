// lib/integrations/app_store_connect/pull-daily.ts
//
// Daily pull for the App Store Connect adapter.
//
// One pull = one Sales Report (DAILY / SUMMARY) per date in the window.
// Apple's daily Sales Reports have ~a 24h availability lag — the report for
// yesterday in the property timezone is the typical target.
//
// We aggregate the parsed rows into three metric kinds:
//   - installs       — sum of Units rows whose product type is a first-time download
//   - iap_revenue    — sum of Developer Proceeds for IAP / subscription rows
//   - revenue        — sum of all Developer Proceeds rows (gross of refunds)
//
// Rows are filtered to the property's appStoreAppId (when configured).
//
// Currency: ASC reports proceeds per row in the row's `Currency of Proceeds`.
// Apple sales reports break revenue out by country, each with its own currency.
// To keep the metric model simple, we convert nothing here — instead we write
// one currency-agnostic `revenue` row per native currency that appears in the
// report, using the `dimension: 'currency'` axis. The unified `lib/metrics/write`
// computes `valueZar` from the currency at write time.

import { adminDb } from '@/lib/firebase/admin'
import { writeMetrics } from '@/lib/metrics/write'
import type { MetricInput, MetricCurrency } from '@/lib/metrics/types'
import { ALL_METRIC_CURRENCIES } from '@/lib/metrics/types'
import { maybeDecryptCredentials } from '@/lib/integrations/crypto'
import type { Connection, PullResult } from '@/lib/integrations/types'
import type { Property } from '@/lib/properties/types'
import {
  fetchSalesReport,
  parseSalesReportTsv,
  type FetchSalesReportInput,
  type FetchSalesReportResult,
} from './client'
import {
  isInstallProductType,
  isIapProductType,
  type AscCredentials,
  type AscMeta,
  type AscSalesRow,
} from './schema'

/* ─────────────────────────────────────────────────────────────────────────
 * Date helpers — work in property timezone using the IANA tz string.
 * ───────────────────────────────────────────────────────────────────────── */

function todayInTz(tz: string, now: Date = new Date()): string {
  // Intl returns YYYY-MM-DD when locale is 'en-CA'.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

function yesterdayInTz(tz: string, now: Date = new Date()): string {
  const yest = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  return todayInTz(tz, yest)
}

function dateRange(from: string, to: string): string[] {
  const out: string[] = []
  const start = new Date(`${from}T00:00:00Z`)
  const end = new Date(`${to}T00:00:00Z`)
  for (let d = start; d <= end; d = new Date(d.getTime() + 24 * 60 * 60 * 1000)) {
    out.push(d.toISOString().slice(0, 10))
  }
  return out
}

function isMetricCurrency(c: string): c is MetricCurrency {
  return (ALL_METRIC_CURRENCIES as readonly string[]).includes(c)
}

/* ─────────────────────────────────────────────────────────────────────────
 * Property resolver — fetch the property doc to get tz / currency / appId.
 * Adapters cannot import firebase-admin directly, but `adminDb` is the
 * sanctioned wrapper used by all spine modules.
 * ───────────────────────────────────────────────────────────────────────── */

async function readPropertyConfig(propertyId: string): Promise<Property | null> {
  const snap = await adminDb.collection('properties').doc(propertyId).get()
  if (!snap.exists) return null
  return { id: snap.id, ...(snap.data() as Omit<Property, 'id'>) }
}

/* ─────────────────────────────────────────────────────────────────────────
 * Aggregation — turn parsed TSV rows into MetricInput rows for one date.
 * ───────────────────────────────────────────────────────────────────────── */

interface AggregateInput {
  rows: AscSalesRow[]
  date: string
  orgId: string
  propertyId: string
  appStoreAppId?: string
  fallbackCurrency?: MetricCurrency
}

export function aggregateAscRowsForDate(input: AggregateInput): MetricInput[] {
  const filtered = input.appStoreAppId
    ? input.rows.filter((r) => r.appleIdentifier === input.appStoreAppId)
    : input.rows

  let installs = 0
  // Bucket revenue by the row's `currencyOfProceeds` so each metric row carries
  // a single, accurate currency for FX conversion downstream.
  const revenueByCurrency = new Map<string, number>()
  const iapRevenueByCurrency = new Map<string, number>()

  for (const row of filtered) {
    if (isInstallProductType(row.productTypeIdentifier)) {
      installs += row.units
    }
    if (row.developerProceeds !== 0) {
      const cur = row.currencyOfProceeds || input.fallbackCurrency || 'USD'
      revenueByCurrency.set(cur, (revenueByCurrency.get(cur) ?? 0) + row.developerProceeds)
      if (isIapProductType(row.productTypeIdentifier)) {
        iapRevenueByCurrency.set(
          cur,
          (iapRevenueByCurrency.get(cur) ?? 0) + row.developerProceeds,
        )
      }
    }
  }

  const out: MetricInput[] = []
  // installs — single dimensionless row.
  out.push({
    orgId: input.orgId,
    propertyId: input.propertyId,
    date: input.date,
    source: 'app_store',
    metric: 'installs',
    value: installs,
    currency: null,
    dimension: null,
    dimensionValue: null,
    raw: { appStoreAppId: input.appStoreAppId ?? null, rowCount: filtered.length },
  })

  // revenue — one row per native currency (dimension='currency').
  for (const [currency, value] of revenueByCurrency.entries()) {
    const safeCurrency: MetricCurrency | null = isMetricCurrency(currency)
      ? currency
      : (input.fallbackCurrency ?? 'USD')
    out.push({
      orgId: input.orgId,
      propertyId: input.propertyId,
      date: input.date,
      source: 'app_store',
      metric: 'revenue',
      value,
      currency: safeCurrency,
      dimension: 'currency',
      dimensionValue: currency,
      raw: null,
    })
  }
  // iap_revenue — one row per native currency.
  for (const [currency, value] of iapRevenueByCurrency.entries()) {
    const safeCurrency: MetricCurrency | null = isMetricCurrency(currency)
      ? currency
      : (input.fallbackCurrency ?? 'USD')
    out.push({
      orgId: input.orgId,
      propertyId: input.propertyId,
      date: input.date,
      source: 'app_store',
      metric: 'iap_revenue',
      value,
      currency: safeCurrency,
      dimension: 'currency',
      dimensionValue: currency,
      raw: null,
    })
  }

  return out
}

/* ─────────────────────────────────────────────────────────────────────────
 * Public entry point — pullDaily. Indirection via fetchImpl/propertyReader
 * lets unit tests bypass network + Firestore.
 * ───────────────────────────────────────────────────────────────────────── */

export interface PullDailyDeps {
  /** Override the network fetch (test seam). Defaults to the global fetch. */
  fetchImpl?: typeof fetch
  /** Override the property resolver (test seam). */
  propertyReader?: (propertyId: string) => Promise<Property | null>
  /** Override the metrics writer (test seam). Defaults to lib/metrics/write. */
  writeMetricsImpl?: typeof writeMetrics
  /** Override the salesReports fetch wholesale (test seam). */
  fetchSalesReportImpl?: (input: FetchSalesReportInput) => Promise<FetchSalesReportResult>
  /** Override now (test seam). */
  now?: Date
}

export async function pullDaily(
  input: { connection: Connection; window?: { from: string; to: string } },
  deps: PullDailyDeps = {},
): Promise<PullResult> {
  const notes: string[] = []
  const propertyReader = deps.propertyReader ?? readPropertyConfig
  const writeImpl = deps.writeMetricsImpl ?? writeMetrics
  const salesReportFetcher =
    deps.fetchSalesReportImpl ??
    ((req: FetchSalesReportInput) => fetchSalesReport({ ...req, fetchImpl: deps.fetchImpl }))

  // 1) Decrypt credentials.
  const credentials = maybeDecryptCredentials<AscCredentials>(
    input.connection.credentialsEnc ?? null,
    input.connection.orgId,
  )
  if (!credentials || !credentials.keyId || !credentials.issuerId || !credentials.privateKey) {
    notes.push('Missing App Store Connect credentials — connect the integration.')
    const today = new Date().toISOString().slice(0, 10)
    return { from: today, to: today, metricsWritten: 0, notes }
  }

  // 2) Resolve vendor number from connection.meta.
  const meta = (input.connection.meta as Partial<AscMeta>) ?? {}
  const vendorNumber = meta.vendorNumber
  if (!vendorNumber) {
    notes.push('Missing vendorNumber on connection.meta — set it before pulling Sales Reports.')
    const today = new Date().toISOString().slice(0, 10)
    return { from: today, to: today, metricsWritten: 0, notes }
  }

  // 3) Resolve property config (timezone, currency, app id).
  const property = await propertyReader(input.connection.propertyId)
  const tz = property?.config?.revenue?.timezone ?? 'UTC'
  const fallbackCurrency = (property?.config?.revenue?.currency ?? 'USD') as MetricCurrency
  const appStoreAppId = property?.config?.revenue?.appStoreAppId

  // 4) Determine window — default to yesterday in property tz.
  const yest = yesterdayInTz(tz, deps.now ?? new Date())
  const fromDate = input.window?.from ?? yest
  const toDate = input.window?.to ?? yest
  const dates = dateRange(fromDate, toDate)

  // 5) Pull each date, parse, aggregate.
  const allMetrics: MetricInput[] = []
  let datesWithData = 0
  let datesNotReady = 0

  for (const date of dates) {
    const result = await salesReportFetcher({
      credentials,
      vendorNumber,
      reportDate: date,
    })
    if (result.notReady) {
      datesNotReady += 1
      continue
    }
    const rows = parseSalesReportTsv(result.tsv)
    if (rows.length === 0) {
      // Apple returned an empty report — record zero installs/revenue for the day.
      allMetrics.push(
        ...aggregateAscRowsForDate({
          rows: [],
          date,
          orgId: input.connection.orgId,
          propertyId: input.connection.propertyId,
          appStoreAppId,
          fallbackCurrency,
        }),
      )
      continue
    }
    datesWithData += 1
    allMetrics.push(
      ...aggregateAscRowsForDate({
        rows,
        date,
        orgId: input.connection.orgId,
        propertyId: input.connection.propertyId,
        appStoreAppId,
        fallbackCurrency,
      }),
    )
  }

  if (datesNotReady > 0) {
    notes.push(
      `${datesNotReady} of ${dates.length} requested date(s) were not yet available — Apple's daily Sales Reports lag ~24h.`,
    )
  }
  if (datesWithData === 0) {
    notes.push('No Sales Report data returned for the requested window.')
  }
  if (!appStoreAppId) {
    notes.push(
      'Property.config.revenue.appStoreAppId is not set — aggregating across all apps under this vendor.',
    )
  }

  const { written } = await writeImpl(allMetrics, { ingestedBy: 'cron' })

  return {
    from: fromDate,
    to: toDate,
    metricsWritten: written,
    notes,
  }
}
