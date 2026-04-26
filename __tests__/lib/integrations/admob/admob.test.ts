// __tests__/lib/integrations/admob/admob.test.ts
//
// Unit tests for the AdMob adapter. We mock:
//   - global.fetch (so we never hit Google or AdMob)
//   - @/lib/metrics/write           (so we don't touch Firestore / FX)
//   - @/lib/integrations/connections (so we don't touch Firestore)
//   - @/lib/firebase/admin           (the pull-daily reads property config)
//   - @/lib/integrations/crypto      (so encrypt/decrypt is deterministic)

// 64-char hex master key — only used by the un-mocked crypto module on import.
process.env.SOCIAL_TOKEN_MASTER_KEY =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
process.env.GOOGLE_OAUTH_CLIENT_ID = 'test-client-id'
process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-client-secret'

/* ──────────────────────────────────────────────────────────────────────────
 * Mocks
 * ────────────────────────────────────────────────────────────────────────── */

// 1) Mock the connections module — return whatever upsertConnection was called with.
const upsertConnection = jest.fn(async (input: Record<string, unknown>) => ({
  id: input.provider as string,
  ...input,
}))
jest.mock('@/lib/integrations/connections', () => ({
  upsertConnection: (input: Record<string, unknown>) => upsertConnection(input),
  markPullSuccess: jest.fn(),
  markPullFailure: jest.fn(),
}))

// 2) Mock the metrics writer — record what it receives.
const writeMetrics = jest.fn(async (rows: unknown[]) => ({ written: rows.length }))
jest.mock('@/lib/metrics/write', () => ({
  writeMetrics: (rows: unknown[]) => writeMetrics(rows),
  metricDocId: () => 'fake-id',
  METRICS_COLLECTION: 'metrics',
}))

// 3) Mock crypto — deterministic round-trip without needing the real keystore.
jest.mock('@/lib/integrations/crypto', () => {
  const store: Record<string, string> = {}
  return {
    encryptCredentials: jest.fn(
      (creds: Record<string, unknown>, _orgId: string) => {
        const key = `enc-${Math.random().toString(36).slice(2)}`
        store[key] = JSON.stringify(creds)
        return { ciphertext: key, iv: 'iv', tag: 'tag' }
      },
    ),
    decryptCredentials: jest.fn(
      (data: { ciphertext: string }, _orgId: string) => {
        return JSON.parse(store[data.ciphertext] ?? '{}')
      },
    ),
    maybeDecryptCredentials: jest.fn(),
  }
})

// 4) Mock firebase-admin — the pull-daily fetches the property doc inline.
const propertyDocGet = jest.fn()
const connectionUpdate = jest.fn(async () => undefined)
jest.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: jest.fn((name: string) => {
      if (name === 'properties') {
        return {
          doc: jest.fn(() => ({
            get: propertyDocGet,
            collection: jest.fn(() => ({
              doc: jest.fn(() => ({ update: connectionUpdate })),
            })),
          })),
        }
      }
      // Anything else (e.g. collection group) — return a fake.
      return { doc: jest.fn(() => ({ get: jest.fn() })) }
    }),
  },
}))

// 5) Mock the registry registerAdapter so importing index.ts doesn't try to
//    register against the real shared map (and so multiple test files don't
//    cause cross-contamination).
const registerAdapter = jest.fn()
jest.mock('@/lib/integrations/registry', () => ({
  registerAdapter,
  getAdapter: jest.fn(),
  getAdapterOrThrow: jest.fn(),
  listAdapters: jest.fn(() => []),
}))

/* ──────────────────────────────────────────────────────────────────────────
 * Imports must come AFTER jest.mock() calls.
 * ────────────────────────────────────────────────────────────────────────── */
import adapter, { ADMOB_SCOPE } from '@/lib/integrations/admob'
import { beginOAuth, completeOAuth } from '@/lib/integrations/admob/oauth'
import { pullDaily } from '@/lib/integrations/admob/pull-daily'
import {
  decodeMetricValue,
  ensureAccessToken,
  listAccounts,
  generateNetworkReport,
} from '@/lib/integrations/admob/client'
import type { Connection } from '@/lib/integrations/types'

