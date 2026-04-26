// 64-char hex master key — needed because the AES-GCM helper reads env at
// call time. Set BEFORE importing any module that touches encryption.
process.env.SOCIAL_TOKEN_MASTER_KEY =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
process.env.GOOGLE_OAUTH_CLIENT_ID = 'test-client-id'
process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-client-secret'

import { encryptCredentials } from '@/lib/integrations/crypto'
import type { Connection } from '@/lib/integrations/types'

/* ──────────────────────────────────────────────────────────────────
 * Mocks — must be set up before importing modules under test.
 * `writeMetrics` and `connections` get jest.fn() bodies so we can
 * assert on calls without ever hitting Firestore.
 * ────────────────────────────────────────────────────────────────── */

jest.mock('@/lib/metrics/write', () => ({
  writeMetrics: jest.fn(async (rows: unknown[]) => ({ written: rows.length })),
  metricDocId: jest.fn(() => 'doc'),
}))

jest.mock('@/lib/integrations/connections', () => ({
  upsertConnection: jest.fn(async (input: Record<string, unknown>) => ({
    id: 'adsense',
    provider: 'adsense',
    propertyId: input.propertyId,
    orgId: input.orgId,
    authKind: input.authKind,
    status: input.status ?? 'connected',
    credentialsEnc: null,
    meta: input.meta ?? {},
    scope: input.scope ?? [],
    lastPulledAt: null,
    lastSuccessAt: null,
    lastError: null,
    consecutiveFailures: 0,
    backfilledThrough: null,
    createdAt: null,
    updatedAt: null,
    createdBy: input.createdBy ?? 'system',
    createdByType: input.createdByType ?? 'system',
  })),
  getConnection: jest.fn(async () => null),
  markPullSuccess: jest.fn(async () => undefined),
  markPullFailure: jest.fn(async () => undefined),
}))

// adminDb is touched by pull-daily for property lookup. Stub it minimally;
// every test uses `fetchProperty` injection so this never actually runs.
jest.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn(async () => ({ exists: false })),
      })),
    })),
  },
}))

// FX conversion in writeMetrics path (not actually exercised here, but
// imported transitively). Stub to a passthrough.
jest.mock('@/lib/fx/rates', () => ({
  convertToZar: jest.fn(async ({ amount }: { amount: number }) => amount),
}))

import { writeMetrics } from '@/lib/metrics/write'
import { upsertConnection } from '@/lib/integrations/connections'

import {
  beginOAuth,
  completeOAuth,
  exchangeCodeForTokens,
  refreshAccessToken,
  GOOGLE_AUTHORIZE_ENDPOINT,
  GOOGLE_TOKEN_ENDPOINT,
  ADSENSE_API_BASE,
  ADSENSE_SCOPES,
} from '@/lib/integrations/adsense/oauth'
import {
  pullDaily,
  defaultDailyWindow,
  formatYmdInTz,
  parseDate,
  extractHost,
  mapReportToDrafts,
} from '@/lib/integrations/adsense/pull-daily'
import { createAdsenseClient } from '@/lib/integrations/adsense/client'
import adsenseAdapter from '@/lib/integrations/adsense'
import { ADSENSE_METRICS_ORDER } from '@/lib/integrations/adsense/schema'

/* ──────────────────────────────────────────────────────────────────
 * Helpers
 * ────────────────────────────────────────────────────────────────── */

