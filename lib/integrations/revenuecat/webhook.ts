// lib/integrations/revenuecat/webhook.ts
//
// Webhook handler for RevenueCat. RevenueCat signs every webhook with an
// HMAC-SHA256 of the raw request body using a per-connection secret. The
// secret is created when the user wires up the webhook URL in RevenueCat and
// is saved on `connection.meta.webhookSecret`.
//
// The propertyId is determined by the route path
//   POST /api/integrations/revenuecat/webhook/[propertyId]
// and forwarded into the adapter via the `x-pib-property-id` header so the
// adapter conforms to the IntegrationAdapter handleWebhook signature
// (`rawBody, headers`).

import crypto from 'crypto'
import { writeMetrics } from '@/lib/metrics/write'
import { getConnection } from '@/lib/integrations/connections'
import { maybeDecryptCredentials } from '@/lib/integrations/crypto'
import type { Connection } from '@/lib/integrations/types'
import type { MetricCurrency, MetricInput } from '@/lib/metrics/types'
import { adminDb } from '@/lib/firebase/admin'
import type { Property } from '@/lib/properties/types'
import type {
  RevenueCatCredentials,
  RevenueCatWebhookEnvelope,
  RevenueCatWebhookEvent,
} from './schema'

/**
 * Header used by the route handler to inject the propertyId from the URL
 * into the adapter, since `IntegrationAdapter.handleWebhook` is path-agnostic.
 */
export const PROPERTY_ID_HEADER = 'x-pib-property-id'

/**
 * Constant-time comparison of two HMAC hex digests. Returns false if either
 * input is empty/invalid.
 */
function safeEquals(a: string, b: string): boolean {
  if (!a || !b) return false
  if (a.length !== b.length) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
  } catch {
    return false
  }
}

/**
 * Verify the RevenueCat signature. RevenueCat sends the signature in
 * `X-RevenueCat-Signature` (some payloads use `Authorization: Bearer <secret>`
 * instead — we accept both).
 */
export function verifyRevenueCatSignature(input: {
  rawBody: string
  headers: Record<string, string>
  secret: string
}): boolean {
  if (!input.secret) return false
  const sigHeader =
    input.headers['x-revenuecat-signature'] ??
    input.headers['X-RevenueCat-Signature'] ??
    input.headers['x-revenuecat-sig']
  if (sigHeader) {
    const expected = crypto
      .createHmac('sha256', input.secret)
      .update(input.rawBody)
      .digest('hex')
    // RevenueCat signature header may be hex; if base64, normalise.
    const got = sigHeader.trim().replace(/^sha256=/, '')
    if (safeEquals(got, expected)) return true
    // Also try a base64 form.
    try {
      const expectedB64 = crypto
        .createHmac('sha256', input.secret)
        .update(input.rawBody)
        .digest('base64')
      if (got === expectedB64) return true
    } catch {
      // ignore
    }
    return false
  }
  // RevenueCat also supports a bearer-style secret in the Authorization
  // header — useful when HMAC isn't configured. Plain compare is fine here
  // because the secret is fully embedded in the header value.
  const auth = input.headers['authorization'] ?? input.headers['Authorization']
  if (auth && auth.startsWith('Bearer ')) {
    return auth.slice('Bearer '.length).trim() === input.secret
  }
  return false
}

async function getPropertyCurrency(propertyId: string): Promise<MetricCurrency> {
  try {
    const snap = await adminDb.collection('properties').doc(propertyId).get()
    if (!snap.exists) return 'USD'
    const prop = snap.data() as Property
    return (prop.config?.revenue?.currency as MetricCurrency | undefined) ?? 'USD'
  } catch {
    return 'USD'
  }
}

/**
 * Convert a RevenueCat event into the metric rows we want to write. Handles
 * the event-type mapping spelled out in the adapter spec:
 *
 *   INITIAL_PURCHASE → subscription_revenue
 *   RENEWAL          → subscription_revenue
 *   CANCELLATION     → churn (count = 1)
 *   EXPIRATION       → churn (count = 1)
 *   BILLING_ISSUE    → no metric (don't bump churn yet)
 */
