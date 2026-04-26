// lib/integrations/types.ts
//
// Public contract for every external-data integration on the platform
// (AdSense, AdMob, RevenueCat, App Store Connect, Play Console, Google Ads,
// GA4, Firebase Analytics, etc).
//
// Every adapter implements `IntegrationAdapter` and writes time-series numbers
// into the unified `metrics` collection (lib/metrics/*). Reports never query
// adapter-specific collections — only `metrics`.

import type { Metric } from '@/lib/metrics/types'

/** Identity for every supported provider. Add new providers here only. */
export type IntegrationProvider =
  | 'adsense'
  | 'admob'
  | 'revenuecat'
  | 'app_store_connect'
  | 'play_console'
  | 'google_ads'
  | 'ga4'
  | 'firebase_analytics'

export const ALL_PROVIDERS: IntegrationProvider[] = [
  'adsense',
  'admob',
  'revenuecat',
  'app_store_connect',
  'play_console',
  'google_ads',
  'ga4',
  'firebase_analytics',
]

/** OAuth (token-based) vs API-key (RevenueCat) vs JWT-signed (App Store Connect, Play). */
export type IntegrationAuthKind = 'oauth2' | 'api_key' | 'jwt' | 'service_account'

export type ConnectionStatus =
  | 'connected'
  | 'reauth_required'
  | 'error'
  | 'paused'
  | 'pending'

/**
 * One row per integration per property. Lives at:
 *   properties/{propertyId}/connections/{provider}
 *
 * Credentials are stored encrypted via lib/integrations/crypto. The `meta`
 * field carries provider-specific reference IDs (account ids, app ids, etc.)
 * that the adapter needs to resolve which data to pull.
 */
export interface Connection {
  id: string // = provider
  provider: IntegrationProvider
  propertyId: string
  orgId: string
  authKind: IntegrationAuthKind
  status: ConnectionStatus
  /** AES-256-GCM encrypted JSON blob — see lib/integrations/crypto. */
  credentialsEnc: {
    ciphertext: string
    iv: string
    tag: string
  } | null
  /** Provider-specific identifiers (publisher id, app id, customer id, etc.). */
  meta: Record<string, unknown>
  /** OAuth scopes granted, if applicable. */
  scope: string[]
  lastPulledAt: unknown // Firestore Timestamp
  lastSuccessAt: unknown
  lastError: string | null
  consecutiveFailures: number
  /** Backfill window already completed, in ISO date 'YYYY-MM-DD'. */
  backfilledThrough: string | null
  createdAt: unknown
  updatedAt: unknown
  createdBy: string
  createdByType: 'user' | 'agent' | 'system'
}

/** Result returned by every pull invocation. */
export interface PullResult {
  /** Inclusive date range covered by this pull, in property timezone. */
  from: string // 'YYYY-MM-DD'
  to: string // 'YYYY-MM-DD'
  /** Count of metric rows written. */
  metricsWritten: number
  /** Provider-specific notes — surfaced in admin UI. */
  notes?: string[]
}

/** What every adapter exports as `default`. */
export interface IntegrationAdapter {
  provider: IntegrationProvider
  authKind: IntegrationAuthKind

  /** Display info for the connections admin UI. */
  display: {
    name: string
    description: string
    iconKey?: string
    docsUrl?: string
    /** Console URL where the user creates the API key / OAuth client. */
    consoleUrl?: string
  }

  /**
   * Begin an OAuth flow. Returns a URL to redirect the admin/user to.
   * Only implemented for `oauth2` adapters.
   */
  beginOAuth?: (input: {
    propertyId: string
    orgId: string
    redirectUri: string
    state: string
  }) => Promise<{ authorizeUrl: string }>

  /**
   * Complete an OAuth callback — exchange the code for tokens and persist a
   * Connection. Only implemented for `oauth2` adapters.
   */
  completeOAuth?: (input: {
    propertyId: string
    orgId: string
    code: string
    redirectUri: string
  }) => Promise<Connection>

  /**
   * Save a non-OAuth credential (api key / service account / JWT key).
   * Only implemented for non-oauth2 adapters.
   */
  saveCredentials?: (input: {
    propertyId: string
    orgId: string
    /** Provider-specific shape — adapter validates. */
    payload: Record<string, unknown>
  }) => Promise<Connection>

  /**
   * Pull yesterday-and-earlier daily metrics for this connection. Adapter
   * decides the exact window (default: last completed day in property tz).
   * Idempotent: writing the same (orgId,propertyId,date,source,metric,dim,dimValue)
   * twice produces one row.
   */
  pullDaily: (input: {
    connection: Connection
    /** Optional override window for backfill. Inclusive both ends. */
    window?: { from: string; to: string }
  }) => Promise<PullResult>

  /**
   * Optional webhook handler. Adapters that support webhooks (RevenueCat,
   * Play RTDN) export this; the platform mounts at /api/integrations/<provider>/webhook.
   */
  handleWebhook?: (input: {
    rawBody: string
    headers: Record<string, string>
  }) => Promise<{ status: number; metricsWritten: number; notes?: string[] }>

  /**
   * Optional teardown — revoke OAuth tokens, etc. Called on disconnect.
   */
  revoke?: (input: { connection: Connection }) => Promise<void>
}

/**
 * Helper a pullDaily implementation calls to actually write metrics. Wraps
 * lib/metrics/write so adapters don't have to import Firestore directly.
 */
export type WriteMetrics = (rows: Metric[]) => Promise<{ written: number }>

/** Common shape for an adapter's pull function to return rows from. */
export interface MetricRowDraft {
  date: string // 'YYYY-MM-DD'
  metric: Metric['metric']
  value: number
  currency?: Metric['currency']
  dimension?: string
  dimensionValue?: string
  raw?: Record<string, unknown>
}
