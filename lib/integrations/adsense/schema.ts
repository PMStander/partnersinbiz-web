// lib/integrations/adsense/schema.ts
//
// TypeScript types mirroring the Google AdSense Management API v2 response
// shapes the adapter consumes. We hand-roll the types we need so we don't
// have to ship the generated `googleapis` SDK.
//
// Reference: https://developers.google.com/adsense/management/reference/rest

/* OAuth2 token endpoints ─────────────────────────────────────────────── */

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

/* AdSense — credentials we persist ─────────────────────────────────── */

export interface AdsenseCredentials {
  accessToken: string
  /** Long-lived offline refresh token. May be empty on subsequent OAuth roundtrips. */
  refreshToken: string
  /** Unix epoch ms when the access token expires. */
  expiresAt: number
}

/* AdSense — meta we persist on the connection ──────────────────────── */

export interface AdsenseConnectionMeta extends Record<string, unknown> {
  /** Resource name of the AdSense account, e.g. `accounts/pub-1234567890123456`. */
  accountName?: string
  /** Pretty display id, e.g. `pub-1234567890123456`. */
  publisherId?: string
}

/* AdSense — REST response payloads we parse ───────────────────────── */

/** Response of `GET /v2/accounts`. */
export interface AdsenseAccountListResponse {
  accounts?: AdsenseAccount[]
  nextPageToken?: string
}

export interface AdsenseAccount {
  /** Resource name, e.g. `accounts/pub-1234567890123456`. */
  name: string
  displayName?: string
  pendingTasks?: string[]
  /** Time zone, e.g. `{ id: 'America/Los_Angeles' }`. */
  timeZone?: { id?: string }
  /** ISO 4217 currency, e.g. 'USD'. */
  createTime?: string
  state?: 'READY' | 'NEEDS_ATTENTION' | 'CLOSED' | 'STATE_UNSPECIFIED'
}

/** Response of `GET /v2/accounts/{accountName}/reports:generate`. */
export interface AdsenseReportResponse {
  /** Header rows describe each requested column. */
  headers?: AdsenseReportHeader[]
  rows?: AdsenseReportRow[]
  totals?: AdsenseReportRow
  averages?: AdsenseReportRow
  /** Each requested metric is appended to a header in order. */
  totalMatchedRows?: string
  /** ISO 4217 currency reflected in METRIC_CURRENCY cells. */
  warnings?: string[]
  startDate?: AdsenseDate
  endDate?: AdsenseDate
}

export interface AdsenseReportHeader {
  name: string
  type:
    | 'DIMENSION'
    | 'METRIC_TALLY'
    | 'METRIC_RATIO'
    | 'METRIC_CURRENCY'
    | 'METRIC_MILLISECONDS'
    | 'METRIC_DECIMAL'
    | 'HEADER_TYPE_UNSPECIFIED'
  currencyCode?: string
}

export interface AdsenseReportRow {
  cells?: AdsenseReportCell[]
}

export interface AdsenseReportCell {
  /** Stringified value — adapter coerces to number for metric cells. */
  value?: string
}

export interface AdsenseDate {
  year?: number
  month?: number
  day?: number
}

/* Metric column ordering used by this adapter ──────────────────────── */
//
// We always request the same metric column set in the same order so we
// can safely index into report rows by position.

export const ADSENSE_METRICS_ORDER = [
  'ESTIMATED_EARNINGS',
  'IMPRESSIONS',
  'CLICKS',
  'CTR',
  'COST_PER_CLICK',
  'IMPRESSIONS_RPM',
  'AD_REQUESTS',
] as const

export type AdsenseMetricName = (typeof ADSENSE_METRICS_ORDER)[number]
