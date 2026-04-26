// lib/integrations/revenuecat/pull-daily.ts
//
// Daily pull for RevenueCat: pulls yesterday's MRR / ARR / active_subs /
// new_subs / trials / churn / subscription_revenue from the v2 metrics
// endpoint and writes them through writeMetrics.
//
// The adapter NEVER throws on missing credentials, missing config, or any
// expected 4xx from RevenueCat (auth, permissions, project-not-found).
// In those cases it returns `{ metricsWritten: 0, notes: [...] }` so the
// dispatcher can record a soft skip.

import { adminDb } from '@/lib/firebase/admin'
import { writeMetrics } from '@/lib/metrics/write'
import type { Connection, PullResult } from '@/lib/integrations/types'
import { maybeDecryptCredentials } from '@/lib/integrations/crypto'
import type { Property } from '@/lib/properties/types'
import type { MetricCurrency, MetricInput, MetricKind } from '@/lib/metrics/types'
import {
  createRevenueCatClient,
  RevenueCatApiError,
  type RevenueCatClient,
} from './client'
import type {
  RevenueCatCredentials,
  RevenueCatMetricItem,
  RevenueCatMetricsResponse,
} from './schema'

/** Map RevenueCat metric ids/slugs to our MetricKind. */
const METRIC_NAME_MAP: Record<string, MetricKind> = {
  mrr: 'mrr',
  monthly_recurring_revenue: 'mrr',
  arr: 'arr',
  annual_recurring_revenue: 'arr',
  active_subscriptions: 'active_subs',
  active_subs: 'active_subs',
  new_subscriptions: 'new_subs',
  new_subs: 'new_subs',
  trials_started: 'trials_started',
  trial_started: 'trials_started',
  trials_converted: 'trials_converted',
  trial_converted: 'trials_converted',
  churn: 'churn',
  churned_subscriptions: 'churn',
  revenue: 'subscription_revenue',
  subscription_revenue: 'subscription_revenue',
  daily_revenue: 'subscription_revenue',
}

/** Metric kinds that carry a currency. Everything else is a count/rate. */
const CURRENCY_METRICS: Set<MetricKind> = new Set([
  'mrr',
  'arr',
  'subscription_revenue',
])

/** Lazily fetched property — cached per call. */
async function getPropertyForConnection(connection: Connection): Promise<Property | null> {
  try {
    const snap = await adminDb
      .collection('properties')
      .doc(connection.propertyId)
      .get()
    if (!snap.exists) return null
    return { id: snap.id, ...(snap.data() as Omit<Property, 'id'>) }
  } catch {
    return null
  }
}

/**
 * Compute the YYYY-MM-DD that represents "yesterday" relative to now in the
 * given IANA timezone. Falls back to UTC if the tz string is invalid.
 */
export function yesterdayInTimezone(now: Date, timezone?: string): string {
  const tz = timezone && timezone.length > 0 ? timezone : 'UTC'
  let todayStr: string
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    todayStr = fmt.format(now) // 'YYYY-MM-DD'
  } catch {
    todayStr = now.toISOString().slice(0, 10)
  }
  // Subtract one day off the date string. We treat dates as wall-clock days
  // in the property's tz; UTC arithmetic is correct here because we only
  // care about adjacent calendar days.
  const [y, m, d] = todayStr.split('-').map((s) => parseInt(s, 10))
  const ms = Date.UTC(y, m - 1, d) - 24 * 60 * 60 * 1000
  return new Date(ms).toISOString().slice(0, 10)
}

/** Default the currency if RevenueCat doesn't echo it back. */
function pickCurrency(
  raw: RevenueCatMetricItem,
  fallback: MetricCurrency,
): MetricCurrency {
  const u = (raw.unit ?? '').toUpperCase()
  if (u === 'ZAR' || u === 'USD' || u === 'EUR' || u === 'GBP' ||
      u === 'AUD' || u === 'CAD' || u === 'NZD' || u === 'JPY') {
    return u as MetricCurrency
  }
  return fallback
}

/** Extract a normalised list of {key, item} from either v2 envelope shape. */
function flattenMetrics(payload: RevenueCatMetricsResponse): RevenueCatMetricItem[] {
  if (Array.isArray(payload.items)) return payload.items
  if (Array.isArray(payload.data)) return payload.data
  // v2 sometimes returns metrics as a keyed object. Fold to items.
  const items: RevenueCatMetricItem[] = []
  for (const [key, val] of Object.entries(payload)) {
    if (key === 'items' || key === 'data' || key === 'object') continue
    if (val && typeof val === 'object' && 'value' in (val as Record<string, unknown>)) {
      const v = val as RevenueCatMetricItem
      items.push({ ...v, name: v.name ?? v.slug ?? key })
    }
  }
  return items
}

/** True when the metric is interesting (we know how to map it). */
function isMappableMetric(item: RevenueCatMetricItem): boolean {
  const id = (item.id ?? item.slug ?? item.name ?? '').toLowerCase()
  return id in METRIC_NAME_MAP
}