export function eventToMetricRows(input: {
  connection: Connection
  event: RevenueCatWebhookEvent
  fallbackCurrency: MetricCurrency
  date: string
}): MetricInput[] {
  const { connection, event, fallbackCurrency, date } = input

  const baseDim = connection.meta?.appId
    ? { dimension: 'app', dimensionValue: connection.meta.appId as string }
    : { dimension: null as string | null, dimensionValue: null as string | null }

  const baseRow = {
    orgId: connection.orgId,
    propertyId: connection.propertyId,
    date,
    source: 'revenuecat' as const,
    raw: { provider: 'revenuecat', source: 'webhook', event },
    ...baseDim,
  }

  switch (event.type) {
    case 'INITIAL_PURCHASE':
    case 'RENEWAL':
    case 'NON_RENEWING_PURCHASE': {
      const price =
        event.transaction?.price ??
        event.price ??
        event.price_in_purchased_currency ??
        event.price_usd
      if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
        return []
      }
      const rawCurrency = (event.transaction?.currency ?? event.currency ?? '').toUpperCase()
      const currency: MetricCurrency =
        rawCurrency === 'ZAR' || rawCurrency === 'USD' || rawCurrency === 'EUR' ||
        rawCurrency === 'GBP' || rawCurrency === 'AUD' || rawCurrency === 'CAD' ||
        rawCurrency === 'NZD' || rawCurrency === 'JPY'
          ? rawCurrency
          : fallbackCurrency
      return [
        {
          ...baseRow,
          metric: 'subscription_revenue',
          value: price,
          currency,
        },
      ]
    }
    case 'CANCELLATION':
    case 'EXPIRATION':
      return [
        {
          ...baseRow,
          metric: 'churn',
          value: 1,
          currency: null,
        },
      ]
    case 'BILLING_ISSUE':
    default:
      return []
  }
}

interface HandleWebhookDeps {
  /** Override for tests — overrides connection lookup. */
  loadConnection?: (propertyId: string) => Promise<Connection | null>
  /** Override for tests — overrides property currency lookup. */
  loadCurrency?: (propertyId: string) => Promise<MetricCurrency>
  /** Stable "now" for tests. */
  now?: Date
}

/**
 * Top-level webhook handler. Conforms to `IntegrationAdapter.handleWebhook`.
 * The route is responsible for setting `x-pib-property-id` from the URL.
 */
export async function handleWebhook(
  input: { rawBody: string; headers: Record<string, string> },
  deps: HandleWebhookDeps = {},
): Promise<{ status: number; metricsWritten: number; notes?: string[] }> {
  const propertyId =
    input.headers[PROPERTY_ID_HEADER] ?? input.headers[PROPERTY_ID_HEADER.toLowerCase()]
  if (!propertyId) {
    return {
      status: 400,
      metricsWritten: 0,
      notes: ['Missing propertyId in webhook URL.'],
    }
  }

  const loadConnection =
    deps.loadConnection ??
    ((pid: string) => getConnection({ propertyId: pid, provider: 'revenuecat' }))

  const connection = await loadConnection(propertyId)
  if (!connection) {
    return {
      status: 404,
      metricsWritten: 0,
      notes: [`No RevenueCat connection found for property ${propertyId}.`],
    }
  }

  const webhookSecret = connection.meta?.webhookSecret as string | undefined
  // Decrypt credentials so we have an apiKey for sanity (not required for verify).
  // Allow either a webhookSecret OR a bearer match against the apiKey.
  let secret = webhookSecret ?? ''
  if (!secret) {
    const creds = maybeDecryptCredentials<RevenueCatCredentials>(
      connection.credentialsEnc,
      connection.orgId,
    )
    if (creds?.apiKey) secret = creds.apiKey
  }

  if (!secret) {
    return {
      status: 401,
      metricsWritten: 0,
      notes: ['No webhook secret on connection.meta.webhookSecret.'],
    }
  }

  const ok = verifyRevenueCatSignature({
    rawBody: input.rawBody,
    headers: input.headers,
    secret,
  })
  if (!ok) {
    return {
      status: 401,
      metricsWritten: 0,
      notes: ['Webhook signature verification failed.'],
    }
  }

  // Parse the envelope.
  let envelope: RevenueCatWebhookEnvelope
  try {
    envelope = JSON.parse(input.rawBody) as RevenueCatWebhookEnvelope
  } catch {
    return {
      status: 400,
      metricsWritten: 0,
      notes: ['Webhook body was not valid JSON.'],
    }
  }
  const event = envelope.event
  if (!event || !event.type) {
    return {
      status: 200,
      metricsWritten: 0,
      notes: ['Webhook envelope missing event.type — nothing to do.'],
    }
  }

  // Date in property tz: fall back to today in UTC if we can't resolve.
  const now = deps.now ?? new Date()
  const date = (event.event_timestamp_ms
    ? new Date(event.event_timestamp_ms)
    : now
  )
    .toISOString()
    .slice(0, 10)

  const fallbackCurrency =
    deps.loadCurrency
      ? await deps.loadCurrency(propertyId)
      : await getPropertyCurrency(propertyId)

  const rows = eventToMetricRows({
    connection,
    event,
    fallbackCurrency,
    date,
  })
  if (rows.length === 0) {
    return {
      status: 200,
      metricsWritten: 0,
      notes: [`RevenueCat event '${event.type}' produced no metric rows.`],
    }
  }

  const { written } = await writeMetrics(rows, { ingestedBy: 'webhook' })
  return { status: 200, metricsWritten: written }
}
