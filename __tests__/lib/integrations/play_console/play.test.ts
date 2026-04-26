// __tests__/lib/integrations/play_console/play.test.ts
//
// Unit tests for the Google Play Console integration adapter.
// Covers: JWT signing, token caching, daily pull, RTDN webhook handler.
//
// All tests mock fetch + helpers. Auth tests sign a real JWT with a
// freshly generated RSA keypair and verify the signature locally.

// 64-char hex master key for SOCIAL_TOKEN_MASTER_KEY (used by encrypt helpers).
process.env.SOCIAL_TOKEN_MASTER_KEY =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

// Stub firebase admin BEFORE importing anything that pulls it in.
const mockGet = jest.fn()
const mockBatchSet = jest.fn()
const mockBatchCommit = jest.fn(async () => {})
const mockCollection = jest.fn()
const mockDoc = jest.fn()
const mockBatch = jest.fn(() => ({ set: mockBatchSet, commit: mockBatchCommit }))

jest.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: mockCollection,
    batch: mockBatch,
  },
}))

// fx/rates is hit by writeMetrics — short-circuit it.
jest.mock('@/lib/fx/rates', () => ({
  convertToZar: jest.fn(async () => null),
}))

// firebase-admin/firestore — only the FieldValue we actually use.
jest.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: () => ({ __serverTimestamp: true }),
  },
}))

import crypto from 'crypto'
import {
  signJwt,
  buildAssertionJwt,
  parseServiceAccountJson,
  getAccessToken,
  _clearTokenCache,
} from '@/lib/integrations/play_console/auth'
import {
  PLAY_REPORTING_SCOPE,
  GOOGLE_TOKEN_URL,
  type PlayServiceAccountKey,
} from '@/lib/integrations/play_console/schema'
import {
  createPlayClient,
  PlayApiError,
} from '@/lib/integrations/play_console/client'
import { pullDaily, targetDateInTimezone } from '@/lib/integrations/play_console/pull-daily'
import { handleWebhook } from '@/lib/integrations/play_console/webhook'
import { encryptCredentials } from '@/lib/integrations/crypto'
import type { Connection } from '@/lib/integrations/types'

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Generate a fresh RSA keypair for tests so we never read real secrets. */
function makeFreshKey(): PlayServiceAccountKey {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  })
  ;(makeFreshKey as unknown as { lastPublicKey?: crypto.KeyObject }).lastPublicKey = publicKey
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string
  return {
    type: 'service_account',
    project_id: 'test-project',
    private_key_id: 'test-key-id',
    private_key: pem,
    client_email: 'play-test@test-project.iam.gserviceaccount.com',
  }
}

/** Decode a base64url string back to Buffer. */
function base64UrlToBuffer(s: string): Buffer {
  const pad = '='.repeat((4 - (s.length % 4)) % 4)
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64')
}

/** Verify a JWT against a public key (RS256). */
function verifyJwt(token: string, publicKey: crypto.KeyObject): boolean {
  const [h, p, sig] = token.split('.')
  if (!h || !p || !sig) return false
  const verifier = crypto.createVerify('RSA-SHA256')
  verifier.update(`${h}.${p}`)
  verifier.end()
  return verifier.verify(publicKey, base64UrlToBuffer(sig))
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const [, p] = token.split('.')
  return JSON.parse(base64UrlToBuffer(p).toString('utf8'))
}

function makeFetchMock(
  responses: Array<{ ok: boolean; status: number; body: string | object }>,
): jest.Mock {
  const queue = [...responses]
  return jest.fn(async () => {
    const next = queue.shift()
    if (!next) throw new Error('makeFetchMock ran out of canned responses')
    const body = typeof next.body === 'string' ? next.body : JSON.stringify(next.body)
    return {
      ok: next.ok,
      status: next.status,
      statusText: next.ok ? 'OK' : 'ERR',
      text: async () => body,
    } as unknown as Response
  })
}

