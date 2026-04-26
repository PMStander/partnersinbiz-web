// lib/integrations/google_ads/schema.ts
//
// TypeScript types mirroring the Google Ads API v17 (REST) shapes the adapter
// consumes. We hand-roll only what we read so we don't have to ship the
// generated client.
//
// Reference:
//   https://developers.google.com/google-ads/api/rest/overview
//   https://developers.google.com/google-ads/api/fields/v17/customer
//   https://developers.google.com/google-ads/api/docs/query/overview (GAQL)

import type { MetricCurrency } from '@/lib/metrics/types'

/* OAuth2 token endpoints (shared with other Google adapters) ─────────── */

export interface GoogleTokenResponse {
  access_token: string
  expires_in: number
  scope?: string
  token_type: string
  /** Only returned on the initial code-exchange when access_type=offline. */
  refresh_token?: string
  id_token?: string
}

export interface GoogleTokenError {
  error: string
  error_description?: string
}

/* Google Ads — credentials we persist ──────────────────────────────── */

export interface GoogleAdsCredentials {
  accessToken: string
  /** Long-lived offline refresh token. May be empty on subsequent OAuth roundtrips. */
  refreshToken: string
  /** Unix epoch ms when the access token expires. */
  expiresAt: number
}

/* Google Ads — meta we persist on the connection ──────────────────── */

export interface GoogleAdsConnectionMeta extends Record<string, unknown> {
  /** Customer id with dashes stripped — e.g. '1234567890'. */
  customerId?: string
  /** ISO 4217 currency from the customer's settings — e.g. 'USD'. */
  currencyCode?: string
  /** IANA timezone string — e.g. 'America/Los_Angeles'. */
  timeZone?: string
  /** Optional manager-account login id (also dashes stripped). */
  loginCustomerId?: string
}

/* Google Ads — search/searchStream response shapes ─────────────────── */
//
// The `googleAds:searchStream` endpoint streams JSON-array chunks. Each
// chunk contains a `results` array where each row carries the requested
// segments / metrics in nested objects matching the GAQL select list.

/** One row inside a streamed `results` array. */
export interface GoogleAdsRow {
  segments?: GoogleAdsRowSegments
  metrics?: GoogleAdsRowMetrics
  customer?: GoogleAdsRowCustomer
  [k: string]: unknown
}

export interface GoogleAdsRowSegments {
  /** ISO date string, 'YYYY-MM-DD'. */
  date?: string
  [k: string]: unknown
}

export interface GoogleAdsRowMetrics {
  /** Cost in micros — divide by 1e6 for currency units. */
  costMicros?: string | number
  impressions?: string | number
  clicks?: string | number
  /** Click-through rate, as a fraction (0.05 == 5%). */
  ctr?: string | number
  /** Average CPC in micros — divide by 1e6. */
  averageCpc?: string | number
  /** Total conversions (float — Google supports fractional). */
  conversions?: string | number
  /** Conversion value in the customer's currency (already in major units). */
  conversionsValue?: string | number
  [k: string]: unknown
}

export interface GoogleAdsRowCustomer {
  /** Resource name, e.g. 'customers/1234567890'. */
  resourceName?: string
  /** ISO 4217 currency code. */
  currencyCode?: string
  /** IANA timezone. */
  timeZone?: string
  [k: string]: unknown
}

/** A single chunk from the streaming response. */
export interface GoogleAdsSearchStreamChunk {
  results?: GoogleAdsRow[]
  fieldMask?: string
  requestId?: string
  /** Present in error chunks. */
  error?: GoogleAdsApiErrorPayload
  [k: string]: unknown
}

/**
 * Full streamed response. `googleAds:searchStream` returns a JSON array of
 * chunks; non-streaming `googleAds:search` returns a single envelope. We
 * normalise both into `GoogleAdsSearchStreamChunk[]` in the client.
 */
export type GoogleAdsSearchStreamResponse = GoogleAdsSearchStreamChunk[]

/** Error envelope returned when the API rejects a request. */
export interface GoogleAdsApiErrorPayload {
  code?: number
  message?: string
  status?: string
  details?: unknown[]
  [k: string]: unknown
}

/** Top-level error response shape (REST). */
export interface GoogleAdsApiErrorResponse {
  error?: GoogleAdsApiErrorPayload
}

/* Currency helpers ─────────────────────────────────────────────────── */
//
// Google Ads returns ISO 4217 codes; only the subset we accept in
// MetricCurrency is meaningful for `valueZar` conversion.

export const ALL_METRIC_CURRENCY_SET: ReadonlySet<MetricCurrency> = new Set<MetricCurrency>([
  'ZAR', 'USD', 'EUR', 'GBP', 'AUD', 'CAD', 'NZD', 'JPY',
])

/** Map a Google Ads `currency_code` to a `MetricCurrency`, defaulting to USD. */
export function normalizeCurrency(input: string | undefined): MetricCurrency {
  if (!input) return 'USD'
  const upper = input.trim().toUpperCase() as MetricCurrency
  return ALL_METRIC_CURRENCY_SET.has(upper) ? upper : 'USD'
}

/* GAQL constants ───────────────────────────────────────────────────── */
//
// We always issue the same daily query so adapter logic can index rows by
// the same shape.

export const GOOGLE_ADS_DAILY_GAQL_FIELDS = [
  'segments.date',
  'metrics.cost_micros',
  'metrics.impressions',
  'metrics.clicks',
  'metrics.ctr',
  'metrics.average_cpc',
  'metrics.conversions',
  'metrics.conversions_value',
] as const

/**
 * Build the GAQL query string for a single date. Date must be 'YYYY-MM-DD'.
 *
 * Note we query `FROM customer` so each day produces exactly one row at the
 * customer level (no campaign / ad-group breakdown). Keeps the metric volume
 * predictable and matches what the dashboard reports on.
 */
export function buildDailyGaql(date: string): string {
  return (
    'SELECT ' +
    GOOGLE_ADS_DAILY_GAQL_FIELDS.join(', ') +
    ' FROM customer WHERE segments.date = ' +
    "'" +
    date +
    "'"
  )
}
