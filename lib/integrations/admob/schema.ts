// lib/integrations/admob/schema.ts
//
// Type definitions for the AdMob API v1 responses we consume.
// Reference: https://developers.google.com/admob/api/v1/reference/rest

/**
 * GET https://admob.googleapis.com/v1/accounts
 *
 * Returns the list of AdMob publisher accounts the OAuth token has access to.
 */
export interface AdMobAccount {
  /** e.g. 'accounts/pub-1234567890123456' */
  name: string
  /** e.g. 'pub-1234567890123456' */
  publisherId: string
  /** Reporting currency for this account, e.g. 'USD'. */
  reportingTimeZone?: string
  currencyCode?: string
}

export interface ListAdMobAccountsResponse {
  account?: AdMobAccount[]
  /** AdMob also returns this field on some responses. */
  accounts?: AdMobAccount[]
  nextPageToken?: string
}

/**
 * Date object in AdMob report request body.
 * https://developers.google.com/admob/api/v1/reference/rest/v1/accounts.networkReport/generate#Date
 */
export interface AdMobDate {
  year: number
  month: number
  day: number
}

export interface AdMobDateRange {
  startDate: AdMobDate
  endDate: AdMobDate
}

/** All dimensions we use. AdMob API supports more — extend as needed. */
export type AdMobDimension =
  | 'DATE'
  | 'MONTH'
  | 'WEEK'
  | 'AD_UNIT'
  | 'APP'
  | 'AD_TYPE'
  | 'COUNTRY'
  | 'FORMAT'
  | 'PLATFORM'

/** All metrics we request. AdMob API also supports IMPRESSION_RPM, etc. */
export type AdMobMetric =
  | 'AD_REQUESTS'
  | 'CLICKS'
  | 'ESTIMATED_EARNINGS'
  | 'IMPRESSIONS'
  | 'IMPRESSION_CTR'
  | 'IMPRESSION_RPM'
  | 'MATCHED_REQUESTS'
  | 'MATCH_RATE'
  | 'OBSERVED_ECPM'
  | 'SHOW_RATE'

/** Body sent to networkReport:generate. */
export interface NetworkReportRequest {
  reportSpec: {
    dateRange: AdMobDateRange
    dimensions: AdMobDimension[]
    metrics: AdMobMetric[]
    dimensionFilters?: Array<{
      dimension: AdMobDimension
      matchesAny?: { values: string[] }
    }>
    sortConditions?: Array<{
      dimension?: AdMobDimension
      metric?: AdMobMetric
      order: 'ASCENDING' | 'DESCENDING'
    }>
    localizationSettings?: {
      currencyCode?: string
      languageCode?: string
    }
    timeZone?: string
  }
}

/**
 * AdMob report responses are streamed as JSON arrays of "rows", with one
 * header row, many data rows, and one footer row.
 *
 * https://developers.google.com/admob/api/v1/reference/rest/v1/accounts.networkReport/generate
 */
export interface AdMobReportRow {
  header?: {
    dateRange: AdMobDateRange
    localizationSettings?: { currencyCode: string; languageCode: string }
    reportingTimeZone?: string
  }
  row?: {
    dimensionValues?: Record<
      string,
      { value: string; displayLabel?: string }
    >
    metricValues?: Record<
      string,
      {
        /** Integer-typed metrics — string-encoded int64. */
        integerValue?: string
        /** Money-typed metrics (ESTIMATED_EARNINGS) — string-encoded micros. */
        microsValue?: string
        /** Float-typed metrics (CTR, MATCH_RATE) — number 0..1 or 0..N. */
        doubleValue?: number
      }
    >
  }
  footer?: {
    matchingRowCount?: string
    warnings?: Array<{
      type?: string
      description?: string
    }>
  }
}

export type NetworkReportResponse = AdMobReportRow[]

/** Token response from oauth2.googleapis.com/token. */
export interface GoogleTokenResponse {
  access_token: string
  expires_in: number
  refresh_token?: string
  scope?: string
  token_type: 'Bearer'
}

/** Shape of the `credentials` blob we encrypt and store on the Connection. */
export interface AdMobCredentials {
  accessToken: string
  refreshToken: string
  /** Unix epoch ms when the access token expires. */
  expiresAt: number
  scope?: string
}

/** Shape of `Connection.meta` for the AdMob adapter. */
export interface AdMobConnectionMeta {
  /** Resource name, e.g. 'accounts/pub-1234567890123456'. */
  accountName?: string
  publisherId?: string
  /** Account reporting tz reported by AdMob (informational only). */
  reportingTimeZone?: string
  /** Account-level currency reported by AdMob (informational only). */
  currencyCode?: string
}