function makeConnection(overrides: Partial<Connection> = {}): Connection {
  const orgId = 'org_a'
  const credentials = {
    accessToken: 'access_abc',
    refreshToken: 'refresh_xyz',
    expiresAt: Date.now() + 3600_000, // 1h ahead
  }
  return {
    id: 'adsense',
    provider: 'adsense',
    propertyId: 'prop_a',
    orgId,
    authKind: 'oauth2',
    status: 'connected',
    credentialsEnc: encryptCredentials(
      credentials as unknown as Record<string, unknown>,
      orgId,
    ),
    meta: { accountName: 'accounts/pub-1234567890123456' },
    scope: [...ADSENSE_SCOPES],
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

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/* ──────────────────────────────────────────────────────────────────
 * Adapter shape
 * ────────────────────────────────────────────────────────────────── */

describe('adsense adapter — registration', () => {
  it('exports the right shape', () => {
    expect(adsenseAdapter.provider).toBe('adsense')
    expect(adsenseAdapter.authKind).toBe('oauth2')
    expect(typeof adsenseAdapter.beginOAuth).toBe('function')
    expect(typeof adsenseAdapter.completeOAuth).toBe('function')
    expect(typeof adsenseAdapter.pullDaily).toBe('function')
    expect(adsenseAdapter.display.name).toMatch(/AdSense/i)
  })
})

/* ──────────────────────────────────────────────────────────────────
 * Pure helpers
 * ────────────────────────────────────────────────────────────────── */

describe('adsense — pure helpers', () => {
  it('parseDate parses YYYY-MM-DD', () => {
    expect(parseDate('2026-04-26')).toEqual({ year: 2026, month: 4, day: 26 })
    expect(parseDate('not-a-date')).toBeNull()
  })

  it('formatYmdInTz returns YYYY-MM-DD', () => {
    const formatted = formatYmdInTz(new Date('2026-04-26T12:00:00Z'), 'UTC')
    expect(formatted).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('defaultDailyWindow returns yesterday in tz, single-day window', () => {
    const w = defaultDailyWindow('UTC', new Date('2026-04-26T05:00:00Z'))
    expect(w.from).toBe('2026-04-25')
    expect(w.to).toBe('2026-04-25')
  })

  it('extractHost handles full URLs and bare hosts', () => {
    expect(extractHost('https://example.com/path')).toBe('example.com')
    expect(extractHost('example.com')).toBe('example.com')
    expect(extractHost('not a url')).toBeNull()
  })
})

/* ──────────────────────────────────────────────────────────────────
 * mapReportToDrafts
 * ────────────────────────────────────────────────────────────────── */

describe('mapReportToDrafts', () => {
  it('maps each AdSense column → MetricKind row, with currency on ad_revenue', () => {
    const drafts = mapReportToDrafts({
      report: {
        rows: [
          {
            cells: [
              { value: '2026-04-25' }, // DATE dimension
              { value: '12.34' }, // ESTIMATED_EARNINGS
              { value: '1000' }, // IMPRESSIONS
              { value: '50' }, // CLICKS
              { value: '0.05' }, // CTR
              { value: '0.25' }, // CPC
              { value: '12.34' }, // RPM
              { value: '1100' }, // AD_REQUESTS
            ],
          },
        ],
      },
      metricsOrder: [...ADSENSE_METRICS_ORDER],
      currency: 'USD',
      fallbackDate: '2026-04-25',
    })

    const byMetric = Object.fromEntries(drafts.map((d) => [d.metric, d]))
    expect(byMetric.ad_revenue.value).toBeCloseTo(12.34)
    expect(byMetric.ad_revenue.currency).toBe('USD')
    expect(byMetric.impressions.value).toBe(1000)
    expect(byMetric.clicks.value).toBe(50)
    expect(byMetric.ctr.value).toBeCloseTo(0.05)
    expect(byMetric.rpm.value).toBeCloseTo(12.34)
    expect(byMetric.ad_requests.value).toBe(1100)

    // CPC column is intentionally not emitted (no MetricKind for it).
    expect(byMetric.cpc).toBeUndefined()
  })

  it('falls back to fallbackDate when DATE cell missing/malformed', () => {
    const drafts = mapReportToDrafts({
      report: {
        rows: [
          {
            cells: [
              { value: '' },
              { value: '1.0' },
              { value: '10' },
              { value: '1' },
              { value: '0.1' },
              { value: '0.1' },
              { value: '1.0' },
              { value: '12' },
            ],
          },
        ],
      },
      metricsOrder: [...ADSENSE_METRICS_ORDER],
      currency: 'USD',
      fallbackDate: '2026-04-25',
    })
    expect(drafts.every((d) => d.date === '2026-04-25')).toBe(true)
  })

  it('skips rows with empty cells, non-numeric values, and empty reports', () => {
    expect(
      mapReportToDrafts({
        report: { rows: [] },
        metricsOrder: [...ADSENSE_METRICS_ORDER],
        currency: 'USD',
        fallbackDate: '2026-04-25',
      }),
    ).toEqual([])

    const drafts = mapReportToDrafts({
      report: {
        rows: [
          {
            cells: [
              { value: '2026-04-25' },
              { value: 'NaN' }, // ESTIMATED_EARNINGS — non-numeric
              { value: '' }, // IMPRESSIONS — empty
              { value: '5' }, // CLICKS
              { value: '0.5' }, // CTR
              { value: '0.5' }, // CPC
              { value: '1.0' }, // RPM
              { value: '10' }, // AD_REQUESTS
            ],
          },
        ],
      },
      metricsOrder: [...ADSENSE_METRICS_ORDER],
      currency: 'USD',
      fallbackDate: '2026-04-25',
    })
    const metrics = drafts.map((d) => d.metric)
    expect(metrics).not.toContain('ad_revenue')
    expect(metrics).not.toContain('impressions')
    expect(metrics).toContain('clicks')
    expect(metrics).toContain('ctr')
    expect(metrics).toContain('rpm')
    expect(metrics).toContain('ad_requests')
  })
})

/* ──────────────────────────────────────────────────────────────────
 * beginOAuth
 * ────────────────────────────────────────────────────────────────── */

describe('beginOAuth', () => {
  it('builds a Google authorize URL with offline access + consent prompt', async () => {
    const { authorizeUrl } = await beginOAuth({
      propertyId: 'prop_a',
      orgId: 'org_a',
      redirectUri: 'https://app.test/oauth/cb',
      state: 'state_xyz',
    })

    const url = new URL(authorizeUrl)
    expect(url.origin + url.pathname).toBe(GOOGLE_AUTHORIZE_ENDPOINT)
    expect(url.searchParams.get('client_id')).toBe('test-client-id')
    expect(url.searchParams.get('redirect_uri')).toBe('https://app.test/oauth/cb')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('access_type')).toBe('offline')
    expect(url.searchParams.get('prompt')).toBe('consent')
    expect(url.searchParams.get('state')).toBe('state_xyz')
    expect(url.searchParams.get('scope')).toContain('adsense.readonly')
  })

  it('returns an empty authorize URL when env is missing (does not throw)', async () => {
    const prev = process.env.GOOGLE_OAUTH_CLIENT_ID
    delete process.env.GOOGLE_OAUTH_CLIENT_ID
    const out = await beginOAuth({
      propertyId: 'prop_a',
      orgId: 'org_a',
      redirectUri: 'https://app.test/cb',
      state: 's',
    })
    expect(out.authorizeUrl).toBe('')
    process.env.GOOGLE_OAUTH_CLIENT_ID = prev
  })
})

/* ──────────────────────────────────────────────────────────────────
 * exchangeCodeForTokens / refreshAccessToken
 * ────────────────────────────────────────────────────────────────── */

describe('token endpoints', () => {
  afterEach(() => jest.restoreAllMocks())

  it('exchangeCodeForTokens POSTs to the token endpoint and parses the response', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse(200, {
          access_token: 'at',
          refresh_token: 'rt',
          expires_in: 3600,
          scope: 'adsense.readonly',
          token_type: 'Bearer',
        }) as unknown as Response,
      )

    const tokens = await exchangeCodeForTokens({
      code: 'auth_code',
      redirectUri: 'https://app.test/cb',
      clientId: 'cid',
      clientSecret: 'csec',
    })

    expect(tokens?.access_token).toBe('at')
    expect(tokens?.refresh_token).toBe('rt')
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(GOOGLE_TOKEN_ENDPOINT)
    expect(init?.method).toBe('POST')
    const body = String(init?.body)
    expect(body).toContain('grant_type=authorization_code')
    expect(body).toContain('code=auth_code')
  })

  it('exchangeCodeForTokens returns null on non-2xx', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse(400, { error: 'invalid_grant' }) as unknown as Response,
      )

    const tokens = await exchangeCodeForTokens({
      code: 'x',
      redirectUri: 'https://app.test/cb',
      clientId: 'cid',
      clientSecret: 'csec',
    })
    expect(tokens).toBeNull()
  })

  it('refreshAccessToken sends grant_type=refresh_token', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse(200, {
          access_token: 'new_at',
          expires_in: 1800,
          token_type: 'Bearer',
        }) as unknown as Response,
      )

    const out = await refreshAccessToken({
      refreshToken: 'rt',
      clientId: 'cid',
      clientSecret: 'csec',
    })
    expect(out?.access_token).toBe('new_at')
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(String(init?.body)).toContain('grant_type=refresh_token')
    expect(String(init?.body)).toContain('refresh_token=rt')
  })
})

