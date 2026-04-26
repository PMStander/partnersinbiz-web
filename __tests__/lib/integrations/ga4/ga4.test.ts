// 64-char hex master key for tests (matches the production format)
process.env.SOCIAL_TOKEN_MASTER_KEY =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

// ----- Mocks ---------------------------------------------------------------
// These are the only seams the adapter touches outside its own module:
//   * lib/metrics/write       — writes the metric rows
//   * lib/integrations/connections — upsert/setStatus during OAuth/revoke
//   * lib/firebase/admin      — adminDb.collection('properties').doc(...).get()

jest.mock('@/lib/metrics/write', () => ({
  __esModule: true,
  writeMetrics: jest.fn(async (rows: unknown[]) => ({ written: rows.length })),
  metricDocId: jest.fn(() => 'doc_id'),
  deleteMetric: jest.fn(),
  METRICS_COLLECTION: 'metrics',
}))

jest.mock('@/lib/integrations/connections', () => ({
  __esModule: true,
  getConnection: jest.fn(),
  upsertConnection: jest.fn(async (input: Record<string, unknown>) => ({
    id: 'ga4',
    ...input,
  })),
  markPullSuccess: jest.fn(),
  markPullFailure: jest.fn(),
  setConnectionStatus: jest.fn(),
  deleteConnection: jest.fn(),
  listConnectionsForProperty: jest.fn(),
  listConnectionsForOrg: jest.fn(),
  listDueConnections: jest.fn(),
}))

// adminDb is read by pull-daily to look up the property. Default: not found.
const propertySnap: { exists: boolean; data: () => unknown } = {
  exists: false,
  data: () => undefined,
}

jest.mock('@/lib/firebase/admin', () => ({
  __esModule: true,
  adminDb: {
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn(async () => propertySnap),
      })),
    })),
  },
}))

import {
  createGa4Client,
  Ga4ApiError,
} from '@/lib/integrations/ga4/client'
import {
  pullDaily,
  yesterdayInTimezone,
  buildDailyReportRequest,
  buildSourceMediumReportRequest,
} from '@/lib/integrations/ga4/pull-daily'
import {
  beginOAuth,
  completeOAuth,
  exchangeCodeForTokens,
  refreshAccessToken,
  GA4_SCOPES,
  GOOGLE_AUTHORIZE_ENDPOINT,
  GOOGLE_TOKEN_ENDPOINT,
} from '@/lib/integrations/ga4/oauth'
import { GA4_METRICS_ORDER } from '@/lib/integrations/ga4/schema'
import ga4Adapter from '@/lib/integrations/ga4'
import { encryptCredentials } from '@/lib/integrations/crypto'
import { writeMetrics } from '@/lib/metrics/write'
import { upsertConnection } from '@/lib/integrations/connections'
import type { Connection } from '@/lib/integrations/types'

const writeMetricsMock = writeMetrics as jest.MockedFunction<typeof writeMetrics>
const upsertConnectionMock = upsertConnection as jest.MockedFunction<typeof upsertConnection>

// ----- Helpers -------------------------------------------------------------