/* ──────────────────────────────────────────────────────────────────────────
 * Fetch mock helpers.
 * ────────────────────────────────────────────────────────────────────────── */

interface FetchCall {
  url: string
  init?: RequestInit
}

let fetchCalls: FetchCall[] = []
let fetchImpl: (url: string, init?: RequestInit) => Promise<Response> = async () =>
  new Response('{}', { status: 200 })

// Snapshot the registration call from import time — beforeEach clears mocks
// after that has already fired, so we save it once here.
const REGISTER_CALLS_AT_IMPORT = registerAdapter.mock.calls.slice()

beforeEach(() => {
  fetchCalls = []
  fetchImpl = async () => new Response('{}', { status: 200 })
  upsertConnection.mockClear()
  writeMetrics.mockClear()
  propertyDocGet.mockReset()
  connectionUpdate.mockClear()
  // Don't clear registerAdapter — registration only happens once at module
  // load and we assert against REGISTER_CALLS_AT_IMPORT.
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    fetchCalls.push({ url: String(url), init })
    return fetchImpl(String(url), init)
  }) as unknown as typeof fetch
})

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/* ──────────────────────────────────────────────────────────────────────────
 * Adapter shape
 * ────────────────────────────────────────────────────────────────────────── */

describe('adapter shape', () => {
  it('exposes the expected provider, authKind and display', () => {
    expect(adapter.provider).toBe('admob')
    expect(adapter.authKind).toBe('oauth2')
    expect(adapter.display.name).toBe('Google AdMob')
    expect(typeof adapter.beginOAuth).toBe('function')
    expect(typeof adapter.completeOAuth).toBe('function')
    expect(typeof adapter.pullDaily).toBe('function')
  })

  it('exposes the AdMob OAuth scope', () => {
    expect(ADMOB_SCOPE).toBe('https://www.googleapis.com/auth/admob.readonly')
  })

  it('registers itself with the registry on import', () => {
    expect(REGISTER_CALLS_AT_IMPORT.length).toBeGreaterThan(0)
    const [registered] = REGISTER_CALLS_AT_IMPORT[0] ?? []
    expect((registered as { provider: string })?.provider).toBe('admob')
  })
})

/* ──────────────────────────────────────────────────────────────────────────
 * decodeMetricValue
 * ────────────────────────────────────────────────────────────────────────── */

describe('decodeMetricValue', () => {
  it('decodes microsValue to a currency unit', () => {
    expect(decodeMetricValue({ microsValue: '12500000' })).toBeCloseTo(12.5)
  })

  it('decodes integerValue', () => {
    expect(decodeMetricValue({ integerValue: '42' })).toBe(42)
  })

  it('passes doubleValue through', () => {
    expect(decodeMetricValue({ doubleValue: 0.0123 })).toBeCloseTo(0.0123)
  })

  it('returns 0 when nothing is set', () => {
    expect(decodeMetricValue({})).toBe(0)
  })
})

/* ──────────────────────────────────────────────────────────────────────────
 * beginOAuth
 * ────────────────────────────────────────────────────────────────────────── */

describe('beginOAuth', () => {
  it('builds a Google authorize URL with the AdMob scope', async () => {
    const { authorizeUrl } = await beginOAuth({
      propertyId: 'p1',
      orgId: 'org1',
      redirectUri: 'https://example.com/cb',
      state: 'st',
    })
    const u = new URL(authorizeUrl)
    expect(u.origin).toBe('https://accounts.google.com')
    expect(u.searchParams.get('client_id')).toBe('test-client-id')
    expect(u.searchParams.get('scope')).toBe(ADMOB_SCOPE)
    expect(u.searchParams.get('redirect_uri')).toBe('https://example.com/cb')
    expect(u.searchParams.get('access_type')).toBe('offline')
    expect(u.searchParams.get('prompt')).toBe('consent')
    expect(u.searchParams.get('state')).toBe('st')
  })

  it('returns a fallback URL when client env is missing', async () => {
    const old = process.env.GOOGLE_OAUTH_CLIENT_ID
    delete process.env.GOOGLE_OAUTH_CLIENT_ID
    const { authorizeUrl } = await beginOAuth({
      propertyId: 'p1',
      orgId: 'org1',
      redirectUri: 'https://example.com/cb',
      state: 'st',
    })
    expect(authorizeUrl).toContain('error=missing_google_oauth_client')
    process.env.GOOGLE_OAUTH_CLIENT_ID = old
  })
})