/* ──────────────────────────────────────────────────────────────────
 * completeOAuth
 * ────────────────────────────────────────────────────────────────── */

describe('completeOAuth', () => {
  afterEach(() => {
    jest.restoreAllMocks()
    ;(upsertConnection as jest.Mock).mockClear()
  })

  it('exchanges code, discovers account, and upserts a connected connection', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      // 1. Token exchange.
      .mockResolvedValueOnce(
        jsonResponse(200, {
          access_token: 'at',
          refresh_token: 'rt',
          expires_in: 3600,
          token_type: 'Bearer',
        }) as unknown as Response,
      )
      // 2. /accounts discovery.
      .mockResolvedValueOnce(
        jsonResponse(200, {
          accounts: [
            {
              name: 'accounts/pub-9999',
              displayName: 'Test Pub',
              state: 'READY',
            },
          ],
        }) as unknown as Response,
      )

    await completeOAuth({
      propertyId: 'prop_a',
      orgId: 'org_a',
      code: 'auth_code',
      redirectUri: 'https://app.test/cb',
    })

    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect((upsertConnection as jest.Mock).mock.calls.length).toBe(1)
    const upsertArg = (upsertConnection as jest.Mock).mock.calls[0][0]
    expect(upsertArg.provider).toBe('adsense')
    expect(upsertArg.authKind).toBe('oauth2')
    expect(upsertArg.status).toBe('connected')
    expect(upsertArg.credentials.accessToken).toBe('at')
    expect(upsertArg.credentials.refreshToken).toBe('rt')
    expect(upsertArg.meta.accountName).toBe('accounts/pub-9999')
    expect(upsertArg.meta.publisherId).toBe('pub-9999')
    expect(upsertArg.scope).toContain('https://www.googleapis.com/auth/adsense.readonly')
    expect(upsertArg.createdBy).toBe('system')
    expect(upsertArg.createdByType).toBe('system')
  })

  it('saves status=error when token exchange fails', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse(400, { error: 'invalid_grant' }) as unknown as Response,
      )

    await completeOAuth({
      propertyId: 'prop_a',
      orgId: 'org_a',
      code: 'bad_code',
      redirectUri: 'https://app.test/cb',
    })
    const upsertArg = (upsertConnection as jest.Mock).mock.calls[0][0]
    expect(upsertArg.status).toBe('error')
    expect(upsertArg.credentials).toBeNull()
  })

  it('still saves connected when /accounts discovery fails (no fatal)', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse(200, {
          access_token: 'at',
          refresh_token: 'rt',
          expires_in: 3600,
          token_type: 'Bearer',
        }) as unknown as Response,
      )
      .mockResolvedValueOnce(
        jsonResponse(500, { error: 'oops' }) as unknown as Response,
      )

    await completeOAuth({
      propertyId: 'prop_a',
      orgId: 'org_a',
      code: 'auth_code',
      redirectUri: 'https://app.test/cb',
    })
    const upsertArg = (upsertConnection as jest.Mock).mock.calls[0][0]
    expect(upsertArg.status).toBe('connected')
    expect(upsertArg.meta.accountName).toBeUndefined()
  })
})