function makeConnection(overrides: Partial<Connection> = {}): Connection {
  const credentialsEnc = encryptCredentials(
    { accessToken: 'at_test', refreshToken: 'rt_test', expiresAt: Date.now() + 60_000 },
    'org_test',
  )
  return {
    id: 'ga4',
    provider: 'ga4',
    propertyId: 'prop_1',
    orgId: 'org_test',
    authKind: 'oauth2',
    status: 'connected',
    credentialsEnc,
    meta: { ga4PropertyId: '123456789' },
    scope: [...GA4_SCOPES],
    lastPulledAt: null,
    lastSuccessAt: null,
    lastError: null,
    consecutiveFailures: 0,
    backfilledThrough: null,
    createdAt: null,
    updatedAt: null,
    createdBy: 'admin',
    createdByType: 'user',
    ...overrides,
  }
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

/** Build a synthetic GA4 :runReport response from a metric-name → value map. */
function makeDailyReport(date: string, metricValues: Record<string, number>) {
  const headers = GA4_METRICS_ORDER.map((name) => ({ name }))
  const cells = GA4_METRICS_ORDER.map((name) => ({
    value: String(metricValues[name] ?? 0),
  }))
  return {
    dimensionHeaders: [{ name: 'date' }],
    metricHeaders: headers,
    rows: [
      {
        dimensionValues: [{ value: date.replace(/-/g, '') }],
        metricValues: cells,
      },
    ],
    rowCount: 1,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  writeMetricsMock.mockImplementation(async (rows) => ({ written: rows.length }))
  propertySnap.exists = false
  propertySnap.data = () => undefined
  process.env.GOOGLE_OAUTH_CLIENT_ID = 'cid_test'
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'csecret_test'
})

afterEach(() => {
  jest.restoreAllMocks()
})

// ============================================================================
// Adapter shape
// ============================================================================

describe('GA4 adapter shape', () => {
  it('declares provider, authKind, and required hooks', () => {
    expect(ga4Adapter.provider).toBe('ga4')
    expect(ga4Adapter.authKind).toBe('oauth2')
    expect(typeof ga4Adapter.pullDaily).toBe('function')
    expect(typeof ga4Adapter.beginOAuth).toBe('function')
    expect(typeof ga4Adapter.completeOAuth).toBe('function')
    expect(typeof ga4Adapter.revoke).toBe('function')
    expect(ga4Adapter.display.name).toMatch(/Google Analytics/i)
  })

  it('does NOT expose saveCredentials (GA4 is OAuth-only)', () => {
    expect(ga4Adapter.saveCredentials).toBeUndefined()
  })

  it('exports the analytics.readonly OAuth scope', () => {
    expect(GA4_SCOPES).toEqual([
      'https://www.googleapis.com/auth/analytics.readonly',
    ])
  })
})

// ============================================================================
// OAuth: beginOAuth
// ============================================================================

describe('beginOAuth', () => {
  it('returns an authorize URL with the expected params', async () => {
    const out = await beginOAuth({
      propertyId: 'prop_1',
      orgId: 'org_test',
      redirectUri: 'https://app.example.com/callback',
      state: 'state_xyz',
    })
    expect(out.authorizeUrl.startsWith(GOOGLE_AUTHORIZE_ENDPOINT)).toBe(true)
    const url = new URL(out.authorizeUrl)
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('client_id')).toBe('cid_test')
    expect(url.searchParams.get('redirect_uri')).toBe('https://app.example.com/callback')
    expect(url.searchParams.get('scope')).toBe(GA4_SCOPES.join(' '))
    expect(url.searchParams.get('state')).toBe('state_xyz')
    expect(url.searchParams.get('access_type')).toBe('offline')
    expect(url.searchParams.get('prompt')).toBe('consent')
  })

  it('returns an empty authorize URL when env vars are missing', async () => {
    delete process.env.GOOGLE_OAUTH_CLIENT_ID
    delete process.env.GOOGLE_OAUTH_CLIENT_SECRET
    const out = await beginOAuth({
      propertyId: 'prop_1',
      orgId: 'org_test',
      redirectUri: 'https://app.example.com/callback',
      state: 's',
    })
    expect(out.authorizeUrl).toBe('')
  })
})

// ============================================================================
// OAuth: completeOAuth + token helpers
// ============================================================================

describe('completeOAuth', () => {
  it('persists tokens and connected status after a successful exchange', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse({
        access_token: 'at_new',
        refresh_token: 'rt_new',
        expires_in: 3600,
        token_type: 'Bearer',
      }),
    )

    const out = await completeOAuth({
      propertyId: 'prop_1',
      orgId: 'org_test',
      code: 'authcode',
      redirectUri: 'https://app.example.com/callback',
    })

    expect(upsertConnectionMock).toHaveBeenCalledTimes(1)
    const arg = upsertConnectionMock.mock.calls[0][0]
    expect(arg.provider).toBe('ga4')
    expect(arg.authKind).toBe('oauth2')
    expect(arg.status).toBe('connected')
    expect(arg.credentials).toMatchObject({
      accessToken: 'at_new',
      refreshToken: 'rt_new',
    })
    expect(arg.scope).toContain('https://www.googleapis.com/auth/analytics.readonly')
    expect(out.id).toBe('ga4')
  })

  it('records error status when env vars are missing', async () => {
    delete process.env.GOOGLE_OAUTH_CLIENT_ID
    await completeOAuth({
      propertyId: 'prop_1',
      orgId: 'org_test',
      code: 'authcode',
      redirectUri: 'https://app.example.com/callback',
    })
    const arg = upsertConnectionMock.mock.calls[0][0]
    expect(arg.status).toBe('error')
    expect(arg.meta).toMatchObject({ error: expect.stringMatching(/CLIENT_ID/i) })
  })

  it('records error status when token exchange fails', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response('bad code', { status: 400 }),
    )
    await completeOAuth({
      propertyId: 'prop_1',
      orgId: 'org_test',
      code: 'authcode',
      redirectUri: 'https://app.example.com/callback',
    })
    const arg = upsertConnectionMock.mock.calls[0][0]
    expect(arg.status).toBe('error')
    expect(arg.meta).toMatchObject({ error: 'token_exchange_failed' })
  })
})

