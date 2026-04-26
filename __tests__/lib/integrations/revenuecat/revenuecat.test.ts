// 64-char hex master key for tests (matches the production format)
process.env.SOCIAL_TOKEN_MASTER_KEY =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

// Mock writeMetrics + connections + admin db so nothing touches Firestore.
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
    id: 'revenuecat',
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

jest.mock('@/lib/firebase/admin', () => ({
  __esModule: true,
  adminDb: {
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn(async () => ({
          exists: false,
          data: () => undefined,
        })),
      })),
    })),
  },
}))

import crypto from 'crypto'
import {
  createRevenueCatClient,
  RevenueCatApiError,
} from '@/lib/integrations/revenuecat/client'
import {
  pullDaily,
  yesterdayInTimezone,
} from '@/lib/integrations/revenuecat/pull-daily'
import {
  handleWebhook,
  verifyRevenueCatSignature,
  eventToMetricRows,
  PROPERTY_ID_HEADER,
} from '@/lib/integrations/revenuecat/webhook'
import revenueCatAdapter from '@/lib/integrations/revenuecat'
import { encryptCredentials } from '@/lib/integrations/crypto'
import { writeMetrics } from '@/lib/metrics/write'
import { getConnection } from '@/lib/integrations/connections'
import type { Connection } from '@/lib/integrations/types'

const writeMetricsMock = writeMetrics as jest.MockedFunction<typeof writeMetrics>
const getConnectionMock = getConnection as jest.MockedFunction<typeof getConnection>

// ---- helpers ---------------------------------------------------------------

function makeConnection(overrides: Partial<Connection> = {}): Connection {
  const credentialsEnc = encryptCredentials(
    { apiKey: 'sk_test_123', projectId: 'proj_abc' },
    'org_test',
  )
  return {
    id: 'revenuecat',
    provider: 'revenuecat',
    propertyId: 'prop_1',
    orgId: 'org_test',
    authKind: 'api_key',
    status: 'connected',
    credentialsEnc,
    meta: { projectId: 'proj_abc', appId: 'app_xyz', webhookSecret: 'whsec_test' },
    scope: [],
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

beforeEach(() => {
  jest.clearAllMocks()
  writeMetricsMock.mockImplementation(async (rows) => ({ written: rows.length }))
})

afterEach(() => {
  jest.restoreAllMocks()
})

// ============================================================================
// Adapter shape
// ============================================================================

describe('RevenueCat adapter shape', () => {
  it('declares provider, authKind, and required hooks', () => {
    expect(revenueCatAdapter.provider).toBe('revenuecat')
    expect(revenueCatAdapter.authKind).toBe('api_key')
    expect(typeof revenueCatAdapter.pullDaily).toBe('function')
    expect(typeof revenueCatAdapter.handleWebhook).toBe('function')
    expect(typeof revenueCatAdapter.saveCredentials).toBe('function')
    expect(revenueCatAdapter.display.name).toBe('RevenueCat')
  })
})

// ============================================================================
// REST client
// ============================================================================

describe('createRevenueCatClient', () => {
  it('issues GET /v2/projects/:id/metrics with bearer auth and date params', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse({ items: [{ id: 'mrr', value: 1234, unit: 'USD' }] }),
    )

    const client = createRevenueCatClient({ apiKey: 'sk_test_xyz' })
    const out = await client.getProjectMetrics({
      projectId: 'proj_abc',
      startDate: '2026-04-25',
      endDate: '2026-04-25',
    })

    expect(out.items?.[0].value).toBe(1234)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/v2/projects/proj_abc/metrics')
    expect(String(url)).toContain('start_date=2026-04-25')
    expect(String(url)).toContain('end_date=2026-04-25')
    const headers = (init as RequestInit).headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer sk_test_xyz')
  })

  it('throws RevenueCatApiError with status on non-2xx', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('forbidden', { status: 403 }))

    const client = createRevenueCatClient({ apiKey: 'sk' })
    await expect(client.getProjectMetrics({ projectId: 'p' })).rejects.toMatchObject({
      name: 'RevenueCatApiError',
      status: 403,
    })
  })
})