/* ──────────────────────────────────────────────────────────────────────────
 * completeOAuth
 * ────────────────────────────────────────────────────────────────────────── */

describe('completeOAuth', () => {
  it('exchanges code for tokens, looks up the AdMob account, and upserts', async () => {
    fetchImpl = async (url) => {
      if (url.includes('oauth2.googleapis.com/token')) {
        return jsonRes({
          access_token: 'at-1',
          refresh_token: 'rt-1',
          expires_in: 3600,
          scope: ADMOB_SCOPE,
          token_type: 'Bearer',
        })
      }
      if (url.includes('admob.googleapis.com/v1/accounts')) {
        return jsonRes({
          account: [
            {
              name: 'accounts/pub-9999999999999999',
              publisherId: 'pub-9999999999999999',
              reportingTimeZone: 'America/Los_Angeles',
              currencyCode: 'USD',
            },
          ],
        })
      }
      return new Response('{}', { status: 404 })
    }

    const conn = await completeOAuth({
      propertyId: 'p1',
      orgId: 'org1',
      code: 'auth-code',
      redirectUri: 'https://example.com/cb',
    })

    // Token endpoint hit with correct grant_type.
    const tokenCall = fetchCalls.find((c) =>
      c.url.includes('oauth2.googleapis.com/token'),
    )
    expect(tokenCall).toBeDefined()
    expect(String(tokenCall!.init?.body)).toContain('grant_type=authorization_code')
    expect(String(tokenCall!.init?.body)).toContain('code=auth-code')

    // Accounts endpoint hit.
    expect(
      fetchCalls.find((c) =>
        c.url.startsWith('https://admob.googleapis.com/v1/accounts'),
      ),
    ).toBeDefined()

    // Connection persisted with status='connected' and accountName populated.
    expect(upsertConnection).toHaveBeenCalled()
    const arg = upsertConnection.mock.calls[0][0]
    expect(arg.provider).toBe('admob')
    expect(arg.authKind).toBe('oauth2')
    expect(arg.status).toBe('connected')
    expect((arg.meta as Record<string, unknown>).accountName).toBe(
      'accounts/pub-9999999999999999',
    )
    expect(arg.scope).toEqual([ADMOB_SCOPE])
    // Returned connection echoes what we passed.
    expect(conn.provider).toBe('admob')
  })

  it('persists reauth_required on token exchange failure', async () => {
    fetchImpl = async (url) => {
      if (url.includes('oauth2.googleapis.com/token')) {
        return new Response('bad code', { status: 400 })
      }
      return new Response('{}', { status: 404 })
    }
    await completeOAuth({
      propertyId: 'p1',
      orgId: 'org1',
      code: 'bad',
      redirectUri: 'https://example.com/cb',
    })
    const arg = upsertConnection.mock.calls[0][0]
    expect(arg.status).toBe('reauth_required')
    expect(arg.credentials).toBeNull()
  })

  it('persists reauth_required when AdMob returns no accounts', async () => {
    fetchImpl = async (url) => {
      if (url.includes('oauth2.googleapis.com/token')) {
        return jsonRes({
          access_token: 'at-1',
          refresh_token: 'rt-1',
          expires_in: 3600,
          token_type: 'Bearer',
        })
      }
      if (url.includes('admob.googleapis.com/v1/accounts')) {
        return jsonRes({ account: [] })
      }
      return new Response('{}', { status: 404 })
    }
    await completeOAuth({
      propertyId: 'p1',
      orgId: 'org1',
      code: 'ok',
      redirectUri: 'https://example.com/cb',
    })
    const arg = upsertConnection.mock.calls[0][0]
    expect(arg.status).toBe('reauth_required')
    expect((arg.meta as Record<string, unknown>).error).toBe('no_admob_account')
  })

  it('persists reauth_required when refresh_token is missing', async () => {
    fetchImpl = async (url) => {
      if (url.includes('oauth2.googleapis.com/token')) {
        return jsonRes({
          access_token: 'at-1',
          // no refresh_token
          expires_in: 3600,
          token_type: 'Bearer',
        })
      }
      return new Response('{}', { status: 404 })
    }
    await completeOAuth({
      propertyId: 'p1',
      orgId: 'org1',
      code: 'ok',
      redirectUri: 'https://example.com/cb',
    })
    const arg = upsertConnection.mock.calls[0][0]
    expect(arg.status).toBe('reauth_required')
    expect((arg.meta as Record<string, unknown>).error).toBe('missing_refresh_token')
  })
})

