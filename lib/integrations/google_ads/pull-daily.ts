// lib/integrations/google_ads/pull-daily.ts
//
// Daily metrics pull for Google Ads. For each day in the requested window we:
//   1. Refresh the access token if expired (Google's offline refresh flow).
//   2. Fetch the customer's currency_code + time_zone (locked on first pull
//      and cached on Connection.meta).
//   3. Run a GAQL query at customer-grain for that single day.
//   4. Convert micros → currency units and write the metric rows.
//
// We never throw on missing credentials/customer id — we return a `PullResult`
// with `metricsWritten: 0` and a `notes` array so the caller can surface the
// state in the admin UI.

import type { Connection, PullResult } from '@/lib/integrations/types'
import type { MetricInput, MetricCurrency, MetricKind } from '@/lib/metrics/types'

/**
 * Local writer signature — tests can pass a stub. The real `writeMetrics`
 * (lib/metrics/write) already accepts `MetricInput[]`; we re-type that
 * narrowly here so the test seam stays simple.
 */
export type GoogleAdsWriteMetrics = (
  rows: MetricInput[],
) => Promise<{ written: number }>
import { writeMetrics as defaultWriteMetrics } from '@/lib/metrics/write'
import { adminDb } from '@/lib/firebase/admin'
import type { Property } from '@/lib/properties/types'
import { upsertConnection } from '@/lib/integrations/connections'
import { decryptCredentials } from '@/lib/integrations/crypto'
import { createGoogleAdsClient, GoogleAdsApiError, type GoogleAdsClient } from './client'
import {
  refreshAccessToken,
  readDeveloperToken,
  readLoginCustomerId,
  stripCustomerIdDashes,
} from './oauth'
import {
  buildDailyGaql,
  normalizeCurrency,
  type GoogleAdsCredentials,
  type GoogleAdsConnectionMeta,
  type GoogleAdsRow,
} from './schema'

/* Public input/result shapes ────────────────────────────────────────── */

export interface PullDailyInput {
  connection: Connection
  /** Inclusive override window. Defaults to "yesterday only" in property tz. */
  window?: { from: string; to: string }
  /**
   * Test seam: override `writeMetrics` and the client factory so unit tests
   * can run without Firestore or real fetch.
   */
  writeMetrics?: GoogleAdsWriteMetrics
  /** Test seam: build a Google Ads client (with a stubbed token / fetch). */
  createClient?: (input: { accessToken: string }) => GoogleAdsClient
  /** Test seam: override the OAuth refresh function. */
  refresh?: (
    refreshToken: string,
  ) => Promise<{ access_token: string; expires_in: number; refresh_token?: string } | null>
  /** Test seam: load a property without Firestore. */
  loadProperty?: (
    propertyId: string,
  ) => Promise<{
    googleAdsCustomerId?: string | null
    timezone?: string | null
    currency?: MetricCurrency | null
  } | null>
  /** Test seam: override the upsert that persists meta updates. */
  saveMeta?: (input: {
    propertyId: string
    orgId: string
    meta: Record<string, unknown>
    credentials?: Record<string, unknown> | null
  }) => Promise<void>
}

/* Helpers ───────────────────────────────────────────────────────────── */

function todayInTimezone(timezone: string | null | undefined): string {
  // Format YYYY-MM-DD in the requested IANA tz. Falls back to UTC.
  const tz = timezone ?? 'UTC'
  const d = new Date()
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    return fmt.format(d) // 'YYYY-MM-DD' (en-CA gives ISO order)
  } catch {
    return d.toISOString().slice(0, 10)
  }
}

