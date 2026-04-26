// lib/integrations/app_store_connect/client.ts
//
// Authenticated client for the App Store Connect API.
//
// Two endpoints relevant to v1 of this adapter:
//   1) GET /v1/salesReports — gzipped TSV. Auth: Bearer <jwt>. Accept: application/a-gzip.
//   2) The same /v1 base for any future JSON endpoints (ratings, app metadata).
//
// All HTTP goes through the platform `fetch` (Node 20+ on Vercel) — no axios.
// Gzip is handled here so the caller deals with the decoded TSV string.

import zlib from 'zlib'
import { signAscJwt } from './jwt'
import type { AscCredentials } from './schema'

export const ASC_API_BASE = 'https://api.appstoreconnect.apple.com'

/** Build the Sales Reports URL for one daily report. */
export function buildSalesReportUrl(input: {
  vendorNumber: string
  reportDate: string // 'YYYY-MM-DD'
  /** Defaults: frequency=DAILY, reportSubType=SUMMARY, reportType=SALES, version=1_4. */
  frequency?: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
  reportSubType?: 'SUMMARY' | 'DETAILED'
  reportType?: 'SALES' | 'SUBSCRIPTION' | 'SUBSCRIPTION_EVENT' | 'SUBSCRIBER'
  version?: string
}): string {
  const params = new URLSearchParams({
    'filter[frequency]': input.frequency ?? 'DAILY',
    'filter[reportSubType]': input.reportSubType ?? 'SUMMARY',
    'filter[reportType]': input.reportType ?? 'SALES',
    'filter[vendorNumber]': input.vendorNumber,
    'filter[reportDate]': input.reportDate,
    'filter[version]': input.version ?? '1_4',
  })
  return `${ASC_API_BASE}/v1/salesReports?${params.toString()}`
}

export interface FetchSalesReportInput {
  credentials: AscCredentials
  vendorNumber: string
  reportDate: string // 'YYYY-MM-DD'
  /** Optional injected fetch — used in tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch
}

export interface FetchSalesReportResult {
  /** Decoded TSV body. Empty string when Apple has no report yet for that date. */
  tsv: string
  status: number
  /** True if the report wasn't ready yet (404 / 'Report is not available'). */
  notReady: boolean
}

/**
 * Fetch one daily Sales Report. Decodes the gzipped TSV body so callers see a
 * plain string. A 404 from ASC means "no report yet for that date" — typical
 * before the daily reporting window closes (~24h delay) — so we surface that
 * as `notReady: true` rather than an error.
 */
export async function fetchSalesReport(
  input: FetchSalesReportInput,
): Promise<FetchSalesReportResult> {
  const fetchFn = input.fetchImpl ?? fetch
  const jwt = signAscJwt({
    keyId: input.credentials.keyId,
    issuerId: input.credentials.issuerId,
    privateKey: input.credentials.privateKey,
  })
  const url = buildSalesReportUrl({
    vendorNumber: input.vendorNumber,
    reportDate: input.reportDate,
  })
  const res = await fetchFn(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: 'application/a-gzip',
    },
  })
  if (res.status === 404) {
    return { tsv: '', status: 404, notReady: true }
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(
      `App Store Connect Sales Reports failed: ${res.status} ${res.statusText} — ${text.slice(0, 200)}`,
    )
  }
  // Body is gzip; ArrayBuffer → Buffer → gunzip.
  const ab = await res.arrayBuffer()
  const gz = Buffer.from(ab)
  if (gz.length === 0) {
    return { tsv: '', status: res.status, notReady: true }
  }
  const tsv = zlib.gunzipSync(gz).toString('utf8')
  return { tsv, status: res.status, notReady: false }
}

/**
 * Parse a Sales Reports TSV body into row objects. The first line is the header;
 * we look up each cell by header name (Apple may add columns over time).
 */
import type { AscSalesRow } from './schema'

function toNumber(input: string): number {
  if (!input) return 0
  const n = Number(input.trim())
  return Number.isFinite(n) ? n : 0
}

function get(row: Record<string, string>, key: string): string {
  return (row[key] ?? '').trim()
}

export function parseSalesReportTsv(tsv: string): AscSalesRow[] {
  if (!tsv) return []
  // Apple sometimes appends a footer line "Total_Rows: N" and a trailing newline.
  const lines = tsv.split(/\r?\n/).filter((l) => l.length > 0)
  if (lines.length < 2) return []
  const header = lines[0].split('\t').map((h) => h.trim())
  const rows: AscSalesRow[] = []
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i]
    // Skip footer lines.
    if (line.startsWith('Total_Rows') || line.startsWith('Total Rows')) continue
    const cells = line.split('\t')
    // A short line (fewer cells than headers) means a malformed/footer row — skip.
    if (cells.length < 2) continue
    const raw: Record<string, string> = {}
    for (let j = 0; j < header.length; j += 1) {
      raw[header[j]] = (cells[j] ?? '').trim()
    }
    rows.push({
      provider: get(raw, 'Provider'),
      providerCountry: get(raw, 'Provider Country'),
      sku: get(raw, 'SKU'),
      developer: get(raw, 'Developer'),
      title: get(raw, 'Title'),
      version: get(raw, 'Version'),
      productTypeIdentifier: get(raw, 'Product Type Identifier'),
      units: toNumber(get(raw, 'Units')),
      developerProceeds: toNumber(get(raw, 'Developer Proceeds')),
      beginDate: get(raw, 'Begin Date'),
      endDate: get(raw, 'End Date'),
      customerCurrency: get(raw, 'Customer Currency'),
      countryCode: get(raw, 'Country Code'),
      currencyOfProceeds: get(raw, 'Currency of Proceeds'),
      appleIdentifier: get(raw, 'Apple Identifier'),
      customerPrice: toNumber(get(raw, 'Customer Price')),
      promoCode: get(raw, 'Promo Code'),
      parentIdentifier: get(raw, 'Parent Identifier'),
      subscription: get(raw, 'Subscription'),
      period: get(raw, 'Period'),
      category: get(raw, 'Category'),
      cmb: get(raw, 'CMB'),
      device: get(raw, 'Device'),
      supportedPlatforms: get(raw, 'Supported Platforms'),
      proceedsReason: get(raw, 'Proceeds Reason'),
      preservedPricing: get(raw, 'Preserved Pricing'),
      client: get(raw, 'Client'),
      orderType: get(raw, 'Order Type'),
      raw,
    })
  }
  return rows
}