/* ──────────────────────────────────────────────────────────────────────────
 * client — listAccounts, generateNetworkReport, ensureAccessToken
 * ────────────────────────────────────────────────────────────────────────── */

describe('client.listAccounts', () => {
  it('hits the v1/accounts endpoint with bearer auth', async () => {
    fetchImpl = async () =>
      jsonRes({
        account: [
          {
            name: 'accounts/pub-1',
            publisherId: 'pub-1',
          },
        ],
      })
    const accs = await listAccounts('access-1')
    expect(accs).toHaveLength(1)
    expect(accs[0].publisherId).toBe('pub-1')
    expect(fetchCalls[0].url).toBe('https://admob.googleapis.com/v1/accounts')
    expect(
      (fetchCalls[0].init?.headers as Record<string, string>)?.Authorization,
    ).toBe('Bearer access-1')
  })

  it('throws on non-2xx', async () => {
    fetchImpl = async () => new Response('forbidden', { status: 403 })
    await expect(listAccounts('access-1')).rejects.toThrow(/403/)
  })
})

describe('client.generateNetworkReport', () => {
  it('POSTs to networkReport:generate with the provided body', async () => {
    fetchImpl = async () => jsonRes([{ header: { dateRange: {} } }])
    await generateNetworkReport({
      accessToken: 'at',
      accountName: 'accounts/pub-1',
      body: {
        reportSpec: {
          dateRange: { startDate: { year: 2026, month: 4, day: 25 }, endDate: { year: 2026, month: 4, day: 25 } },
          dimensions: ['DATE'],
          metrics: ['IMPRESSIONS'],
        },
      },
    })
    expect(fetchCalls[0].url).toBe(
      'https://admob.googleapis.com/v1/accounts/pub-1/networkReport:generate',
    )
    expect(fetchCalls[0].init?.method).toBe('POST')
    const body = JSON.parse(String(fetchCalls[0].init?.body))
    expect(body.reportSpec.dimensions).toEqual(['DATE'])
  })

  it('parses NDJSON-style responses too', async () => {
    fetchImpl = async () =>
      new Response(
        '{"header":{"dateRange":{}}}\n{"row":{"dimensionValues":{"DATE":{"value":"20260425"}}}}\n',
        { status: 200 },
      )
    const rows = await generateNetworkReport({
      accessToken: 'at',
      accountName: 'accounts/pub-1',
      body: {
        reportSpec: {
          dateRange: { startDate: { year: 2026, month: 4, day: 25 }, endDate: { year: 2026, month: 4, day: 25 } },
          dimensions: ['DATE'],
          metrics: ['IMPRESSIONS'],
        },
      },
    })
    expect(rows).toHaveLength(2)
    expect(rows[1].row?.dimensionValues?.DATE?.value).toBe('20260425')
  })
})

