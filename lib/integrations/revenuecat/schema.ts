// lib/integrations/revenuecat/schema.ts
//
// TypeScript types for RevenueCat REST API v1/v2 responses and the webhook
// payload envelope. RevenueCat's API is intentionally narrow here — we only
// model the fields the adapter actually reads. Anything we don't read goes
// into `[k: string]: unknown` to keep the types tolerant of upstream change.

/** Stored alongside the encrypted apiKey on the connection's `meta` field. */
export interface RevenueCatCredentials {
  /** Secret REST API key (Bearer token). */
  apiKey: string
  /** Optional — RevenueCat v2 project id. */
  projectId?: string
}

/** Response from `GET /v2/projects/{project_id}/metrics`. */
export interface RevenueCatMetricsResponse {
  object?: 'list' | string
  items?: RevenueCatMetricItem[]
  /**
   * v2 returns an envelope with metric values keyed by metric id. We accept
   * both shapes; pull-daily normalises them.
   */
  data?: RevenueCatMetricItem[]
  [k: string]: unknown
}

export interface RevenueCatMetricItem {
  id?: string
  /** RevenueCat slug — e.g. 'mrr', 'active_subscriptions', 'revenue'. */
  name?: string
  /** Some shapes use `slug` instead of `name`. */
  slug?: string
  /** Human-readable label. */
  description?: string
  /** Numeric value. RevenueCat returns major-units (USD dollars, not cents). */
  value?: number
  /** ISO currency code (e.g. 'USD'); only present on money metrics. */
  unit?: string
  /** Period the value covers — usually the day; only on time-windowed pulls. */
  period?: { start?: string; end?: string }
  [k: string]: unknown
}

/** Envelope for `GET /v1/subscribers/{app_user_id}` — used as a sanity probe. */
export interface RevenueCatSubscriberResponse {
  request_date?: string
  request_date_ms?: number
  subscriber?: {
    original_app_user_id?: string
    [k: string]: unknown
  }
  [k: string]: unknown
}

/** Webhook event envelope. RevenueCat wraps the actual event in `event`. */
export interface RevenueCatWebhookEnvelope {
  /** API version of the webhook payload. */
  api_version?: string
  event: RevenueCatWebhookEvent
  [k: string]: unknown
}

export type RevenueCatEventType =
  | 'INITIAL_PURCHASE'
  | 'RENEWAL'
  | 'NON_RENEWING_PURCHASE'
  | 'CANCELLATION'
  | 'EXPIRATION'
  | 'BILLING_ISSUE'
  | 'PRODUCT_CHANGE'
  | 'TRANSFER'
  | 'SUBSCRIBER_ALIAS'
  | 'TEMPORARY_ENTITLEMENT_GRANT'
  | 'TEST'
  | string

export interface RevenueCatWebhookEvent {
  /** Stable event id — useful for de-dup. */
  id?: string
  type: RevenueCatEventType
  /** Milliseconds since epoch when the event occurred. */
  event_timestamp_ms?: number
  /** `app_user_id` set by your client SDK. */
  app_user_id?: string
  original_app_user_id?: string

  /** Cents → major-unit conversion happens in pull-daily/webhook. */
  /** Price the customer was charged, in major units (e.g. USD dollars). */
  price?: number
  /** RevenueCat's USD-normalised price — present on money-bearing events. */
  price_in_purchased_currency?: number
  /** USD value of the purchase even if customer paid in another currency. */
  price_usd?: number
  /** Currency code customer was actually charged in (e.g. 'USD', 'EUR'). */
  currency?: string

  product_id?: string
  period_type?: 'NORMAL' | 'TRIAL' | 'INTRO' | 'PROMOTIONAL' | string
  store?: 'APP_STORE' | 'PLAY_STORE' | 'STRIPE' | 'PROMOTIONAL' | string
  environment?: 'SANDBOX' | 'PRODUCTION' | string

  /** RevenueCat project id for v2 webhooks. */
  project_id?: string
  /** RevenueCat app id for v2 webhooks (per-platform). */
  app_id?: string

  /** Some payloads nest details inside `transaction`. */
  transaction?: {
    price?: number
    currency?: string
    product_id?: string
    transaction_id?: string
    [k: string]: unknown
  }

  /** Optional reason fields on cancel/expire events. */
  cancel_reason?: string
  expiration_reason?: string

  [k: string]: unknown
}
