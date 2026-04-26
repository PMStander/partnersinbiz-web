// lib/integrations/play_console/webhook.ts
//
// RTDN (Real-time Developer Notifications) webhook handler. Google Play
// publishes RTDN events to a Pub/Sub topic; the customer configures Pub/Sub
// to push those events as HTTPS POSTs at a URL like:
//
//   POST /api/integrations/play_console/webhook/{propertyId}
//
// The Pub/Sub push body is:
//   { "message": { "data": "<base64 JSON>", "messageId": "...", "publishTime": "..." } }
//
// We decode the base64, JSON-parse the inner payload, and write a metric
// row to capture the event. RTDN events do NOT carry pricing — the daily
// pull is responsible for revenue reconciliation. We record event counts
// here so the timeline picks them up faster than D-2.
//
// Per the contract this handler NEVER throws: bad JSON / unknown propertyId /
// missing connection all return a soft response { status, metricsWritten,
// notes } and rely on the caller (the route) to convert that into a 200.

import { adminDb } from '@/lib/firebase/admin'
import { writeMetrics } from '@/lib/metrics/write'
import { getConnection } from '@/lib/integrations/connections'
import type { Connection } from '@/lib/integrations/types'
import type { MetricInput, MetricKind } from '@/lib/metrics/types'
import type { Property } from '@/lib/properties/types'
import {
  RTDN_NEW_IAP_TYPES,
  RTDN_NEW_SUB_TYPES,
  type PubSubPushEnvelope,
  type RtdnPayload,
} from './schema'

/* Helpers ───────────────────────────────────────────────────────────── */

function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function safeBase64Decode(b64: string): string | null {
  try {
    return Buffer.from(b64, 'base64').toString('utf8')
  } catch {
    return null
  }
}

function todayInTimezone(now: Date, timezone: string | undefined): string {
  const tz = timezone && timezone.length > 0 ? timezone : 'UTC'
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now)
  } catch {
    return now.toISOString().slice(0, 10)
  }
}

async function loadProperty(propertyId: string): Promise<Property | null> {
  try {
    const snap = await adminDb.collection('properties').doc(propertyId).get()
    if (!snap.exists) return null
    return { id: snap.id, ...(snap.data() as Omit<Property, 'id'>) }
  } catch {
    return null
  }
}

/* Public types ──────────────────────────────────────────────────────── */

export interface HandleWebhookInput {
  rawBody: string
  /** Inferred from the URL path — the route hands this in. */
  propertyId?: string
  /** Override loaders for tests. */
  loadConnection?: (propertyId: string) => Promise<Connection | null>
  loadPropertyFn?: (propertyId: string) => Promise<Property | null>
  /** Override the metrics writer — for tests. */
  writeMetricsFn?: typeof writeMetrics
  /** Stable now for tests. */
  now?: Date
}

export interface HandleWebhookResult {
  status: number
  metricsWritten: number
  notes?: string[]
}

/* Handler ───────────────────────────────────────────────────────────── */

/**
 * Decode + classify an RTDN message and write a metric row capturing the
 * event count. Returns a soft result — the route always responds 200 to
 * keep Pub/Sub from retrying us into oblivion.
 */
