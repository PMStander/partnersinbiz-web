// lib/integrations/play_console/schema.ts
//
// TypeScript types for the Google Play Developer Reporting API v1beta1 and
// the RTDN (Real-time Developer Notifications) Pub/Sub push payload.
//
// Reference:
//   https://developers.google.com/play/developer/reporting
//   https://developer.android.com/google/play/billing/rtdn-reference

/* Service account JSON — credentials we persist ───────────────────────── */

/**
 * The service-account JSON blob the user uploads via the Play Console.
 * We only need a handful of fields from it to mint a JWT bearer token.
 */
export interface PlayServiceAccountKey {
  type: 'service_account'
  project_id?: string
  private_key_id?: string
  private_key: string
  client_email: string
  client_id?: string
  auth_uri?: string
  token_uri?: string
  auth_provider_x509_cert_url?: string
  client_x509_cert_url?: string
  universe_domain?: string
  [k: string]: unknown
}

/**
 * What we persist (encrypted) on `Connection.credentialsEnc`. The user gives
 * us the service-account JSON as a single string via `saveCredentials`; we
 * keep both the raw string and the parsed key so we can re-issue tokens
 * without re-parsing.
 */
export interface PlayCredentials {
  /** Raw JSON the user pasted — useful for re-export / debugging. */
  serviceAccountJson: string
  /** Parsed key. Always populated post-saveCredentials. */
  key: PlayServiceAccountKey
}

/** Stored on `Connection.meta`. */
export interface PlayConnectionMeta extends Record<string, unknown> {
  /** Service-account email — convenient for the admin UI. */
  clientEmail?: string
  /** Project id from the SA key, if present. */
  projectId?: string
  /** Pub/Sub subscription URL we expect the customer to register. */
  pubsubWebhookUrl?: string
  /** Mirror of property.config.revenue.playPackageName at connect time. */
  packageName?: string
}

/* OAuth2 token-endpoint envelope ─────────────────────────────────────── */

export interface GoogleTokenResponse {
  access_token: string
  expires_in: number
  scope?: string
  token_type: string
}

export interface GoogleTokenError {
  error: string
  error_description?: string
}

/* Play Reporting API — request bodies ────────────────────────────────── */

export type PlayAggregationPeriod =
  | 'AGGREGATION_PERIOD_UNSPECIFIED'
  | 'DAILY'
  | 'HOURLY'
  | 'FULL_RANGE'

export interface PlayDateTime {
  year: number
  month: number
  day: number
  hours?: number
  minutes?: number
  seconds?: number
  timeZone?: { id?: string; version?: string }
}

export interface PlayTimelineSpec {
  aggregationPeriod: PlayAggregationPeriod
  startTime: PlayDateTime
  endTime: PlayDateTime
}

export interface PlayMetricsQueryRequest {
  timelineSpec: PlayTimelineSpec
  dimensions?: string[]
  metrics: string[]
  pageSize?: number
  pageToken?: string
  filter?: string
  /** Reporting API expects 'America/Los_Angeles' style ids. */
  metricsRequestParams?: {
    userCountrySet?: string[]
  }
}

/* Play Reporting API — response bodies ───────────────────────────────── */

export interface PlayMetricsQueryResponse {
  rows?: PlayMetricRow[]
  nextPageToken?: string
}

export interface PlayMetricRow {
  startTime?: PlayDateTime
  endTime?: PlayDateTime
  dimensions?: PlayDimensionValue[]
  metrics?: PlayMetricValue[]
}

export interface PlayDimensionValue {
  dimension: string
  valueLabel?: string
  stringValue?: string
  int64Value?: string
}

export interface PlayMetricValue {
  metric: string
  /** Most metrics are returned in this shape. */
  decimalValue?: { value?: string }
  /** Some metrics use this. */
  doubleValue?: { value?: number }
  int64Value?: string
  /** Money-bearing metrics carry currency in the value envelope. */
  decimalValueConfidenceInterval?: unknown
  moneyValue?: {
    currencyCode?: string
    units?: string
    nanos?: number
  }
}

/* RTDN webhook ───────────────────────────────────────────────────────── */

/** Outer envelope from Pub/Sub push subscription. */
export interface PubSubPushEnvelope {
  message: PubSubMessage
  subscription?: string
}

export interface PubSubMessage {
  /** Base64-encoded JSON RTDN payload. */
  data: string
  messageId?: string
  publishTime?: string
  attributes?: Record<string, string>
}

/** Inner RTDN payload (after base64 decode + JSON parse). */
export interface RtdnPayload {
  version?: string
  packageName?: string
  eventTimeMillis?: string
  oneTimeProductNotification?: OneTimeProductNotification
  subscriptionNotification?: SubscriptionNotification
  voidedPurchaseNotification?: VoidedPurchaseNotification
  testNotification?: TestNotification
}

export interface OneTimeProductNotification {
  version?: string
  notificationType?: number // 1 = PURCHASED, 2 = CANCELED
  purchaseToken?: string
  sku?: string
}

export interface SubscriptionNotification {
  version?: string
  /** 1 RECOVERED, 2 RENEWED, 3 CANCELED, 4 PURCHASED, 5 ON_HOLD,
   *  6 IN_GRACE_PERIOD, 7 RESTARTED, 8 PRICE_CHANGE_CONFIRMED,
   *  9 DEFERRED, 10 PAUSED, 11 PAUSE_SCHEDULE_CHANGED, 12 REVOKED,
   *  13 EXPIRED. */
  notificationType?: number
  purchaseToken?: string
  subscriptionId?: string
}

export interface VoidedPurchaseNotification {
  purchaseToken?: string
  orderId?: string
  productType?: number // 1 = SUBSCRIPTION, 2 = ONE_TIME
  refundType?: number // 1 = FULL_REFUND, 2 = QUANTITY_BASED_PARTIAL_REFUND
}

export interface TestNotification {
  version?: string
}

/* Adapter constants ──────────────────────────────────────────────────── */

/** Single OAuth scope used by the Play Reporting API. */
export const PLAY_REPORTING_SCOPE = 'https://www.googleapis.com/auth/playdeveloperreporting'

/** Token exchange endpoint. */
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

/** Reporting API base URL. */
export const PLAY_REPORTING_BASE_URL = 'https://playdeveloperreporting.googleapis.com'

/** Metric column names we always request from `installsMetricSet:query`. */
export const PLAY_INSTALLS_METRICS = [
  'activeDevices',
  'dailyDeviceInstalls',
  'dailyDeviceUninstalls',
] as const
export type PlayInstallsMetric = (typeof PLAY_INSTALLS_METRICS)[number]

/** Metric column names we request from `financialMetricSet:query` (if available). */
export const PLAY_FINANCIAL_METRICS = [
  'revenueIap',
  'revenueSubscriptions',
] as const
export type PlayFinancialMetric = (typeof PLAY_FINANCIAL_METRICS)[number]

/** RTDN sub_notification_type values we treat as "new subscription" for metric purposes. */
export const RTDN_NEW_SUB_TYPES: ReadonlySet<number> = new Set([
  2, // SUBSCRIPTION_RENEWED
  4, // SUBSCRIPTION_PURCHASED
  7, // SUBSCRIPTION_RESTARTED
])

/** RTDN one_time_product_notification.notificationType values we treat as new purchases. */
export const RTDN_NEW_IAP_TYPES: ReadonlySet<number> = new Set([
  1, // ONE_TIME_PRODUCT_PURCHASED
])