describe('exchangeCodeForTokens / refreshAccessToken', () => {
  it('exchangeCodeForTokens posts to the Google token endpoint', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse({
        access_token: 'at',
        refresh_token: 'rt',
        expires_in: 3600,
        token_type: 'Bearer',
      }),
    )
    const out = await exchangeCodeForTokens({
      code: 'c',
      redirectUri: 'r',
      clientId: 'cid',
      clientSecret: 'cs',
    })
    expect(out?.access_token).toBe('at')
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe(GOOGLE_TOKEN_ENDPOINT)
    expect((init as RequestInit).method).toBe('POST')
    const body = (init as RequestInit).body as string
    expect(body).toContain('grant_type=authorization_code')
    expect(body).toContain('code=c')
  })

  it('exchangeCodeForTokens returns null on non-2xx', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response('nope', { status: 401 }),
    )
    const out = await exchangeCodeForTokens({
      code: 'c',
      redirectUri: 'r',
      clientId: 'cid',
      clientSecret: 'cs',
    })
    expect(out).toBeNull()
  })

  it('refreshAccessToken returns the refreshed token on success', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse({
        access_token: 'at2',
        expires_in: 3600,
        token_type: 'Bearer',
      }),
    )
    const out = await refreshAccessToken({
      refreshToken: 'rt',
      clientId: 'cid',
      clientSecret: 'cs',
    })
    expect(out?.access_token).toBe('at2')
  })
})

// ============================================================================
// Client: createGa4Client + runReport
// ============================================================================

describe('createGa4Client.runReport', () => {
  it('POSTs to /v1beta/properties/{id}:runReport with bearer auth and the request body', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse({ rows: [], metricHeaders: [] }),
    )

    const client = createGa4Client({
      credentials: {
        accessToken: 'at_x',
        refreshToken: 'rt_x',
        expiresAt: Date.now() + 60_000,
      },
    })
    await client.runReport({
      ga4PropertyId: '987654321',
      request: buildDailyReportRequest({ from: '2026-04-25', to: '2026-04-25' }),
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe(
      'https://analyticsdata.googleapis.com/v1beta/properties/987654321:runReport',
    )
    expect((init as RequestInit).method).toBe('POST')
    const headers = (init as RequestInit).headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer at_x')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.metrics.map((m: { name: string }) => m.name)).toEqual([
      ...GA4_METRICS_ORDER,
    ])
    expect(body.dimensions).toEqual([{ name: 'date' }])
  })

  it('strips a leading "properties/" prefix from the property id', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse({ rows: [] }),
    )
    const client = createGa4Client({
      credentials: { accessToken: 'at', refreshToken: 'rt', expiresAt: Date.now() + 60_000 },
    })
    await client.runReport({
      ga4PropertyId: 'properties/123',
      request: buildDailyReportRequest({ from: '2026-04-25', to: '2026-04-25' }),
    })
    expect(String(fetchMock.mock.calls[0][0])).toContain('/properties/123:runReport')
  })

  it('refreshes a near-expired access token before issuing the request', async () => {
    const refresh = jest.fn(async () => ({
      access_token: 'at_fresh',
      expires_in: 3600,
      token_type: 'Bearer',
    }))
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse({}))

    const client = createGa4Client({
      credentials: {
        accessToken: 'at_stale',
        refreshToken: 'rt',
        // expires within the 60s skew → triggers refresh
        expiresAt: Date.now() + 1_000,
      },
      oauth: { clientId: 'cid', clientSecret: 'cs' },
      refresh,
    })
    await client.runReport({
      ga4PropertyId: '1',
      request: buildDailyReportRequest({ from: '2026-04-25', to: '2026-04-25' }),
    })
    expect(refresh).toHaveBeenCalledTimes(1)
    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer at_fresh')
  })

  it('retries once with a refreshed token on a 401 response', async () => {
    const refresh = jest.fn(async () => ({
      access_token: 'at_fresh',
      expires_in: 3600,
      token_type: 'Bearer',
    }))
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response('unauth', { status: 401 }))
      .mockResolvedValueOnce(jsonResponse({ rows: [] }))

    const client = createGa4Client({
      credentials: {
        accessToken: 'at_stale',
        refreshToken: 'rt',
        expiresAt: Date.now() + 60 * 60 * 1000, // not stale, but server still 401s
      },
      oauth: { clientId: 'cid', clientSecret: 'cs' },
      refresh,
    })
    await client.runReport({
      ga4PropertyId: '1',
      request: buildDailyReportRequest({ from: '2026-04-25', to: '2026-04-25' }),
    })
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('throws Ga4ApiError with status on non-2xx that is not 401', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'boom' } }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const client = createGa4Client({
      credentials: { accessToken: 'at', refreshToken: 'rt', expiresAt: Date.now() + 60_000 },
    })
    await expect(
      client.runReport({
        ga4PropertyId: '1',
        request: buildDailyReportRequest({ from: '2026-04-25', to: '2026-04-25' }),
      }),
    ).rejects.toMatchObject({ name: 'Ga4ApiError', status: 500 })
  })
})