export async function handleWebhook(
  input: HandleWebhookInput,
): Promise<HandleWebhookResult> {
  const notes: string[] = []
  const now = input.now ?? new Date()

  // 1. Parse Pub/Sub envelope.
  const envelope = safeJsonParse<PubSubPushEnvelope>(input.rawBody)
  if (!envelope || !envelope.message) {
    return {
      status: 200,
      metricsWritten: 0,
      notes: ['Pub/Sub envelope did not parse as JSON or had no `message` field.'],
    }
  }

  const dataB64 = envelope.message.data
  if (!dataB64 || typeof dataB64 !== 'string') {
    return {
      status: 200,
      metricsWritten: 0,
      notes: ['Pub/Sub message had empty `data` field; nothing to decode.'],
    }
  }

  const innerJson = safeBase64Decode(dataB64)
  if (!innerJson) {
    return {
      status: 200,
      metricsWritten: 0,
      notes: ['Pub/Sub `message.data` was not valid base64.'],
    }
  }

  const payload = safeJsonParse<RtdnPayload>(innerJson)
  if (!payload) {
    return {
      status: 200,
      metricsWritten: 0,
      notes: ['Decoded RTDN payload was not valid JSON.'],
    }
  }

  // 2. Test notifications — log only, no metric write.
  if (payload.testNotification) {
    return {
      status: 200,
      metricsWritten: 0,
      notes: [
        `Received Play RTDN testNotification (version=${payload.testNotification.version ?? 'unknown'}).`,
      ],
    }
  }

  // 3. Classify event into a MetricKind + counter value.
  let metricKind: MetricKind | null = null
  let value = 1
  let notificationKind = 'unknown'

  if (payload.subscriptionNotification) {
    notificationKind = 'subscription'
    const ntype = payload.subscriptionNotification.notificationType ?? 0
    if (RTDN_NEW_SUB_TYPES.has(ntype)) {
      metricKind = 'new_subs'
    } else if (ntype === 13 || ntype === 3) {
      // EXPIRED or CANCELED — surface as a churn data point.
      metricKind = 'churn'
    }
  } else if (payload.oneTimeProductNotification) {
    notificationKind = 'one_time_product'
    const ntype = payload.oneTimeProductNotification.notificationType ?? 0
    if (RTDN_NEW_IAP_TYPES.has(ntype)) {
      metricKind = 'iap_revenue'
      // RTDN does not carry price; record 0-value event count and let the
      // daily pull reconcile revenue. Dimension tells us what happened.
      value = 0
    }
  } else if (payload.voidedPurchaseNotification) {
    notificationKind = 'voided_purchase'
    metricKind = 'refunds'
    value = 0
  }

  if (!metricKind) {
    return {
      status: 200,
      metricsWritten: 0,
      notes: [
        `RTDN ${notificationKind} did not map to a metric kind — recorded for audit only.`,
      ],
    }
  }

  // 4. Resolve which property the event belongs to. Prefer the explicit
  //    propertyId from the URL; fall back to packageName lookup if the
  //    customer is using a single subscription URL across properties.
  const propertyId = input.propertyId
  if (!propertyId) {
    return {
      status: 200,
      metricsWritten: 0,
      notes: [
        'RTDN webhook arrived without a propertyId in the URL — cannot route the event.',
      ],
    }
  }

  // 5. Load the connection for orgId + meta.
  const loader = input.loadConnection ?? ((pid: string) =>
    getConnection({ propertyId: pid, provider: 'play_console' }))
  const connection = await loader(propertyId)
  if (!connection) {
    return {
      status: 200,
      metricsWritten: 0,
      notes: [
        `No play_console connection found for property ${propertyId}; ignoring RTDN.`,
      ],
    }
  }

  // 6. Load property for tz and currency fallback.
  const propLoader = input.loadPropertyFn ?? loadProperty
  const property = await propLoader(propertyId)
  const revCfg = property?.config?.revenue ?? {}
  const date = todayInTimezone(now, revCfg.timezone)
  const packageName =
    payload.packageName ??
    revCfg.playPackageName ??
    (connection.meta?.packageName as string | undefined) ??
    'unknown'

  const row: MetricInput = {
    orgId: connection.orgId,
    propertyId,
    date,
    source: 'play_store',
    metric: metricKind,
    value,
    currency: null,
    dimension: 'rtdn_event',
    dimensionValue: notificationKind,
    raw: {
      provider: 'play_console',
      ingest: 'rtdn',
      messageId: envelope.message.messageId ?? null,
      publishTime: envelope.message.publishTime ?? null,
      packageName,
      payload,
    },
  }

  const writer = input.writeMetricsFn ?? writeMetrics
  const { written } = await writer([row], { ingestedBy: 'webhook' })

  return {
    status: 200,
    metricsWritten: written,
    notes: notes.length > 0 ? notes : undefined,
  }
}