describe('client.ensureAccessToken', () => {
  it('returns the cached token when not expired', async () => {
    const creds = {
      accessToken: 'fresh',
      refreshToken: 'rt',
      expiresAt: Date.now() + 10 * 60_000,
    }
    const r = await ensureAccessToken(creds)
    expect(r.accessToken).toBe('fresh')
    expect(r.refreshed).toBe(false)
    expect(fetchCalls).toHaveLength(0)
  })

  it('refreshes when expired', async () => {
    fetchImpl = async () =>
      jsonRes({
        access_token: 'new-at',
        expires_in: 3600,
        token_type: 'Bearer',
      })
    const creds = {
      accessToken: 'stale',
      refreshToken: 'rt',
      expiresAt: Date.now() - 1000,
    }
    const r = await ensureAccessToken(creds)
    expect(r.accessToken).toBe('new-at')
    expect(r.refreshed).toBe(true)
    expect(fetchCalls[0].url).toBe('https://oauth2.googleapis.com/token')
    expect(String(fetchCalls[0].init?.body)).toContain('grant_type=refresh_token')
    // Refresh token preserved when Google didn't rotate it.
    expect(r.next.refreshToken).toBe('rt')
  })
})

/* ──────────────────────────────────────────────────────────────────────────
 * pullDaily
 *
 * We seed:
 *   - a connection with credentialsEnc + meta.accountName
 *   - the property doc (currency=USD, timezone=Africa/Johannesburg, admobAppId)
 *   - the AdMob report endpoint with one row that has all 7 metrics
 * ────────────────────────────────────────────────────────────────────────── */