// ============================================================================
// yesterdayInTimezone
// ============================================================================

describe('yesterdayInTimezone', () => {
  it('returns the previous YYYY-MM-DD in UTC by default', () => {
    const out = yesterdayInTimezone(new Date('2026-04-26T05:00:00Z'))
    expect(out).toBe('2026-04-25')
  })

  it('uses the property timezone when provided', () => {
    // 2026-04-26T01:30 in Pacific/Auckland is 2026-04-25T13:30Z, which means
    // "yesterday" in Auckland (relative to UTC noon) is 2026-04-25.
    const out = yesterdayInTimezone(
      new Date('2026-04-26T00:30:00Z'),
      'Pacific/Auckland',
    )
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('falls back to UTC when timezone is invalid', () => {
    const out = yesterdayInTimezone(new Date('2026-04-26T05:00:00Z'), 'Not/A/TZ')
    expect(out).toBe('2026-04-25')
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
    expect(result.notes?.[0]).toMatch(/No RevenueCat credentials/i)
    expect(writeMetricsMock).not.toHaveBeenCalled()
  })

  it('returns 0 written and a note when projectId cannot be resolved', async () => {
    const conn = makeConnection({
      meta: {},
      credentialsEnc: encryptCredentials({ apiKey: 'sk_x' }, 'org_test'),
    })
    const result = await pullDaily({ connection: conn })
    expect(result.metricsWritten).toBe(0)
    expect(result.notes?.[0]).toMatch(/projectId/i)
    expect(writeMetricsMock).not.toHaveBeenCalled()
  })

  it('writes mapped metrics, synthesises ARR from MRR, and sets currency', async () => {
    const fakeClient = {
      getProjectMetrics: jest.fn(async () => ({
        items: [
          { id: 'mrr', value: 100, unit: 'USD' },
          { id: 'active_subscriptions', value: 42 },
          { id: 'new_subscriptions', value: 7 },
          { id: 'trials_started', value: 3 },
          { id: 'trials_converted', value: 2 },
          { id: 'churn', value: 1 },
          { id: 'revenue', value: 25.5, unit: 'USD' },
        ],
      })),
      getSubscriber: jest.fn(),
      request: jest.fn(),
    }

    const conn = makeConnection()
    const result = await pullDaily(
      { connection: conn },
      { client: fakeClient, now: new Date('2026-04-26T05:00:00Z') },
    )

    expect(fakeClient.getProjectMetrics).toHaveBeenCalledWith({
      projectId: 'proj_abc',
      startDate: '2026-04-25',
      endDate: '2026-04-25',
    })
    expect(result.metricsWritten).toBeGreaterThan(0)
    expect(writeMetricsMock).toHaveBeenCalledTimes(1)

    const rows = writeMetricsMock.mock.calls[0][0]
    const kinds = rows.map((r) => r.metric).sort()
    expect(kinds).toEqual(
      [
        'active_subs',
        'arr', // synthesised
        'churn',
        'mrr',
        'new_subs',
        'subscription_revenue',
        'trials_converted',
        'trials_started',
      ].sort(),
    )

    const mrr = rows.find((r) => r.metric === 'mrr')!
    expect(mrr.value).toBe(100)
    expect(mrr.currency).toBe('USD')
    expect(mrr.dimension).toBe('app')
    expect(mrr.dimensionValue).toBe('app_xyz')
    expect(mrr.date).toBe('2026-04-25')
    expect(mrr.source).toBe('revenuecat')

    const arr = rows.find((r) => r.metric === 'arr')!
    expect(arr.value).toBe(1200) // 12 × MRR
    expect(arr.currency).toBe('USD')

    const active = rows.find((r) => r.metric === 'active_subs')!
    expect(active.currency).toBeNull() // counts are currency-less
  })

  it('does NOT synthesise ARR when RevenueCat already returned it', async () => {
    const fakeClient = {
      getProjectMetrics: jest.fn(async () => ({
        items: [
          { id: 'mrr', value: 100, unit: 'USD' },
          { id: 'arr', value: 999, unit: 'USD' },
        ],
      })),
      getSubscriber: jest.fn(),
      request: jest.fn(),
    }

    const conn = makeConnection()
    await pullDaily(
      { connection: conn },
      { client: fakeClient, now: new Date('2026-04-26T05:00:00Z') },
    )

    const rows = writeMetricsMock.mock.calls[0][0]
    const arr = rows.filter((r) => r.metric === 'arr')
    expect(arr).toHaveLength(1)
    expect(arr[0].value).toBe(999) // upstream value, not synthesised
  })

  it('soft-fails on RevenueCat 4xx and writes nothing', async () => {
    const fakeClient = {
      getProjectMetrics: jest.fn(async () => {
        throw new RevenueCatApiError(403, 'forbidden', 'no perms')
      }),
      getSubscriber: jest.fn(),
      request: jest.fn(),
    }

    const conn = makeConnection()
    const result = await pullDaily({ connection: conn }, { client: fakeClient })

    expect(result.metricsWritten).toBe(0)
    expect(result.notes?.[0]).toMatch(/403/)
    expect(writeMetricsMock).not.toHaveBeenCalled()
  })

  it('throws on RevenueCat 5xx so the dispatcher records a failure', async () => {
    const fakeClient = {
      getProjectMetrics: jest.fn(async () => {
        throw new RevenueCatApiError(500, 'oops', '')
      }),
      getSubscriber: jest.fn(),
      request: jest.fn(),
    }

    const conn = makeConnection()
    await expect(
      pullDaily({ connection: conn }, { client: fakeClient }),
    ).rejects.toMatchObject({ status: 500 })
  })

  it('respects an explicit window override', async () => {
    const fakeClient = {
      getProjectMetrics: jest.fn(async () => ({ items: [{ id: 'mrr', value: 50, unit: 'USD' }] })),
      getSubscriber: jest.fn(),
      request: jest.fn(),
    }
    const conn = makeConnection()
    const result = await pullDaily(
      { connection: conn, window: { from: '2026-04-01', to: '2026-04-01' } },
      { client: fakeClient, now: new Date('2026-04-26T05:00:00Z') },
    )
    expect(result.from).toBe('2026-04-01')
    expect(result.to).toBe('2026-04-01')
    expect(fakeClient.getProjectMetrics).toHaveBeenCalledWith({
      projectId: 'proj_abc',
      startDate: '2026-04-01',
      endDate: '2026-04-01',
    })
  })
})

// ============================================================================
// Webhook signature verification
// ============================================================================

describe('verifyRevenueCatSignature', () => {
  const body = JSON.stringify({ event: { type: 'INITIAL_PURCHASE' } })
  const secret = 'whsec_correct'

  it('accepts a matching X-RevenueCat-Signature HMAC hex digest', () => {
    const sig = crypto.createHmac('sha256', secret).update(body).digest('hex')
    const ok = verifyRevenueCatSignature({
      rawBody: body,
      headers: { 'x-revenuecat-signature': sig },
      secret,
    })
    expect(ok).toBe(true)
  })

  it('accepts a sha256= prefixed signature', () => {
    const sig = crypto.createHmac('sha256', secret).update(body).digest('hex')
    expect(
      verifyRevenueCatSignature({
        rawBody: body,
        headers: { 'x-revenuecat-signature': `sha256=${sig}` },
        secret,
      }),
    ).toBe(true)
  })

  it('rejects a forged signature', () => {
    expect(
      verifyRevenueCatSignature({
        rawBody: body,
        headers: { 'x-revenuecat-signature': 'deadbeef' },
        secret,
      }),
    ).toBe(false)
  })

  it('rejects when no signature header is present and no Bearer match', () => {
    expect(
      verifyRevenueCatSignature({
        rawBody: body,
        headers: {},
        secret,
      }),
    ).toBe(false)
  })

  it('accepts a Bearer authorization header that matches the secret', () => {
    expect(
      verifyRevenueCatSignature({
        rawBody: body,
        headers: { authorization: `Bearer ${secret}` },
        secret,
      }),
    ).toBe(true)
  })
})

// ============================================================================
// eventToMetricRows
// ============================================================================

describe('eventToMetricRows', () => {
  const conn = makeConnection()

  it('writes subscription_revenue from INITIAL_PURCHASE.transaction.price', () => {
    const rows = eventToMetricRows({
      connection: conn,
      event: {
        type: 'INITIAL_PURCHASE',
        transaction: { price: 9.99, currency: 'USD' },
      },
      fallbackCurrency: 'USD',
      date: '2026-04-25',
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].metric).toBe('subscription_revenue')
    expect(rows[0].value).toBe(9.99)
    expect(rows[0].currency).toBe('USD')
  })

  it('writes subscription_revenue from RENEWAL with top-level price + currency', () => {
    const rows = eventToMetricRows({
      connection: conn,
      event: { type: 'RENEWAL', price: 4.99, currency: 'EUR' },
      fallbackCurrency: 'USD',
      date: '2026-04-25',
    })
    expect(rows[0].currency).toBe('EUR')
    expect(rows[0].value).toBe(4.99)
  })

  it('falls back to property currency when event currency is missing', () => {
    const rows = eventToMetricRows({
      connection: conn,
      event: { type: 'RENEWAL', price: 1 },
      fallbackCurrency: 'ZAR',
      date: '2026-04-25',
    })
    expect(rows[0].currency).toBe('ZAR')
  })

  it('emits churn=1 for CANCELLATION', () => {
    const rows = eventToMetricRows({
      connection: conn,
      event: { type: 'CANCELLATION' },
      fallbackCurrency: 'USD',
      date: '2026-04-25',
    })
    expect(rows[0].metric).toBe('churn')
    expect(rows[0].value).toBe(1)
    expect(rows[0].currency).toBeNull()
  })

  it('emits churn=1 for EXPIRATION', () => {
    const rows = eventToMetricRows({
      connection: conn,
      event: { type: 'EXPIRATION' },
      fallbackCurrency: 'USD',
      date: '2026-04-25',
    })
    expect(rows[0].metric).toBe('churn')
  })

  it('does NOT emit churn for BILLING_ISSUE', () => {
    const rows = eventToMetricRows({
      connection: conn,
      event: { type: 'BILLING_ISSUE' },
      fallbackCurrency: 'USD',
      date: '2026-04-25',
    })
    expect(rows).toHaveLength(0)
  })

  it('emits no rows for INITIAL_PURCHASE with zero/missing price', () => {
    const rows = eventToMetricRows({
      connection: conn,
      event: { type: 'INITIAL_PURCHASE' },
      fallbackCurrency: 'USD',
      date: '2026-04-25',
    })
    expect(rows).toHaveLength(0)
  })
})

// ============================================================================
// handleWebhook (integration)
// ============================================================================

describe('handleWebhook', () => {
  const secret = 'whsec_test'
  const conn = makeConnection()

  function signedHeaders(body: string): Record<string, string> {
    const sig = crypto.createHmac('sha256', secret).update(body).digest('hex')
    return {
      [PROPERTY_ID_HEADER]: conn.propertyId,
      'x-revenuecat-signature': sig,
    }
  }

  it('returns 400 when propertyId header is missing', async () => {
    const out = await handleWebhook({
      rawBody: '{}',
      headers: {},
    })
    expect(out.status).toBe(400)
    expect(out.metricsWritten).toBe(0)
  })

  it('returns 404 when no connection exists for the property', async () => {
    getConnectionMock.mockResolvedValue(null)
    const body = JSON.stringify({ event: { type: 'INITIAL_PURCHASE' } })
    const out = await handleWebhook(
      { rawBody: body, headers: { [PROPERTY_ID_HEADER]: 'prop_missing' } },
      { loadConnection: async () => null },
    )
    expect(out.status).toBe(404)
  })

  it('returns 401 when the signature does not match', async () => {
    const body = JSON.stringify({ event: { type: 'INITIAL_PURCHASE' } })
    const out = await handleWebhook(
      {
        rawBody: body,
        headers: {
          [PROPERTY_ID_HEADER]: conn.propertyId,
          'x-revenuecat-signature': 'wrongsig',
        },
      },
      { loadConnection: async () => conn, loadCurrency: async () => 'USD' },
    )
    expect(out.status).toBe(401)
  })

  it('writes a subscription_revenue metric on a valid INITIAL_PURCHASE', async () => {
    const body = JSON.stringify({
      event: {
        type: 'INITIAL_PURCHASE',
        event_timestamp_ms: Date.parse('2026-04-25T12:00:00Z'),
        transaction: { price: 19.99, currency: 'USD' },
      },
    })
    const out = await handleWebhook(
      { rawBody: body, headers: signedHeaders(body) },
      { loadConnection: async () => conn, loadCurrency: async () => 'USD' },
    )
    expect(out.status).toBe(200)
    expect(out.metricsWritten).toBe(1)
    expect(writeMetricsMock).toHaveBeenCalledTimes(1)
    const [rows, options] = writeMetricsMock.mock.calls[0]
    expect(rows[0].metric).toBe('subscription_revenue')
    expect(rows[0].date).toBe('2026-04-25')
    expect(options).toEqual({ ingestedBy: 'webhook' })
  })

  it('writes churn on CANCELLATION', async () => {
    const body = JSON.stringify({
      event: {
        type: 'CANCELLATION',
        event_timestamp_ms: Date.parse('2026-04-25T12:00:00Z'),
      },
    })
    const out = await handleWebhook(
      { rawBody: body, headers: signedHeaders(body) },
      { loadConnection: async () => conn, loadCurrency: async () => 'USD' },
    )
    expect(out.status).toBe(200)
    expect(out.metricsWritten).toBe(1)
    expect(writeMetricsMock.mock.calls[0][0][0].metric).toBe('churn')
  })

  it('returns 200 with 0 written for BILLING_ISSUE (no churn bump)', async () => {
    const body = JSON.stringify({
      event: { type: 'BILLING_ISSUE', event_timestamp_ms: Date.now() },
    })
    const out = await handleWebhook(
      { rawBody: body, headers: signedHeaders(body) },
      { loadConnection: async () => conn, loadCurrency: async () => 'USD' },
    )
    expect(out.status).toBe(200)
    expect(out.metricsWritten).toBe(0)
    expect(writeMetricsMock).not.toHaveBeenCalled()
  })

  it('returns 400 on malformed JSON', async () => {
    const body = '{not-json'
    const out = await handleWebhook(
      { rawBody: body, headers: signedHeaders(body) },
      { loadConnection: async () => conn, loadCurrency: async () => 'USD' },
    )
    expect(out.status).toBe(400)
  })
})

// ============================================================================
// saveCredentials
// ============================================================================

describe('adapter.saveCredentials', () => {
  it('encrypts apiKey, persists projectId/appId/webhookSecret in meta', async () => {
    const out = await revenueCatAdapter.saveCredentials!({
      propertyId: 'prop_1',
      orgId: 'org_test',
      payload: {
        apiKey: ' sk_secret ',
        projectId: 'proj_z',
        appId: 'app_z',
        webhookSecret: 'whsec_z',
      },
    })
    expect(out.id).toBe('revenuecat')
    const upsert = jest.requireMock('@/lib/integrations/connections')
      .upsertConnection as jest.Mock
    expect(upsert).toHaveBeenCalledTimes(1)
    const arg = upsert.mock.calls[0][0]
    expect(arg.provider).toBe('revenuecat')
    expect(arg.authKind).toBe('api_key')
    expect(arg.credentials).toEqual({ apiKey: 'sk_secret', projectId: 'proj_z' })
    expect(arg.meta).toMatchObject({
      projectId: 'proj_z',
      appId: 'app_z',
      webhookSecret: 'whsec_z',
    })
  })

  it('rejects when apiKey is empty', async () => {
    await expect(
      revenueCatAdapter.saveCredentials!({
        propertyId: 'prop_1',
        orgId: 'org_test',
        payload: { apiKey: '' },
      }),
    ).rejects.toThrow(/apiKey/i)
  })
})