/* ──────────────────────────────────────────────────────────────────
 * createAdsenseClient — auto-refresh paths
 * ────────────────────────────────────────────────────────────────── */

describe('createAdsenseClient', () => {
  afterEach(() => {
    jest.restoreAllMocks()
    ;(upsertConnection as jest.Mock).mockClear()
  })

  it('returns no_credentials when connection has no credentialsEnc', async () => {
    const conn = makeConnection({ credentialsEnc: null })
    const out = await createAdsenseClient({ connection: conn })
    expect('error' in out).toBe(true)
    if ('error' in out) {
      expect(out.error).toBe('no_credentials')
    }
  })

  it('proactively refreshes when token is within 60s of expiry', async () => {
    const conn = makeConnection()
    // Override credentials with a near-expiry token.
    const orgId = conn.orgId
    const credentialsEnc = encryptCredentials(
      {
        accessToken: 'old_at',
        refreshToken: 'rt',
        expiresAt: 0, // long expired
      },
      orgId,
    )
    const expiringConn: Connection = { ...conn, credentialsEnc }

    const fetchSpy = jest
      .spyOn(global, 'fetch')
      // refresh token call
      .mockResolvedValueOnce(
        jsonResponse(200, {
          access_token: 'new_at',
          expires_in: 3600,
          token_type: 'Bearer',
        }) as unknown as Response,
      )
      // subsequent GET call from caller
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }) as unknown as Response)

    const out = await createAdsenseClient({
      connection: expiringConn,
      now: () => 1_700_000_000_000,
    })
    expect('error' in out).toBe(false)
    if ('error' in out) return
    expect(out.accountName).toBe('accounts/pub-1234567890123456')

    // Assert: refresh was persisted via upsertConnection.
    expect((upsertConnection as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(1)
    const persistedArg = (upsertConnection as jest.Mock).mock.calls[0][0]
    expect(persistedArg.credentials.accessToken).toBe('new_at')
    expect(persistedArg.status).toBe('connected')

    // First fetch should have been to the token endpoint.
    expect(fetchSpy.mock.calls[0][0]).toBe(GOOGLE_TOKEN_ENDPOINT)
  })

  it('reactively refreshes on 401 then retries the same request', async () => {
    const conn = makeConnection()
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      // 1. initial GET → 401
      .mockResolvedValueOnce(
        new Response('expired', { status: 401 }) as unknown as Response,
      )
      // 2. token refresh
      .mockResolvedValueOnce(
        jsonResponse(200, {
          access_token: 'new_at',
          expires_in: 3600,
          token_type: 'Bearer',
        }) as unknown as Response,
      )
      // 3. retried GET
      .mockResolvedValueOnce(
        jsonResponse(200, { hello: 'world' }) as unknown as Response,
      )

    const out = await createAdsenseClient({ connection: conn })
    expect('error' in out).toBe(false)
    if ('error' in out) return

    const result = await out.get<{ hello: string }>(
      '/accounts/pub-1234567890123456',
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.hello).toBe('world')
    }
    // Three fetches total.
    expect(fetchSpy).toHaveBeenCalledTimes(3)
    // Auth header on retried request uses the new token.
    const [, retriedInit] = fetchSpy.mock.calls[2]
    const headers = (retriedInit as RequestInit | undefined)?.headers as
      | Record<string, string>
      | undefined
    expect(headers?.authorization).toBe('Bearer new_at')
  })

  it('marks reauth_required when refresh fails', async () => {
    const conn = makeConnection()
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response('expired', { status: 401 }) as unknown as Response,
      )
      .mockResolvedValueOnce(
        jsonResponse(400, {
          error: 'invalid_grant',
        }) as unknown as Response,
      )

    const client = await createAdsenseClient({ connection: conn })
    if ('error' in client) throw new Error('expected client')
    const result = await client.get('/anywhere')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('reauth_required')
    }
    const calls = (upsertConnection as jest.Mock).mock.calls
    const reauth = calls.find((c) => c[0]?.status === 'reauth_required')
    expect(reauth).toBeDefined()
  })

  it('classifies 429 as rate_limited', async () => {
    const conn = makeConnection()
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse(429, { error: 'rate' }) as unknown as Response,
      )

    const client = await createAdsenseClient({ connection: conn })
    if ('error' in client) throw new Error('expected client')
    const out = await client.get('/anything')
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.reason).toBe('rate_limited')
  })
})

