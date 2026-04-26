// lib/metrics/types.ts
//
// The metrics fact table. ONE row = one daily-grain measurement from one
// source. Append-only. Reports query this table only.

export type MetricSource =
  | 'adsense'
  | 'admob'
  | 'revenuecat'
  | 'app_store'
  | 'play_store'
  | 'google_ads'
  | 'ga4'
  | 'firebase_analytics'
  | 'pib_analytics'
  | 'pib_invoices'
  | 'pib_social'

export const ALL_METRIC_SOURCES: MetricSource[] = [
  'adsense',
  'admob',
  'revenuecat',
  'app_store',
  'play_store',
  'google_ads',
  'ga4',
  'firebase_analytics',
  'pib_analytics',
  'pib_invoices',
  'pib_social',
]

/**
 * The metric *kind* — keep this list small and shared. Provider-specific
 * dimensions go in the `dimension` field, not in new metric names.
 */
export type MetricKind =
  // Money
  | 'revenue'
  | 'mrr'
  | 'arr'
  | 'ad_revenue'
  | 'iap_revenue'
  | 'subscription_revenue'
  | 'ad_spend'
  | 'refunds'
  | 'net_revenue'
  // Subscriptions
  | 'active_subs'
  | 'new_subs'
  | 'churn'
  | 'trials_started'
  | 'trials_converted'
  | 'ltv'
  | 'arpu'
  // Ads
  | 'impressions'
  | 'clicks'
  | 'ctr'
  | 'rpm'
  | 'ecpm'
  | 'match_rate'
  | 'ad_requests'
  // Mobile / app store
  | 'installs'
  | 'uninstalls'
  | 'sessions_app'
  | 'ratings_count'
  | 'ratings_avg'
  | 'crashes'
  // Web / analytics
  | 'sessions'
  | 'pageviews'
  | 'users'
  | 'new_users'
  | 'engaged_sessions'
  | 'bounce_rate'
  | 'avg_session_duration'
  | 'conversions'
  | 'conversion_rate'
  // Marketing
  | 'roas'
  | 'cpa'
  | 'cpc'

export type MetricCurrency = 'ZAR' | 'USD' | 'EUR' | 'GBP' | 'AUD' | 'CAD' | 'NZD' | 'JPY'

export const ALL_METRIC_CURRENCIES: MetricCurrency[] = [
  'ZAR', 'USD', 'EUR', 'GBP', 'AUD', 'CAD', 'NZD', 'JPY',
]

/**
 * Composite uniqueness:
 *   (orgId, propertyId, date, source, metric, dimension, dimensionValue)
 *
 * The doc id is a hash of those fields so re-writes are idempotent.
 */
export interface Metric {
  id: string
  orgId: string
  propertyId: string
  date: string // 'YYYY-MM-DD' — in the property's timezone
  source: MetricSource
  metric: MetricKind
  value: number
  currency: MetricCurrency | null
  /** Always populated when `currency` is set; FX rate is the rate FOR `date`. */
  valueZar: number | null
  /** Optional breakdown axis: 'country' | 'campaign' | 'ad_unit' | 'sku' | 'plan' | 'platform'. */
  dimension: string | null
  dimensionValue: string | null
  /** Last provider payload — for audit / debugging only. Never read by reports. */
  raw: Record<string, unknown> | null
  ingestedAt: unknown // Firestore Timestamp
  ingestedBy: 'cron' | 'webhook' | 'admin' | 'agent' | 'backfill'
}

/** Input shape for `writeMetrics`. The id is derived inside writeMetrics. */
export type MetricInput = Omit<
  Metric,
  'id' | 'valueZar' | 'ingestedAt' | 'ingestedBy'
> & {
  ingestedBy?: Metric['ingestedBy']
}
