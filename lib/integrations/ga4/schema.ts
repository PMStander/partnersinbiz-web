// lib/integrations/ga4/schema.ts
//
// TypeScript types mirroring the Google Analytics Data API v1beta response
// shapes the adapter consumes. We hand-roll the types we need so we don't
// have to ship the generated `googleapis` SDK.
//
// Reference: https://developers.google.com/analytics/devguides/reporting/data/v1
//
// Note: GA4 splits "Admin API" (account/property metadata) from the
// "Data API" (reporting). This adapter only uses the Data API for reads.

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

/* GA4 — credentials we persist ───────────────────────────────────────── */

export interface Ga4Credentials {
  accessToken: string
  /** Long-lived offline refresh token. May be empty on subsequent OAuth roundtrips. */
  refreshToken: string
  /** Unix epoch ms when the access token expires. */
  expiresAt: number
}

/* GA4 — meta we persist on the connection ───────────────────────────── */

export interface Ga4ConnectionMeta extends Record<string, unknown> {
  /** Numeric GA4 property id, e.g. '123456789'. No 'properties/' prefix. */
  ga4PropertyId?: string
  /** Display name picked up at OAuth time, if known. */
  propertyDisplayName?: string
}

/* GA4 — Data API request/response shapes ────────────────────────────── */

export interface Ga4DateRange {
  startDate: string // 'YYYY-MM-DD' or 'NdaysAgo'
  endDate: string
  name?: string
}

export interface Ga4Metric {
  name: string
  expression?: string
}

export interface Ga4Dimension {
  name: string
}

export interface Ga4OrderBy {
  dimension?: { dimensionName: string; orderType?: string }
  metric?: { metricName: string }
  desc?: boolean
}

export interface Ga4RunReportRequest {
  dateRanges: Ga4DateRange[]
  metrics: Ga4Metric[]
  dimensions?: Ga4Dimension[]
  orderBys?: Ga4OrderBy[]
  limit?: string
  offset?: string
  keepEmptyRows?: boolean
  returnPropertyQuota?: boolean
}

export interface Ga4DimensionHeader {
  name: string
}

export interface Ga4MetricHeader {
  name: string
  type?:
    | 'METRIC_TYPE_UNSPECIFIED'
    | 'TYPE_INTEGER'
    | 'TYPE_FLOAT'
    | 'TYPE_SECONDS'
    | 'TYPE_MILLISECONDS'
    | 'TYPE_MINUTES'
    | 'TYPE_HOURS'
    | 'TYPE_STANDARD'
    | 'TYPE_CURRENCY'
    | 'TYPE_FEET'
    | 'TYPE_MILES'
    | 'TYPE_METERS'
    | 'TYPE_KILOMETERS'
}

export interface Ga4DimensionValue {
  value?: string
}

export interface Ga4MetricValue {
  value?: string
}

export interface Ga4Row {
  dimensionValues?: Ga4DimensionValue[]
  metricValues?: Ga4MetricValue[]
}

export interface Ga4PropertyQuota {
  tokensPerDay?: { consumed?: number; remaining?: number }
  tokensPerHour?: { consumed?: number; remaining?: number }
  concurrentRequests?: { consumed?: number; remaining?: number }
  serverErrorsPerProjectPerHour?: { consumed?: number; remaining?: number }
  potentiallyThresholdedRequestsPerHour?: { consumed?: number; remaining?: number }
  tokensPerProjectPerHour?: { consumed?: number; remaining?: number }
}

export interface Ga4RunReportResponse {
  dimensionHeaders?: Ga4DimensionHeader[]
  metricHeaders?: Ga4MetricHeader[]
  rows?: Ga4Row[]
  totals?: Ga4Row[]
  maximums?: Ga4Row[]
  minimums?: Ga4Row[]
  rowCount?: number
  metadata?: {
    /** Sampling indication — present when the report sampled. */
    samplingMetadatas?: Array<{
      samplesReadCount?: string
      samplingSpaceSize?: string
    }>
    /** Empty/unknown buckets indication. */
    emptyReason?: string
    /** Currency reported in TYPE_CURRENCY metrics, ISO 4217. */
    currencyCode?: string
    /** IANA tz the property reports in. */
    timeZone?: string
  }
  propertyQuota?: Ga4PropertyQuota
  kind?: string
}

/* GA4 — error envelope ───────────────────────────────────────────────── */

export interface Ga4ApiErrorBody {
  error?: {
    code?: number
    message?: string
    status?: string
    details?: unknown[]
  }
}

/* Metric column ordering used by this adapter ───────────────────────── */
//
// We always request the same metric column set in the same order so we
// can safely index into report rows by position.

export const GA4_METRICS_ORDER = [
  'sessions',
  'screenPageViews',
  'totalUsers',
  'newUsers',
  'engagedSessions',
  'bounceRate',
  'averageSessionDuration',
  'conversions',
] as const

export type Ga4MetricName = (typeof GA4_METRICS_ORDER)[number]