function makeConnection(
  overrides: Partial<Connection> & { credentialsJson?: string } = {},
): Connection {
  const sa = overrides.credentialsJson
  const credentialsEnc = sa
    ? encryptCredentials(
        { serviceAccountJson: sa, key: JSON.parse(sa) } as unknown as Record<string, unknown>,
        'org_a',
      )
    : null
  return {
    id: 'play_console',
    provider: 'play_console',
    propertyId: 'prop_a',
    orgId: 'org_a',
    authKind: 'service_account',
    status: 'connected',
    credentialsEnc,
    meta: {},
    scope: [PLAY_REPORTING_SCOPE],
    lastPulledAt: null,
    lastSuccessAt: null,
    lastError: null,
    consecutiveFailures: 0,
    backfilledThrough: null,
    createdAt: null,
    updatedAt: null,
    createdBy: 'system',
    createdByType: 'system',
    ...overrides,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  _clearTokenCache()
})

/* ------------------------------------------------------------------ */
/* auth.ts                                                            */
/* ------------------------------------------------------------------ */

describe('parseServiceAccountJson', () => {
  it('throws on empty input', () => {
    expect(() => parseServiceAccountJson('')).toThrow(/Empty/)
  })

  it('throws on non-JSON', () => {
    expect(() => parseServiceAccountJson('{not json')).toThrow(/not valid JSON/)
  })

  it('throws when type is not service_account', () => {
    expect(() =>
      parseServiceAccountJson(
        JSON.stringify({ type: 'user', client_email: 'x@y', private_key: 'BEGIN' }),
      ),
    ).toThrow(/expected 'service_account'/)
  })

  it('throws when private_key is missing', () => {
    expect(() =>
      parseServiceAccountJson(
        JSON.stringify({ type: 'service_account', client_email: 'x@y.com' }),
      ),
    ).toThrow(/private_key/)
  })

  it('parses a valid SA key', () => {
    const k = makeFreshKey()
    const parsed = parseServiceAccountJson(JSON.stringify(k))
    expect(parsed.client_email).toBe(k.client_email)
    expect(parsed.private_key).toContain('BEGIN')
  })
})

describe('signJwt + buildAssertionJwt', () => {
  it('produces an RS256 JWT verifiable with the matching public key', () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
    })
    const key: PlayServiceAccountKey = {
      type: 'service_account',
      private_key_id: 'kid-1',
      private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
      client_email: 'svc@proj.iam.gserviceaccount.com',
    }

    const jwt = buildAssertionJwt({ key, nowMs: 1_700_000_000_000 })
    expect(verifyJwt(jwt, publicKey)).toBe(true)

    const claims = decodeJwtPayload(jwt)
    expect(claims.iss).toBe(key.client_email)
    expect(claims.aud).toBe(GOOGLE_TOKEN_URL)
    expect(claims.scope).toBe(PLAY_REPORTING_SCOPE)
    expect(typeof claims.exp).toBe('number')
    expect(typeof claims.iat).toBe('number')
    expect((claims.exp as number) - (claims.iat as number)).toBe(3600)
  })

  it('signJwt encodes the kid into the JWT header', () => {
    const key = makeFreshKey()
    const jwt = signJwt({
      key,
      claims: {
        iss: key.client_email,
        scope: PLAY_REPORTING_SCOPE,
        aud: GOOGLE_TOKEN_URL,
        iat: 1,
        exp: 2,
      },
    })
    const [headerB64] = jwt.split('.')
    const header = JSON.parse(base64UrlToBuffer(headerB64).toString('utf8'))
    expect(header.alg).toBe('RS256')
    expect(header.typ).toBe('JWT')
    expect(header.kid).toBe('test-key-id')
  })
})