/* ──────────────────────────────────────────────────────────────────
 * pullDaily — integration of all the pieces
 * ────────────────────────────────────────────────────────────────── */

describe('pullDaily', () => {
  beforeEach(() => {
    ;(writeMetrics as jest.Mock).mockClear()
    ;(upsertConnection as jest.Mock).mockClear()
  })
  afterEach(() => jest.restoreAllMocks())

  it('returns metricsWritten:0 when connection has no credentials', async () => {
    const conn = makeConnection({ credentialsEnc: null })
    const result = await pullDaily({
      connection: conn,
      window: { from: '2026-04-25', to: '2026-04-25' },
      fetchProperty: async () => null,
    })
    expect(result.metricsWritten).toBe(0)
    expect(result.notes?.[0]).toMatch(/no_credentials/)
    expect((writeMetrics as jest.Mock).mock.calls.length).toBe(0)
  })

  it('happy path: fetches the report and writes 6 metric rows for one day', async () => {
    const conn = makeConnection()

    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse(200, {
          rows: [
            {
              cells: [
                { value: '2026-04-25' },
                { value: '12.34' }, // ESTIMATED_EARNINGS
                { value: '1000' }, // IMPRESSIONS
                { value: '50' }, // CLICKS
                { value: '0.05' }, // CTR
                { value: '0.25' }, // CPC
                { value: '12.34' }, // RPM
                { value: '1100' }, // AD_REQUESTS
              ],
            },
          ],
        }) as unknown as Response,
      )

    const result = await pullDaily({
      connection: conn,
      window: { from: '2026-04-25', to: '2026-04-25' },
      fetchProperty: async () => ({
        id: 'prop_a',
        orgId: 'org_a',
        name: 'Test',
        domain: 'example.com',
        type: 'web',
        status: 'active',
        config: {
          siteUrl: 'https://example.com',
          revenue: {
            currency: 'USD',
            timezone: 'UTC',
            adsenseClientId: 'ca-pub-1234567890123456',
          },
        },
        ingestKey: 'k',
        ingestKeyRotatedAt: null,
        createdAt: null,
        createdBy: 'u',
        createdByType: 'user',
        updatedAt: null,
      }),
    })

    expect(result.from).toBe('2026-04-25')
    expect(result.to).toBe('2026-04-25')
    // Six emitted metrics: ad_revenue, impressions, clicks, ctr, rpm, ad_requests.
    expect(result.metricsWritten).toBe(6)

    const writeArg = (writeMetrics as jest.Mock).mock.calls[0][0] as Array<{
      metric: string
      currency: string | null
    }>
    const metricKinds = writeArg.map((r) => r.metric).sort()
    expect(metricKinds).toEqual(
      ['ad_requests', 'ad_revenue', 'clicks', 'ctr', 'impressions', 'rpm'].sort(),
    )

    // Currency is set on ad_revenue and rpm.
    const adRevenue = writeArg.find((r) => r.metric === 'ad_revenue')
    expect(adRevenue?.currency).toBe('USD')

    // Verify we hit the reports endpoint with expected params.
    const reportUrl = String(fetchSpy.mock.calls[0][0])
    expect(reportUrl).toContain(`${ADSENSE_API_BASE}/accounts/pub-1234567890123456/reports:generate`)
    expect(reportUrl).toContain('dateRange=CUSTOM')
    expect(reportUrl).toContain('startDate.year=2026')
    expect(reportUrl).toContain('endDate.day=25')
    expect(reportUrl).toContain('metrics=ESTIMATED_EARNINGS')
    expect(reportUrl).toContain('metrics=AD_REQUESTS')
    expect(reportUrl).toContain('currencyCode=USD')
    expect(reportUrl).toContain('filters=DOMAIN_NAME%3D%3Dexample.com')
  })

  it('returns 0 with note when report endpoint returns 4xx', async () => {
    const conn = makeConnection()
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse(403, { error: 'forbidden' }) as unknown as Response,
      )

    const result = await pullDaily({
      connection: conn,
      window: { from: '2026-04-25', to: '2026-04-25' },
      fetchProperty: async () => null,
    })
    expect(result.metricsWritten).toBe(0)
    expect(result.notes?.[0]).toMatch(/report failed.*forbidden/)
    expect((writeMetrics as jest.Mock).mock.calls.length).toBe(0)
  })

  it('returns 0 when report has no rows', async () => {
    const conn = makeConnection()
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse(200, { rows: [] }) as unknown as Response)

    const result = await pullDaily({
      connection: conn,
      window: { from: '2026-04-25', to: '2026-04-25' },
      fetchProperty: async () => null,
    })
    expect(result.metricsWritten).toBe(0)
    expect(result.notes?.[0]).toMatch(/no rows/)
    expect((writeMetrics as jest.Mock).mock.calls.length).toBe(0)
  })

  it('discovers + caches accountName when meta is missing it', async () => {
    const orgId = 'org_a'
    const credentialsEnc = encryptCredentials(
      {
        accessToken: 'at',
        refreshToken: 'rt',
        expiresAt: Date.now() + 3600_000,
      },
      orgId,
    )
    const conn = makeConnection({
      meta: {}, // no accountName
      credentialsEnc,
    })

    jest
      .spyOn(global, 'fetch')
      // /accounts discovery
      .mockResolvedValueOnce(
        jsonResponse(200, {
          accounts: [{ name: 'accounts/pub-7777', state: 'READY' }],
        }) as unknown as Response,
      )
      // reports:generate
      .mockResolvedValueOnce(
        jsonResponse(200, {
          rows: [
            {
              cells: [
                { value: '2026-04-25' },
                { value: '1' },
                { value: '10' },
                { value: '1' },
                { value: '0.1' },
                { value: '0.1' },
                { value: '1.0' },
                { value: '11' },
              ],
            },
          ],
        }) as unknown as Response,
      )

    const result = await pullDaily({
      connection: conn,
      window: { from: '2026-04-25', to: '2026-04-25' },
      fetchProperty: async () => null,
    })

    expect(result.metricsWritten).toBe(6)
    // Verify cache was written.
    const cacheCall = (upsertConnection as jest.Mock).mock.calls.find(
      (c) => c[0]?.meta?.accountName === 'accounts/pub-7777',
    )
    expect(cacheCall).toBeDefined()
  })

  it('uses defaultDailyWindow when no window is passed', async () => {
    const conn = makeConnection()
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse(200, { rows: [] }) as unknown as Response)

    const fixedNow = new Date('2026-04-26T05:00:00Z')
    const result = await pullDaily({
      connection: conn,
      now: () => fixedNow,
      fetchProperty: async () => null,
    })
    // Yesterday in UTC
    expect(result.from).toBe('2026-04-25')
    expect(result.to).toBe('2026-04-25')
  })
})