function buildConnection(overrides: Partial<Connection> = {}): Connection {
  return {
    id: 'admob',
    provider: 'admob',
    propertyId: 'p1',
    orgId: 'org1',
    authKind: 'oauth2',
    status: 'connected',
    credentialsEnc: { ciphertext: 'enc-x', iv: 'iv', tag: 'tag' },
    meta: { accountName: 'accounts/pub-1234' },
    scope: [ADMOB_SCOPE],
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

function seedDecryptForConnection(refreshTokenIsFresh: boolean) {
  // Repopulate the encrypted store inside the mocked crypto module so that
  // decryptCredentials returns a usable object when the adapter calls it.
  const { encryptCredentials } = jest.requireMock(
    '@/lib/integrations/crypto',
  ) as { encryptCredentials: (creds: Record<string, unknown>, orgId: string) => unknown }
  // Overwrite the connection's credentialsEnc with one this mock can decrypt.
  return encryptCredentials(
    {
      accessToken: 'at-fresh',
      refreshToken: 'rt-1',
      expiresAt: refreshTokenIsFresh ? Date.now() + 60 * 60_000 : Date.now() - 1000,
    },
    'org1',
  ) as { ciphertext: string; iv: string; tag: string }
}

describe('pullDaily', () => {
  it('returns notes and writes nothing when credentialsEnc is missing', async () => {
    const conn = buildConnection({ credentialsEnc: null })
    propertyDocGet.mockResolvedValue({
      exists: true,
      id: 'p1',
      data: () => ({ orgId: 'org1', config: {} }),
    })
    const r = await pullDaily({ connection: conn })
    expect(r.metricsWritten).toBe(0)
    expect(r.notes?.[0]).toMatch(/No credentials/)
    expect(writeMetrics).not.toHaveBeenCalled()
  })

  it('returns notes and writes nothing when accountName is missing on meta', async () => {
    const enc = seedDecryptForConnection(true)
    const conn = buildConnection({ credentialsEnc: enc, meta: {} })
    propertyDocGet.mockResolvedValue({
      exists: true,
      id: 'p1',
      data: () => ({ orgId: 'org1', config: {} }),
    })
    const r = await pullDaily({ connection: conn })
    expect(r.metricsWritten).toBe(0)
    expect(r.notes?.[0]).toMatch(/accountName is missing/)
    expect(writeMetrics).not.toHaveBeenCalled()
  })

  it('pulls account-wide metrics for yesterday and writes 7 metric kinds', async () => {
    const enc = seedDecryptForConnection(true)
    const conn = buildConnection({ credentialsEnc: enc })
    propertyDocGet.mockResolvedValue({
      exists: true,
      id: 'p1',
      data: () => ({
        orgId: 'org1',
        config: { revenue: { currency: 'USD', timezone: 'America/Los_Angeles' } },
      }),
    })

    // One report row that includes every metric we map.
    fetchImpl = async (url) => {
      if (url.includes('networkReport:generate')) {
        return jsonRes([
          { header: { dateRange: {} } },
          {
            row: {
              dimensionValues: { DATE: { value: '20260425' } },
              metricValues: {
                ESTIMATED_EARNINGS: { microsValue: '12500000' }, // $12.50
                IMPRESSIONS: { integerValue: '4000' },
                CLICKS: { integerValue: '50' },
                MATCH_RATE: { doubleValue: 0.92 },
                OBSERVED_ECPM: { microsValue: '3120000' }, // $3.12 eCPM
                AD_REQUESTS: { integerValue: '4500' },
                IMPRESSION_CTR: { doubleValue: 0.0125 },
              },
            },
          },
          { footer: { matchingRowCount: '1' } },
        ])
      }
      return new Response('{}', { status: 404 })
    }

    const r = await pullDaily({ connection: conn })
    expect(r.metricsWritten).toBe(7)
    expect(writeMetrics).toHaveBeenCalledTimes(1)
    const rows = writeMetrics.mock.calls[0][0] as Array<Record<string, unknown>>
    const kinds = rows.map((x) => x.metric).sort()
    expect(kinds).toEqual(
      [
        'ad_requests',
        'ad_revenue',
        'clicks',
        'ctr',
        'ecpm',
        'impressions',
        'match_rate',
      ].sort(),
    )
    // Money rows carry currency.
    const adRev = rows.find((x) => x.metric === 'ad_revenue')!
    expect(adRev.currency).toBe('USD')
    expect(adRev.value).toBeCloseTo(12.5)
    expect(adRev.source).toBe('admob')
    // Non-money rows have null currency.
    const imp = rows.find((x) => x.metric === 'impressions')!
    expect(imp.currency).toBeNull()
    expect(imp.value).toBe(4000)
    expect(imp.dimension).toBeNull()
  })

  it('also fetches a per-app report when admobAppId is configured', async () => {
    const enc = seedDecryptForConnection(true)
    const conn = buildConnection({ credentialsEnc: enc })
    propertyDocGet.mockResolvedValue({
      exists: true,
      id: 'p1',
      data: () => ({
        orgId: 'org1',
        config: {
          revenue: {
            currency: 'USD',
            timezone: 'UTC',
            admobAppId: 'ca-app-pub-9999~1111',
          },
        },
      }),
    })

    let reportCallCount = 0
    fetchImpl = async (url, init) => {
      if (url.includes('networkReport:generate')) {
        reportCallCount += 1
        const body = JSON.parse(String(init?.body))
        const isAppReport = body.reportSpec.dimensions.includes('APP')
        return jsonRes([
          { header: { dateRange: {} } },
          {
            row: {
              dimensionValues: {
                DATE: { value: '20260425' },
                ...(isAppReport
                  ? { APP: { value: 'ca-app-pub-9999~1111' } }
                  : {}),
              },
              metricValues: {
                IMPRESSIONS: { integerValue: isAppReport ? '1000' : '4000' },
              },
            },
          },
        ])
      }
      return new Response('{}', { status: 404 })
    }

    const r = await pullDaily({ connection: conn })
    expect(reportCallCount).toBe(2)
    expect(r.metricsWritten).toBeGreaterThan(0)

    // App-level rows should be tagged with dimension/value.
    const rows = writeMetrics.mock.calls[0][0] as Array<Record<string, unknown>>
    const appRows = rows.filter((x) => x.dimension === 'app')
    expect(appRows.length).toBeGreaterThan(0)
    expect(appRows[0].dimensionValue).toBe('ca-app-pub-9999~1111')

    // App report request body should include the dimension filter.
    const appCall = fetchCalls.find((c) => {
      if (!c.url.includes('networkReport:generate')) return false
      const b = JSON.parse(String(c.init?.body))
      return b.reportSpec.dimensions.includes('APP')
    })
    expect(appCall).toBeDefined()
    const body = JSON.parse(String(appCall!.init?.body))
    expect(body.reportSpec.dimensionFilters[0].dimension).toBe('APP')
    expect(body.reportSpec.dimensionFilters[0].matchesAny.values).toEqual([
      'ca-app-pub-9999~1111',
    ])
  })

  it('uses default currency USD when property does not specify one', async () => {
    const enc = seedDecryptForConnection(true)
    const conn = buildConnection({ credentialsEnc: enc })
    propertyDocGet.mockResolvedValue({
      exists: true,
      id: 'p1',
      data: () => ({ orgId: 'org1', config: {} }),
    })
    fetchImpl = async (url) => {
      if (url.includes('networkReport:generate')) {
        return jsonRes([
          {
            row: {
              dimensionValues: { DATE: { value: '20260425' } },
              metricValues: {
                ESTIMATED_EARNINGS: { microsValue: '5000000' },
              },
            },
          },
        ])
      }
      return new Response('{}', { status: 404 })
    }
    const r = await pullDaily({ connection: conn })
    expect(r.metricsWritten).toBe(1)
    const row = (writeMetrics.mock.calls[0][0] as Array<Record<string, unknown>>)[0]
    expect(row.currency).toBe('USD')
    // The request body should include localizationSettings.currencyCode = 'USD'.
    const reportCall = fetchCalls.find((c) =>
      c.url.includes('networkReport:generate'),
    )!
    const body = JSON.parse(String(reportCall.init?.body))
    expect(body.reportSpec.localizationSettings.currencyCode).toBe('USD')
  })

  it('refreshes the access token and saves the new credentials', async () => {
    // Stale token forces a refresh.
    const enc = seedDecryptForConnection(false)
    const conn = buildConnection({ credentialsEnc: enc })
    propertyDocGet.mockResolvedValue({
      exists: true,
      id: 'p1',
      data: () => ({ orgId: 'org1', config: {} }),
    })
    fetchImpl = async (url) => {
      if (url.includes('oauth2.googleapis.com/token')) {
        return jsonRes({
          access_token: 'rotated',
          expires_in: 3600,
          token_type: 'Bearer',
        })
      }
      if (url.includes('networkReport:generate')) {
        return jsonRes([
          {
            row: {
              dimensionValues: { DATE: { value: '20260425' } },
              metricValues: { IMPRESSIONS: { integerValue: '10' } },
            },
          },
        ])
      }
      return new Response('{}', { status: 404 })
    }
    const r = await pullDaily({ connection: conn })
    expect(r.notes?.some((n) => /Refreshed access token/.test(n))).toBe(true)
    expect(connectionUpdate).toHaveBeenCalled()
    expect(r.metricsWritten).toBe(1)
  })

  it('surfaces report failures as notes without throwing', async () => {
    const enc = seedDecryptForConnection(true)
    const conn = buildConnection({ credentialsEnc: enc })
    propertyDocGet.mockResolvedValue({
      exists: true,
      id: 'p1',
      data: () => ({ orgId: 'org1', config: {} }),
    })
    fetchImpl = async (url) => {
      if (url.includes('networkReport:generate')) {
        return new Response('boom', { status: 500 })
      }
      return new Response('{}', { status: 404 })
    }
    const r = await pullDaily({ connection: conn })
    expect(r.metricsWritten).toBe(0)
    expect(r.notes?.some((n) => /Account report failed/.test(n))).toBe(true)
    expect(writeMetrics).not.toHaveBeenCalled()
  })
})