describe('getAccessToken', () => {
  it('exchanges JWT for token and caches it', async () => {
    const key = makeFreshKey()
    const fetcher = makeFetchMock([
      { ok: true, status: 200, body: { access_token: 'tok-1', expires_in: 3600, token_type: 'Bearer' } },
    ])

    const tok = await getAccessToken({
      key,
      cacheKey: 'conn_1',
      fetcher,
      nowMs: 1_700_000_000_000,
    })
    expect(tok).toBe('tok-1')
    expect(fetcher).toHaveBeenCalledTimes(1)

    // The first call should be the token URL with form-encoded body.
    const call = fetcher.mock.calls[0]
    expect(call[0]).toBe(GOOGLE_TOKEN_URL)
    const init = call[1] as RequestInit
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/x-www-form-urlencoded',
    )
    expect((init.body as string)).toMatch(/grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer/)
    expect((init.body as string)).toMatch(/assertion=/)

    // Second call uses cached token — no extra fetch.
    const tok2 = await getAccessToken({
      key,
      cacheKey: 'conn_1',
      fetcher,
      nowMs: 1_700_000_000_000 + 60_000,
    })
    expect(tok2).toBe('tok-1')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('refreshes the token after expiry (with 60s safety margin)', async () => {
    const key = makeFreshKey()
    const fetcher = makeFetchMock([
      { ok: true, status: 200, body: { access_token: 'tok-1', expires_in: 100, token_type: 'Bearer' } },
      { ok: true, status: 200, body: { access_token: 'tok-2', expires_in: 100, token_type: 'Bearer' } },
    ])

    const t1 = await getAccessToken({ key, cacheKey: 'k', fetcher, nowMs: 0 })
    expect(t1).toBe('tok-1')
    // Within 100s but past the 60s safety margin -> refresh.
    const t2 = await getAccessToken({ key, cacheKey: 'k', fetcher, nowMs: 50_000 })
    expect(t2).toBe('tok-2')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('throws on token endpoint error', async () => {
    const key = makeFreshKey()
    const fetcher = makeFetchMock([
      { ok: false, status: 401, body: { error: 'invalid_grant', error_description: 'bad sig' } },
    ])
    await expect(
      getAccessToken({ key, cacheKey: 'k', fetcher, nowMs: 0 }),
    ).rejects.toThrow(/invalid_grant/)
  })
})

/* ------------------------------------------------------------------ */
/* client.ts                                                          */
/* ------------------------------------------------------------------ */

describe('createPlayClient', () => {
  it('queryInstallsMetrics POSTs to the right URL with bearer + JSON body', async () => {
    const key = makeFreshKey()
    const fetcher = makeFetchMock([
      { ok: true, status: 200, body: { rows: [{ metrics: [{ metric: 'dailyDeviceInstalls', decimalValue: { value: '42' } }] }] } },
    ])
    const client = createPlayClient({
      key,
      cacheKey: 'k',
      fetcher,
      tokenResolver: async () => 'fake-token',
    })
    const res = await client.queryInstallsMetrics({
      packageName: 'com.partnersinbiz.app',
      body: {
        timelineSpec: {
          aggregationPeriod: 'DAILY',
          startTime: { year: 2026, month: 4, day: 24 },
          endTime: { year: 2026, month: 4, day: 24 },
        },
        metrics: ['dailyDeviceInstalls'],
      },
    })
    expect(res.rows?.[0]?.metrics?.[0]?.metric).toBe('dailyDeviceInstalls')

    const [url, init] = fetcher.mock.calls[0]
    expect(String(url)).toContain('/v1beta1/apps/com.partnersinbiz.app/installsMetricSet:query')
    const headers = (init as RequestInit).headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer fake-token')
    expect(headers['Content-Type']).toBe('application/json')
  })

  it('throws PlayApiError on 4xx', async () => {
    const fetcher = makeFetchMock([
      { ok: false, status: 403, body: { error: 'forbidden' } },
    ])
    const client = createPlayClient({
      key: makeFreshKey(),
      cacheKey: 'k',
      fetcher,
      tokenResolver: async () => 'tok',
    })
    await expect(
      client.queryFinancialMetrics({
        packageName: 'com.example',
        body: {
          timelineSpec: {
            aggregationPeriod: 'DAILY',
            startTime: { year: 2026, month: 4, day: 24 },
            endTime: { year: 2026, month: 4, day: 24 },
          },
          metrics: ['revenueIap'],
        },
      }),
    ).rejects.toThrow(PlayApiError)
  })
})

/* ------------------------------------------------------------------ */
/* pull-daily.ts                                                      */
/* ------------------------------------------------------------------ */

describe('targetDateInTimezone', () => {
  it('returns D-2 in the supplied timezone', () => {
    // Using a fixed UTC time on a known date, verify D-2 calculation.
    const now = new Date('2026-04-26T12:00:00Z')
    const out = targetDateInTimezone(now, 'UTC')
    expect(out).toBe('2026-04-24')
  })

  it('falls back to UTC for invalid tz strings', () => {
    const now = new Date('2026-04-26T12:00:00Z')
    const out = targetDateInTimezone(now, 'Not/A/Real/Zone')
    expect(out).toBe('2026-04-24')
  })
})

describe('pullDaily', () => {
  it('soft-fails when credentials are missing', async () => {
    const conn = makeConnection({ credentialsEnc: null })
    const result = await pullDaily(
      { connection: conn },
      {
        loadProperty: async () => ({ id: 'prop_a', config: { revenue: { playPackageName: 'com.x' } } } as unknown as never),
      },
    )
    expect(result.metricsWritten).toBe(0)
    expect(result.notes?.[0]).toMatch(/No Play Console service-account credentials/)
  })

  it('soft-fails when packageName cannot be resolved', async () => {
    const sa = makeFreshKey()
    const conn = makeConnection({ credentialsJson: JSON.stringify(sa) })
    const result = await pullDaily(
      { connection: conn },
      { loadProperty: async () => null },
    )
    expect(result.metricsWritten).toBe(0)
    expect(result.notes?.[0]).toMatch(/playPackageName/)
  })

  it('writes metrics from installs + financial responses', async () => {
    const sa = makeFreshKey()
    const conn = makeConnection({ credentialsJson: JSON.stringify(sa) })

    // Mock client returns canned data.
    const fakeClient = {
      request: jest.fn(),
      queryInstallsMetrics: jest.fn(async () => ({
        rows: [
          {
            startTime: { year: 2026, month: 4, day: 24 },
            metrics: [
              { metric: 'dailyDeviceInstalls', decimalValue: { value: '120' } },
              { metric: 'dailyDeviceUninstalls', decimalValue: { value: '4' } },
              { metric: 'activeDevices', decimalValue: { value: '500' } },
            ],
          },
        ],
      })),
      queryFinancialMetrics: jest.fn(async () => ({
        rows: [
          {
            startTime: { year: 2026, month: 4, day: 24 },
            metrics: [
              {
                metric: 'revenueIap',
                moneyValue: { currencyCode: 'USD', units: '12', nanos: 500_000_000 },
              },
              {
                metric: 'revenueSubscriptions',
                moneyValue: { currencyCode: 'USD', units: '99', nanos: 0 },
              },
            ],
          },
        ],
      })),
      queryRatingsMetrics: jest.fn(async () => ({
        rows: [
          {
            startTime: { year: 2026, month: 4, day: 24 },
            metrics: [{ metric: 'averageRating', decimalValue: { value: '4.6' } }],
          },
        ],
      })),
    }

    const writeMetricsFn = jest.fn(async (rows: unknown[]) => ({ written: rows.length }))

    const result = await pullDaily(
      { connection: conn, window: { from: '2026-04-24', to: '2026-04-24' } },
      {
        client: fakeClient,
        loadProperty: async () =>
          ({
            id: 'prop_a',
            config: {
              revenue: { playPackageName: 'com.partnersinbiz.app', currency: 'USD', timezone: 'UTC' },
            },
          }) as unknown as never,
        writeMetrics: writeMetricsFn as unknown as never,
      },
    )

    expect(fakeClient.queryInstallsMetrics).toHaveBeenCalledTimes(1)
    expect(fakeClient.queryFinancialMetrics).toHaveBeenCalledTimes(1)
    expect(fakeClient.queryRatingsMetrics).toHaveBeenCalledTimes(1)
    expect(result.metricsWritten).toBe(6)
    expect(result.from).toBe('2026-04-24')
    expect(result.to).toBe('2026-04-24')

    // Inspect what we wrote — rows should mix installs/uninstalls + revenue + rating.
    const written = (writeMetricsFn.mock.calls[0]?.[0] ?? []) as Array<{
      metric: string
      value: number
      currency: string | null
      dimension: string | null
      dimensionValue: string | null
      source: string
      date: string
    }>
    expect(written.find((r) => r.metric === 'installs')?.value).toBe(120)
    expect(written.find((r) => r.metric === 'uninstalls')?.value).toBe(4)
    expect(written.find((r) => r.metric === 'iap_revenue')?.value).toBeCloseTo(12.5)
    expect(written.find((r) => r.metric === 'iap_revenue')?.currency).toBe('USD')
    expect(written.find((r) => r.metric === 'subscription_revenue')?.value).toBe(99)
    expect(written.find((r) => r.metric === 'ratings_avg')?.value).toBeCloseTo(4.6)
    for (const row of written) {
      expect(row.source).toBe('play_store')
      expect(row.dimension).toBe('package')
      expect(row.dimensionValue).toBe('com.partnersinbiz.app')
      expect(row.date).toBe('2026-04-24')
    }
  })

  it('continues with installs even when financial endpoint 403s', async () => {
    const sa = makeFreshKey()
    const conn = makeConnection({ credentialsJson: JSON.stringify(sa) })

    const fakeClient = {
      request: jest.fn(),
      queryInstallsMetrics: jest.fn(async () => ({
        rows: [
          {
            startTime: { year: 2026, month: 4, day: 24 },
            metrics: [{ metric: 'dailyDeviceInstalls', decimalValue: { value: '1' } }],
          },
        ],
      })),
      queryFinancialMetrics: jest.fn(async () => {
        throw new PlayApiError(403, 'forbidden', '{}')
      }),
      queryRatingsMetrics: jest.fn(async () => {
        throw new PlayApiError(404, 'not found', '{}')
      }),
    }

    const writeMetricsFn = jest.fn(async (rows: unknown[]) => ({ written: rows.length }))

    const result = await pullDaily(
      { connection: conn, window: { from: '2026-04-24', to: '2026-04-24' } },
      {
        client: fakeClient,
        loadProperty: async () =>
          ({
            id: 'prop_a',
            config: { revenue: { playPackageName: 'com.x' } },
          }) as unknown as never,
        writeMetrics: writeMetricsFn as unknown as never,
      },
    )

    expect(result.metricsWritten).toBe(1)
    expect((result.notes ?? []).some((n) => /financialMetricSet/.test(n))).toBe(true)
    expect((result.notes ?? []).some((n) => /ratingsMetricSet/.test(n))).toBe(true)
  })

  it('rethrows on 5xx from installs', async () => {
    const sa = makeFreshKey()
    const conn = makeConnection({ credentialsJson: JSON.stringify(sa) })
    const fakeClient = {
      request: jest.fn(),
      queryInstallsMetrics: jest.fn(async () => {
        throw new PlayApiError(500, 'internal error', '{}')
      }),
      queryFinancialMetrics: jest.fn(),
      queryRatingsMetrics: jest.fn(),
    }
    await expect(
      pullDaily(
        { connection: conn, window: { from: '2026-04-24', to: '2026-04-24' } },
        {
          client: fakeClient,
          loadProperty: async () =>
            ({
              id: 'prop_a',
              config: { revenue: { playPackageName: 'com.x' } },
            }) as unknown as never,
        },
      ),
    ).rejects.toBeInstanceOf(PlayApiError)
  })
})

/* ------------------------------------------------------------------ */
/* webhook.ts                                                         */
/* ------------------------------------------------------------------ */

function makePushEnvelope(inner: object, messageId = 'msg-1'): string {
  const data = Buffer.from(JSON.stringify(inner)).toString('base64')
  return JSON.stringify({
    message: { data, messageId, publishTime: '2026-04-26T12:00:00Z' },
    subscription: 'projects/x/subscriptions/y',
  })
}

describe('handleWebhook', () => {
  const dummyConn: Connection = {
    id: 'play_console',
    provider: 'play_console',
    propertyId: 'prop_a',
    orgId: 'org_a',
    authKind: 'service_account',
    status: 'connected',
    credentialsEnc: null,
    meta: { packageName: 'com.x' },
    scope: [],
    lastPulledAt: null,
    lastSuccessAt: null,
    lastError: null,
    consecutiveFailures: 0,
    backfilledThrough: null,
    createdAt: null,
    updatedAt: null,
    createdBy: 's',
    createdByType: 'system',
  }

  it('returns 200 + 0 written for a non-JSON body', async () => {
    const result = await handleWebhook({
      rawBody: 'not json',
      propertyId: 'prop_a',
      loadConnection: async () => dummyConn,
    })
    expect(result.status).toBe(200)
    expect(result.metricsWritten).toBe(0)
  })

  it('handles a testNotification gracefully', async () => {
    const body = makePushEnvelope({
      version: '1.0',
      packageName: 'com.x',
      eventTimeMillis: '1700000000000',
      testNotification: { version: '1.0' },
    })
    const result = await handleWebhook({
      rawBody: body,
      propertyId: 'prop_a',
      loadConnection: async () => dummyConn,
    })
    expect(result.status).toBe(200)
    expect(result.metricsWritten).toBe(0)
    expect((result.notes ?? []).some((n) => /testNotification/.test(n))).toBe(true)
  })

  it('writes a new_subs metric for SUBSCRIPTION_PURCHASED', async () => {
    const body = makePushEnvelope({
      version: '1.0',
      packageName: 'com.x',
      eventTimeMillis: '1700000000000',
      subscriptionNotification: {
        version: '1.0',
        notificationType: 4, // SUBSCRIPTION_PURCHASED
        purchaseToken: 'pt_1',
        subscriptionId: 'sub_monthly',
      },
    })
    const writeMetricsFn = jest.fn(async (rows: unknown[]) => ({ written: rows.length }))
    const result = await handleWebhook({
      rawBody: body,
      propertyId: 'prop_a',
      loadConnection: async () => dummyConn,
      loadPropertyFn: async () =>
        ({ id: 'prop_a', config: { revenue: { timezone: 'UTC' } } }) as unknown as never,
      writeMetricsFn: writeMetricsFn as unknown as never,
    })
    expect(result.metricsWritten).toBe(1)
    const row = writeMetricsFn.mock.calls[0]?.[0]?.[0] as {
      metric: string
      source: string
      dimension: string | null
      dimensionValue: string | null
      value: number
    }
    expect(row.metric).toBe('new_subs')
    expect(row.source).toBe('play_store')
    expect(row.dimension).toBe('rtdn_event')
    expect(row.dimensionValue).toBe('subscription')
    expect(row.value).toBe(1)
  })

  it('writes a churn metric for SUBSCRIPTION_EXPIRED', async () => {
    const body = makePushEnvelope({
      version: '1.0',
      packageName: 'com.x',
      eventTimeMillis: '1700000000000',
      subscriptionNotification: {
        version: '1.0',
        notificationType: 13, // SUBSCRIPTION_EXPIRED
        purchaseToken: 'pt_1',
        subscriptionId: 'sub_monthly',
      },
    })
    const writeMetricsFn = jest.fn(async (rows: unknown[]) => ({ written: rows.length }))
    await handleWebhook({
      rawBody: body,
      propertyId: 'prop_a',
      loadConnection: async () => dummyConn,
      loadPropertyFn: async () => null,
      writeMetricsFn: writeMetricsFn as unknown as never,
    })
    const row = writeMetricsFn.mock.calls[0]?.[0]?.[0] as { metric: string }
    expect(row.metric).toBe('churn')
  })

  it('writes a 0-value iap_revenue audit row for ONE_TIME_PRODUCT_PURCHASED', async () => {
    const body = makePushEnvelope({
      version: '1.0',
      packageName: 'com.x',
      eventTimeMillis: '1700000000000',
      oneTimeProductNotification: {
        version: '1.0',
        notificationType: 1, // PURCHASED
        purchaseToken: 'pt_2',
        sku: 'coins_pack_1',
      },
    })
    const writeMetricsFn = jest.fn(async (rows: unknown[]) => ({ written: rows.length }))
    await handleWebhook({
      rawBody: body,
      propertyId: 'prop_a',
      loadConnection: async () => dummyConn,
      loadPropertyFn: async () => null,
      writeMetricsFn: writeMetricsFn as unknown as never,
    })
    const row = writeMetricsFn.mock.calls[0]?.[0]?.[0] as {
      metric: string
      value: number
      dimensionValue: string | null
    }
    expect(row.metric).toBe('iap_revenue')
    expect(row.value).toBe(0)
    expect(row.dimensionValue).toBe('one_time_product')
  })

  it('writes a refunds row for voidedPurchaseNotification', async () => {
    const body = makePushEnvelope({
      version: '1.0',
      packageName: 'com.x',
      eventTimeMillis: '1700000000000',
      voidedPurchaseNotification: {
        purchaseToken: 'pt_2',
        orderId: 'GPA.000-000',
        productType: 1,
        refundType: 1,
      },
    })
    const writeMetricsFn = jest.fn(async (rows: unknown[]) => ({ written: rows.length }))
    await handleWebhook({
      rawBody: body,
      propertyId: 'prop_a',
      loadConnection: async () => dummyConn,
      loadPropertyFn: async () => null,
      writeMetricsFn: writeMetricsFn as unknown as never,
    })
    const row = writeMetricsFn.mock.calls[0]?.[0]?.[0] as { metric: string }
    expect(row.metric).toBe('refunds')
  })

  it('returns 200 + 0 written when no propertyId is supplied', async () => {
    const body = makePushEnvelope({
      packageName: 'com.x',
      subscriptionNotification: { notificationType: 4 },
    })
    const result = await handleWebhook({
      rawBody: body,
      // no propertyId
    })
    expect(result.status).toBe(200)
    expect(result.metricsWritten).toBe(0)
    expect((result.notes ?? []).some((n) => /propertyId/.test(n))).toBe(true)
  })

  it('returns 200 + 0 written when no connection exists', async () => {
    const body = makePushEnvelope({
      packageName: 'com.x',
      subscriptionNotification: { notificationType: 4 },
    })
    const result = await handleWebhook({
      rawBody: body,
      propertyId: 'prop_a',
      loadConnection: async () => null,
    })
    expect(result.status).toBe(200)
    expect(result.metricsWritten).toBe(0)
    expect((result.notes ?? []).some((n) => /No play_console connection/.test(n))).toBe(true)
  })
})

/* ------------------------------------------------------------------ */
/* index.ts                                                           */
/* ------------------------------------------------------------------ */

describe('adapter registration', () => {
  it('registers the adapter on import', async () => {
    const mod = await import('@/lib/integrations/play_console')
    expect(mod.default.provider).toBe('play_console')
    expect(mod.default.authKind).toBe('service_account')
    expect(mod.default.saveCredentials).toBeDefined()
    expect(mod.default.pullDaily).toBeDefined()
    expect(mod.default.handleWebhook).toBeDefined()

    const { getAdapter } = await import('@/lib/integrations/registry')
    expect(getAdapter('play_console')).toBe(mod.default)
  })
})