function shiftDate(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

function eachDate(from: string, to: string): string[] {
  const out: string[] = []
  let cur = from
  while (cur <= to) {
    out.push(cur)
    cur = shiftDate(cur, 1)
  }
  return out
}

function toNumber(v: string | number | undefined): number {
  if (v == null) return 0
  if (typeof v === 'number') return v
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/* Property loader (default: real Firestore) ─────────────────────────── */

async function loadPropertyDefault(propertyId: string): Promise<{
  googleAdsCustomerId?: string | null
  timezone?: string | null
  currency?: MetricCurrency | null
} | null> {
  try {
    const snap = await adminDb.collection('properties').doc(propertyId).get()
    if (!snap.exists) return null
    const property = { id: snap.id, ...(snap.data() as Omit<Property, 'id'>) }
    const revenue = property.config?.revenue ?? {}
    return {
      googleAdsCustomerId: revenue.googleAdsCustomerId ?? null,
      timezone: revenue.timezone ?? null,
      currency: (revenue.currency as MetricCurrency | undefined) ?? null,
    }
  } catch {
    return null
  }
}

/* Default meta saver ────────────────────────────────────────────────── */

async function saveMetaDefault(input: {
  propertyId: string
  orgId: string
  meta: Record<string, unknown>
  credentials?: Record<string, unknown> | null
}): Promise<void> {
  await upsertConnection({
    propertyId: input.propertyId,
    orgId: input.orgId,
    provider: 'google_ads',
    authKind: 'oauth2',
    credentials: input.credentials ?? undefined,
    meta: input.meta,
    createdBy: 'system',
    createdByType: 'system',
  })
}

/* Token refresh wrapper ─────────────────────────────────────────────── */

async function refreshDefault(
  refreshToken: string,
): Promise<
  | { access_token: string; expires_in: number; refresh_token?: string }
  | null
> {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() ?? ''
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() ?? ''
  if (!clientId || !clientSecret || !refreshToken) return null
  const res = await refreshAccessToken({
    refreshToken,
    clientId,
    clientSecret,
  })
  if (!res) return null
  return {
    access_token: res.access_token,
    expires_in: res.expires_in ?? 0,
    refresh_token: res.refresh_token,
  }
}

/* Map one Google Ads row → metric rows ──────────────────────────────── */

interface MapRowInput {
  orgId: string
  propertyId: string
  date: string
  currency: MetricCurrency
  row: GoogleAdsRow
}

function rowToMetrics(input: MapRowInput): MetricInput[] {
  const m = input.row.metrics ?? {}
  const out: MetricInput[] = []

  const baseDims = { dimension: null as string | null, dimensionValue: null as string | null }

  const push = (
    metric: MetricKind,
    value: number,
    currency: MetricCurrency | null,
  ) => {
    out.push({
      orgId: input.orgId,
      propertyId: input.propertyId,
      date: input.date,
      source: 'google_ads',
      metric,
      value,
      currency,
      raw: input.row as Record<string, unknown>,
      ...baseDims,
    })
  }

  const costMicros = toNumber(m.costMicros)
  const cost = costMicros / 1_000_000
  const impressions = toNumber(m.impressions)
  const clicks = toNumber(m.clicks)
  const ctr = toNumber(m.ctr)
  const cpc = toNumber(m.averageCpc) / 1_000_000
  const conversions = toNumber(m.conversions)
  const conversionsValue = toNumber(m.conversionsValue)

  // ad_spend always emitted (zero is meaningful — "we paused this day").
  push('ad_spend', cost, input.currency)
  push('impressions', impressions, null)
  push('clicks', clicks, null)
  push('ctr', ctr, null)
  push('cpc', cpc, input.currency)
  push('conversions', conversions, null)

  if (cost > 0) {
    const roas = conversionsValue / cost
    if (Number.isFinite(roas)) {
      push('roas', roas, null)
    }
  }

  return out
}

/* The public pullDaily entry-point ──────────────────────────────────── */

export async function pullDaily(input: PullDailyInput): Promise<PullResult> {
  const notes: string[] = []
  const { connection } = input

  const writeMetrics = input.writeMetrics ?? defaultWriteMetrics
  const refresh = input.refresh ?? refreshDefault
  const loadProperty = input.loadProperty ?? loadPropertyDefault
  const saveMeta = input.saveMeta ?? saveMetaDefault

  // 0. Sanity-check the developer token. Without it nothing else will work.
  const developerToken = readDeveloperToken()
  if (!developerToken) {
    notes.push('GOOGLE_ADS_DEVELOPER_TOKEN missing — pull skipped')
  }

  // 1. Resolve the property → customer id, timezone, currency.
  const propertyInfo = await loadProperty(connection.propertyId).catch(() => null)
  const customerId = stripCustomerIdDashes(propertyInfo?.googleAdsCustomerId ?? '')
  if (!customerId) {
    notes.push('Property.config.revenue.googleAdsCustomerId missing — pull skipped')
  }

  const timezone = propertyInfo?.timezone ?? null

  // 2. Decrypt credentials. If the connection has no creds, bail with notes.
  let credentials: GoogleAdsCredentials | null = null
  try {
    if (connection.credentialsEnc) {
      credentials = decryptCredentials<GoogleAdsCredentials>(
        connection.credentialsEnc,
        connection.orgId,
      )
    }
  } catch {
    notes.push('credentials_decrypt_failed')
  }
  if (!credentials || !credentials.accessToken) {
    notes.push('No credentials on connection — reconnect required')
  }

  // 3. Build the date window. Default = yesterday only, in property timezone.
  const today = todayInTimezone(timezone)
  const yesterday = shiftDate(today, -1)
  const fromRaw = input.window?.from ?? yesterday
  const toRaw = input.window?.to ?? yesterday

  // Normalize ordering. If from > to, swap.
  const from = fromRaw <= toRaw ? fromRaw : toRaw
  const to = fromRaw <= toRaw ? toRaw : fromRaw

  // Bail early if any prerequisite is missing — we still return a structured
  // result so the dispatcher can record the connection's state.
  if (!developerToken || !customerId || !credentials || !credentials.accessToken) {
    return { from, to, metricsWritten: 0, notes }
  }

  // 4. Refresh the token if it's about to expire (60s safety margin).
  let accessToken = credentials.accessToken
  let refreshToken = credentials.refreshToken
  let expiresAt = credentials.expiresAt
  const needsRefresh =
    !expiresAt || expiresAt <= Date.now() + 60_000

  let credentialsToPersist: Record<string, unknown> | null = null

  if (needsRefresh && refreshToken) {
    const refreshed = await refresh(refreshToken)
    if (!refreshed?.access_token) {
      notes.push('access_token_refresh_failed')
      return { from, to, metricsWritten: 0, notes }
    }
    accessToken = refreshed.access_token
    expiresAt = Date.now() + (refreshed.expires_in ?? 0) * 1000
    if (refreshed.refresh_token) refreshToken = refreshed.refresh_token
    credentialsToPersist = {
      accessToken,
      refreshToken,
      expiresAt,
    } satisfies GoogleAdsCredentials
  } else if (needsRefresh && !refreshToken) {
    notes.push('access_token_expired_and_no_refresh_token')
    return { from, to, metricsWritten: 0, notes }
  }

  // 5. Build the client and make sure we know the customer's currency.
  const loginCustomerId =
    (connection.meta?.loginCustomerId as string | undefined) ?? readLoginCustomerId() ?? null

  const client = (input.createClient ?? ((init) =>
    createGoogleAdsClient({
      accessToken: init.accessToken,
      developerToken,
      loginCustomerId,
    })))({ accessToken })

  let connectionCurrency =
    (connection.meta?.currencyCode as string | undefined) ?? null

  if (!connectionCurrency) {
    try {
      const settings = await client.getCustomerSettings({ customerId })
      connectionCurrency = settings?.currencyCode ?? null
      // Persist what we discovered so the next pull doesn't re-fetch.
      const newMeta: GoogleAdsConnectionMeta = {
        ...(connection.meta as GoogleAdsConnectionMeta),
        customerId,
        currencyCode: connectionCurrency ?? undefined,
        timeZone: settings?.timeZone ?? (connection.meta?.timeZone as string | undefined),
      }
      await saveMeta({
        propertyId: connection.propertyId,
        orgId: connection.orgId,
        meta: newMeta,
        credentials: credentialsToPersist ?? undefined,
      }).catch((err) => {
        notes.push(`meta_persist_failed: ${(err as Error).message}`)
      })
      // Don't double-save credentials below.
      credentialsToPersist = null
    } catch (err) {
      if (err instanceof GoogleAdsApiError) {
        notes.push(
          `customer_settings_failed: ${err.status} ${err.payload?.message ?? err.message}`,
        )
      } else {
        notes.push(`customer_settings_failed: ${(err as Error).message}`)
      }
      // Continue with a default — the daily query still works.
    }
  }

  const propertyCurrency = (propertyInfo?.currency ?? null) as MetricCurrency | null
  const currency: MetricCurrency = normalizeCurrency(
    connectionCurrency ?? propertyCurrency ?? undefined,
  )

  // 6. Pull each day in the window. We loop one day at a time so the
  //    GAQL `WHERE segments.date = 'YYYY-MM-DD'` clause stays valid.
  const dates = eachDate(from, to)
  const allRows: MetricInput[] = []

  for (const date of dates) {
    try {
      const { rows } = await client.searchStream({
        customerId,
        query: buildDailyGaql(date),
      })

      if (rows.length === 0) {
        // No spend on this day. Still emit explicit zeros so reports plot
        // a continuous line — Google won't return a row when there's
        // literally no activity on the customer for that date.
        allRows.push(
          ...rowToMetrics({
            orgId: connection.orgId,
            propertyId: connection.propertyId,
            date,
            currency,
            row: { segments: { date }, metrics: {} },
          }),
        )
        continue
      }

      for (const row of rows) {
        const rowDate = row.segments?.date ?? date
        allRows.push(
          ...rowToMetrics({
            orgId: connection.orgId,
            propertyId: connection.propertyId,
            date: rowDate,
            currency,
            row,
          }),
        )
      }
    } catch (err) {
      if (err instanceof GoogleAdsApiError) {
        notes.push(`pull_failed_${date}: ${err.status} ${err.payload?.message ?? err.message}`)
      } else {
        notes.push(`pull_failed_${date}: ${(err as Error).message}`)
      }
    }
  }

  // 7. Persist any credentials we refreshed but haven't saved yet.
  if (credentialsToPersist) {
    await saveMeta({
      propertyId: connection.propertyId,
      orgId: connection.orgId,
      meta: {
        ...(connection.meta as GoogleAdsConnectionMeta),
        customerId,
        currencyCode: currency,
      },
      credentials: credentialsToPersist,
    }).catch((err) => {
      notes.push(`credentials_persist_failed: ${(err as Error).message}`)
    })
  }

  // 8. Write metrics.
  let metricsWritten = 0
  if (allRows.length > 0) {
    const result = await writeMetrics(allRows)
    metricsWritten = result.written
  }

  return { from, to, metricsWritten, notes: notes.length ? notes : undefined }
}