interface PullDailyDeps {
  /** Override for tests — ignored in prod. */
  client?: RevenueCatClient
  /** Stable "now" for tests. */
  now?: Date
}

/**
 * Pull daily metrics for a RevenueCat connection. Returns a PullResult with
 * the number of metric rows written. Soft-fails (returns 0 written) for any
 * recoverable error.
 */
export async function pullDaily(
  input: { connection: Connection; window?: { from: string; to: string } },
  deps: PullDailyDeps = {},
): Promise<PullResult> {
  const { connection } = input
  const now = deps.now ?? new Date()

  // 1. Decrypt credentials (soft-fail if missing).
  const creds = maybeDecryptCredentials<RevenueCatCredentials>(
    connection.credentialsEnc,
    connection.orgId,
  )
  if (!creds || !creds.apiKey) {
    return {
      from: '',
      to: '',
      metricsWritten: 0,
      notes: ['No RevenueCat credentials on connection — skipping pull.'],
    }
  }

  // 2. Resolve project id (creds.projectId > connection.meta.projectId > property.config.revenue.revenueCatProjectId).
  const property = await getPropertyForConnection(connection)
  const revCfg = property?.config?.revenue ?? {}
  const projectId =
    creds.projectId ??
    (connection.meta?.projectId as string | undefined) ??
    revCfg.revenueCatProjectId
  const appId = revCfg.revenueCatAppId ?? (connection.meta?.appId as string | undefined)

  if (!projectId) {
    return {
      from: '',
      to: '',
      metricsWritten: 0,
      notes: [
        'No RevenueCat projectId resolved (set Property.config.revenue.revenueCatProjectId or save it on credentials).',
      ],
    }
  }

  // 3. Window resolution: window override > yesterday-in-property-tz.
  const fallbackCurrency: MetricCurrency =
    (revCfg.currency as MetricCurrency | undefined) ?? 'USD'
  const yesterday = yesterdayInTimezone(now, revCfg.timezone)
  const from = input.window?.from ?? yesterday
  const to = input.window?.to ?? yesterday

  const client =
    deps.client ?? createRevenueCatClient({ apiKey: creds.apiKey })

  // 4. Hit the metrics endpoint. Soft-fail on 4xx (config/permission); throw on 5xx.
  let payload: RevenueCatMetricsResponse
  try {
    payload = await client.getProjectMetrics({
      projectId,
      startDate: from,
      endDate: to,
    })
  } catch (err) {
    if (err instanceof RevenueCatApiError && err.status >= 400 && err.status < 500) {
      return {
        from,
        to,
        metricsWritten: 0,
        notes: [
          `RevenueCat returned ${err.status} on /v2/projects/${projectId}/metrics — check the API key and project id.`,
        ],
      }
    }
    throw err
  }

  // 5. Map each metric to a MetricInput row.
  const items = flattenMetrics(payload).filter(isMappableMetric)
  const rows: MetricInput[] = []
  let mrrValue: number | null = null
  let arrSeen = false

  for (const item of items) {
    const slug = (item.id ?? item.slug ?? item.name ?? '').toLowerCase()
    const kind = METRIC_NAME_MAP[slug]
    if (!kind) continue
    const value = typeof item.value === 'number' ? item.value : Number(item.value ?? 0)
    if (!Number.isFinite(value)) continue

    const currency = CURRENCY_METRICS.has(kind)
      ? pickCurrency(item, fallbackCurrency)
      : null

    const row: MetricInput = {
      orgId: connection.orgId,
      propertyId: connection.propertyId,
      date: to,
      source: 'revenuecat',
      metric: kind,
      value,
      currency,
      dimension: appId ? 'app' : null,
      dimensionValue: appId ?? null,
      raw: { provider: 'revenuecat', endpoint: 'v2/metrics', item },
    }
    rows.push(row)

    if (kind === 'mrr') mrrValue = value
    if (kind === 'arr') arrSeen = true
  }

  // 6. Synthesise ARR if missing but MRR is present (ARR = 12 × MRR).
  if (!arrSeen && mrrValue != null && Number.isFinite(mrrValue)) {
    rows.push({
      orgId: connection.orgId,
      propertyId: connection.propertyId,
      date: to,
      source: 'revenuecat',
      metric: 'arr',
      value: mrrValue * 12,
      currency: fallbackCurrency,
      dimension: appId ? 'app' : null,
      dimensionValue: appId ?? null,
      raw: { provider: 'revenuecat', synthesised: 'arr_from_mrr', mrr: mrrValue },
    })
  }

  if (rows.length === 0) {
    return {
      from,
      to,
      metricsWritten: 0,
      notes: ['RevenueCat /v2/projects/{id}/metrics returned no mappable metrics for this window.'],
    }
  }

  const { written } = await writeMetrics(rows, { ingestedBy: 'cron' })
  return { from, to, metricsWritten: written }
}