// ============================================================================
// yesterdayInTimezone
// ============================================================================

describe('yesterdayInTimezone', () => {
  it('returns the previous YYYY-MM-DD in UTC by default', () => {
    expect(
      yesterdayInTimezone(new Date('2026-04-26T05:00:00Z')),
    ).toBe('2026-04-25')
  })

  it('falls back to UTC when timezone is invalid', () => {
    expect(
      yesterdayInTimezone(new Date('2026-04-26T05:00:00Z'), 'Not/A/TZ'),
    ).toBe('2026-04-25')
  })

  it('returns a YYYY-MM-DD string for valid IANA timezones', () => {
    const out = yesterdayInTimezone(new Date('2026-04-26T05:00:00Z'), 'America/New_York')
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

// ============================================================================
// pullDaily
// ============================================================================

describe('pullDaily', () => {
  it('returns 0 written and a note when there are no credentials', async () => {
    const conn = makeConnection({ credentialsEnc: null })
    const result = await pullDaily({ connection: conn })
    expect(result.metricsWritten).toBe(0)
    expect(result.notes?.[0]).toMatch(/No GA4 credentials/i)
    expect(writeMetricsMock).not.toHaveBeenCalled()
  })

  it('returns 0 written and a note when ga4PropertyId cannot be resolved', async () => {
    const conn = makeConnection({ meta: {} })
    propertySnap.exists = true
    propertySnap.data = () => ({ config: { revenue: {} } })
    const result = await pullDaily({ connection: conn })
    expect(result.metricsWritten).toBe(0)
    expect(result.notes?.[0]).toMatch(/propertyId/i)
    expect(writeMetricsMock).not.toHaveBeenCalled()
  })

  it('falls back to Property.config.revenue.ga4PropertyId when meta is empty', async () => {
    const conn = makeConnection({ meta: {} })
    propertySnap.exists = true
    propertySnap.data = () => ({
      config: { revenue: { ga4PropertyId: '999000111', timezone: 'UTC' } },
    })

    const fakeClient = {
      runReport: jest.fn(async () => makeDailyReport('2026-04-25', { sessions: 1 })),
      getCredentials: jest.fn(() => ({
        accessToken: 'at',
        refreshToken: 'rt',
        expiresAt: Date.now() + 60_000,
      })),
      request: jest.fn(),
    }

    await pullDaily(
      { connection: conn },
      { client: fakeClient, now: new Date('2026-04-26T05:00:00Z'), includeSourceMedium: false },
    )
    expect(fakeClient.runReport).toHaveBeenCalled()
    const firstCall = fakeClient.runReport.mock.calls[0] as unknown as [
      { ga4PropertyId: string; request: { dateRanges: unknown[] } },
    ]
    expect(firstCall[0].ga4PropertyId).toBe('999000111')
  })

  it('writes one metric row per (date, metric) cell from the daily report', async () => {
    const conn = makeConnection()
    const fakeClient = {
      runReport: jest.fn(async () =>
        makeDailyReport('2026-04-25', {
          sessions: 1234,
          screenPageViews: 5000,
          totalUsers: 800,
          newUsers: 150,
          engagedSessions: 900,
          bounceRate: 0.32,
          averageSessionDuration: 120.5,
          conversions: 25,
        }),
      ),
      getCredentials: jest.fn(() => ({
        accessToken: 'at',
        refreshToken: 'rt',
        expiresAt: Date.now() + 60_000,
      })),
      request: jest.fn(),
    }

    const result = await pullDaily(
      { connection: conn },
      { client: fakeClient, now: new Date('2026-04-26T05:00:00Z'), includeSourceMedium: false },
    )

    expect(fakeClient.runReport).toHaveBeenCalledTimes(1)
    const rows = writeMetricsMock.mock.calls[0][0]
    const map = new Map(rows.map((r) => [r.metric, r]))

    expect(map.get('sessions')?.value).toBe(1234)
    expect(map.get('pageviews')?.value).toBe(5000)
    expect(map.get('users')?.value).toBe(800)
    expect(map.get('new_users')?.value).toBe(150)
    expect(map.get('engaged_sessions')?.value).toBe(900)
    expect(map.get('bounce_rate')?.value).toBeCloseTo(0.32)
    expect(map.get('avg_session_duration')?.value).toBeCloseTo(120.5)
    expect(map.get('conversions')?.value).toBe(25)

    // All rows are GA4 sourced, currency-less, and bucketed on the report date.
    for (const r of rows) {
      expect(r.source).toBe('ga4')
      expect(r.currency).toBeNull()
      expect(r.date).toBe('2026-04-25')
    }

    expect(result.from).toBe('2026-04-25')
    expect(result.to).toBe('2026-04-25')
    expect(result.metricsWritten).toBe(rows.length)
  })

  it('writes per-source_medium conversion rows from the breakdown report', async () => {
    const conn = makeConnection()
    const dailyReport = makeDailyReport('2026-04-25', { sessions: 1, conversions: 10 })
    const breakdownReport = {
      dimensionHeaders: [{ name: 'sessionSourceMedium' }],
      metricHeaders: [{ name: 'conversions' }, { name: 'sessions' }],
      rows: [
        {
          dimensionValues: [{ value: 'google / cpc' }],
          metricValues: [{ value: '5' }, { value: '100' }],
        },
        {
          dimensionValues: [{ value: '(direct) / (none)' }],
          metricValues: [{ value: '3' }, { value: '50' }],
        },
      ],
    }

    const fakeClient = {
      runReport: jest
        .fn()
        .mockResolvedValueOnce(dailyReport)
        .mockResolvedValueOnce(breakdownReport),
      getCredentials: jest.fn(() => ({
        accessToken: 'at',
        refreshToken: 'rt',
        expiresAt: Date.now() + 60_000,
      })),
      request: jest.fn(),
    }

    await pullDaily(
      { connection: conn },
      { client: fakeClient, now: new Date('2026-04-26T05:00:00Z') },
    )

    expect(fakeClient.runReport).toHaveBeenCalledTimes(2)
    const rows = writeMetricsMock.mock.calls[0][0]
    const sourceMediumRows = rows.filter((r) => r.dimension === 'source_medium')
    expect(sourceMediumRows).toHaveLength(2)
    expect(sourceMediumRows.map((r) => r.dimensionValue).sort()).toEqual([
      '(direct) / (none)',
      'google / cpc',
    ])
    expect(sourceMediumRows.every((r) => r.metric === 'conversions')).toBe(true)
  })

  it('caps source/medium breakdown to top 10 via the request limit', () => {
    const req = buildSourceMediumReportRequest({ from: '2026-04-25', to: '2026-04-25' })
    expect(req.limit).toBe('10')
    expect(req.dimensions).toEqual([{ name: 'sessionSourceMedium' }])
    expect(req.orderBys?.[0]).toEqual({
      metric: { metricName: 'conversions' },
      desc: true,
    })
  })

  it('soft-fails on GA4 4xx and writes nothing', async () => {
    const conn = makeConnection()
    const fakeClient = {
      runReport: jest.fn(async () => {
        throw new Ga4ApiError(403, 'forbidden', '')
      }),
      getCredentials: jest.fn(() => ({
        accessToken: 'at',
        refreshToken: 'rt',
        expiresAt: Date.now() + 60_000,
      })),
      request: jest.fn(),
    }

    const result = await pullDaily(
      { connection: conn },
      { client: fakeClient, now: new Date('2026-04-26T05:00:00Z') },
    )
    expect(result.metricsWritten).toBe(0)
    expect(result.notes?.[0]).toMatch(/403/)
    expect(writeMetricsMock).not.toHaveBeenCalled()
  })

  it('throws on GA4 5xx so the dispatcher records a failure', async () => {
    const conn = makeConnection()
    const fakeClient = {
      runReport: jest.fn(async () => {
        throw new Ga4ApiError(500, 'oops', '')
      }),
      getCredentials: jest.fn(() => ({
        accessToken: 'at',
        refreshToken: 'rt',
        expiresAt: Date.now() + 60_000,
      })),
      request: jest.fn(),
    }
    await expect(
      pullDaily({ connection: conn }, { client: fakeClient }),
    ).rejects.toMatchObject({ status: 500 })
  })

  it('respects an explicit window override', async () => {
    const conn = makeConnection()
    const fakeClient = {
      runReport: jest.fn(async () => makeDailyReport('2026-04-01', { sessions: 1 })),
      getCredentials: jest.fn(() => ({
        accessToken: 'at',
        refreshToken: 'rt',
        expiresAt: Date.now() + 60_000,
      })),
      request: jest.fn(),
    }

    const result = await pullDaily(
      { connection: conn, window: { from: '2026-04-01', to: '2026-04-01' } },
      { client: fakeClient, now: new Date('2026-04-26T05:00:00Z'), includeSourceMedium: false },
    )
    expect(result.from).toBe('2026-04-01')
    expect(result.to).toBe('2026-04-01')
    const firstCall = fakeClient.runReport.mock.calls[0] as unknown as [
      { ga4PropertyId: string; request: { dateRanges: { startDate: string; endDate: string }[] } },
    ]
    expect(firstCall[0].request.dateRanges).toEqual([
      { startDate: '2026-04-01', endDate: '2026-04-01' },
    ])
  })

  it('surfaces a sampling note when the report metadata is sampled', async () => {
    const conn = makeConnection()
    const sampled = {
      ...makeDailyReport('2026-04-25', { sessions: 100 }),
      metadata: {
        samplingMetadatas: [{ samplesReadCount: '1000', samplingSpaceSize: '5000' }],
      },
    }
    const fakeClient = {
      runReport: jest
        .fn()
        .mockResolvedValueOnce(sampled)
        .mockResolvedValueOnce({ rows: [] }),
      getCredentials: jest.fn(() => ({
        accessToken: 'at',
        refreshToken: 'rt',
        expiresAt: Date.now() + 60_000,
      })),
      request: jest.fn(),
    }

    const result = await pullDaily(
      { connection: conn },
      { client: fakeClient, now: new Date('2026-04-26T05:00:00Z') },
    )
    expect(result.notes?.some((n) => /sampled/i.test(n))).toBe(true)
  })

  it('returns 0 written and a note when GA4 returns an empty rows array', async () => {
    const conn = makeConnection()
    const fakeClient = {
      runReport: jest.fn(async () => ({
        dimensionHeaders: [{ name: 'date' }],
        metricHeaders: GA4_METRICS_ORDER.map((name) => ({ name })),
        rows: [],
      })),
      getCredentials: jest.fn(() => ({
        accessToken: 'at',
        refreshToken: 'rt',
        expiresAt: Date.now() + 60_000,
      })),
      request: jest.fn(),
    }

    const result = await pullDaily(
      { connection: conn },
      { client: fakeClient, now: new Date('2026-04-26T05:00:00Z'), includeSourceMedium: false },
    )
    expect(result.metricsWritten).toBe(0)
    expect(result.notes?.[0]).toMatch(/no rows/i)
    expect(writeMetricsMock).not.toHaveBeenCalled()
  })
})

// ============================================================================
// buildDailyReportRequest
// ============================================================================

describe('buildDailyReportRequest', () => {
  it('asks for the canonical GA4 metric column set and a date dimension', () => {
    const req = buildDailyReportRequest({ from: '2026-04-25', to: '2026-04-25' })
    expect(req.metrics.map((m) => m.name)).toEqual([...GA4_METRICS_ORDER])
    expect(req.dimensions).toEqual([{ name: 'date' }])
    expect(req.dateRanges).toEqual([
      { startDate: '2026-04-25', endDate: '2026-04-25' },
    ])
  })
})
