// 64-char hex master key for tests (matches the production format)
process.env.SOCIAL_TOKEN_MASTER_KEY =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

import crypto from 'crypto'
import zlib from 'zlib'

// Stub out firebase-admin so importing pull-daily doesn't try to init it.
jest.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: jest.fn().mockReturnValue({
      doc: jest.fn().mockReturnValue({
        get: jest.fn(),
      }),
    }),
  },
  adminAuth: {},
}))

jest.mock('@/lib/fx/rates', () => ({
  convertToZar: jest.fn(async () => null),
}))

import {
  signAscJwt,
  derToJoseEcdsaSignature,
  ASC_JWT_LIFETIME_SECONDS,
} from '@/lib/integrations/app_store_connect/jwt'
import {
  buildSalesReportUrl,
  parseSalesReportTsv,
  fetchSalesReport,
} from '@/lib/integrations/app_store_connect/client'
import {
  isInstallProductType,
  isIapProductType,
  ASC_SALES_HEADERS,
} from '@/lib/integrations/app_store_connect/schema'
import {
  aggregateAscRowsForDate,
  pullDaily,
} from '@/lib/integrations/app_store_connect/pull-daily'
import { encryptCredentials } from '@/lib/integrations/crypto'
import type { Connection } from '@/lib/integrations/types'
import type { Property } from '@/lib/properties/types'

/* ─────────────────────────────────────────────────────────────────────────
 * Test fixtures
 * ───────────────────────────────────────────────────────────────────────── */

// Generate a fresh EC P-256 keypair for JWT tests.
const { privateKey: ecPem, publicKey: ecPub } = crypto.generateKeyPairSync('ec', {
  namedCurve: 'P-256',
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
})

const TWO_ROW_TSV = [
  ASC_SALES_HEADERS.join('\t'),
  // Row 1 — first-time iOS install for our app, no proceeds
  [
    'APPLE', 'AU', 'sku.app', 'Pip', 'Partners in Biz', '1.0',
    '1', '5', '0',
    '04/25/2026', '04/25/2026',
    'USD', 'US', 'USD',
    '1234567890', // Apple Identifier
    '0', '', '', '', '', '', '', 'iPhone', 'iOS', '', '', '', '',
  ].join('\t'),
  // Row 2 — IAP for our app, proceeds in USD
  [
    'APPLE', 'AU', 'sku.iap', 'Pip', 'Partners in Biz', '1.0',
    'IA1', '3', '6.99',
    '04/25/2026', '04/25/2026',
    'USD', 'US', 'USD',
    '1234567890',
    '9.99', '', '', '', '', '', '', 'iPhone', 'iOS', '', '', '', '',
  ].join('\t'),
  // Footer row Apple often appends.
  'Total_Rows: 2',
].join('\n')

/* ─────────────────────────────────────────────────────────────────────────
 * JWT signer
 * ───────────────────────────────────────────────────────────────────────── */

describe('signAscJwt', () => {
  it('throws when keyId/issuerId/privateKey is missing', () => {
    expect(() => signAscJwt({ keyId: '', issuerId: 'i', privateKey: ecPem })).toThrow()
    expect(() => signAscJwt({ keyId: 'k', issuerId: '', privateKey: ecPem })).toThrow()
    expect(() => signAscJwt({ keyId: 'k', issuerId: 'i', privateKey: '' })).toThrow()
  })

  it('produces a 3-segment compact JWS with ES256 header', () => {
    const jwt = signAscJwt({
      keyId: 'X9Y8Z7W6V5',
      issuerId: '57246542-96fe-1a63-e053-0824d011072a',
      privateKey: ecPem,
    })
    const parts = jwt.split('.')
    expect(parts).toHaveLength(3)
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'))
    expect(header.alg).toBe('ES256')
    expect(header.typ).toBe('JWT')
    expect(header.kid).toBe('X9Y8Z7W6V5')

    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    expect(claims.iss).toBe('57246542-96fe-1a63-e053-0824d011072a')
    expect(claims.aud).toBe('appstoreconnect-v1')
    expect(claims.exp - claims.iat).toBe(ASC_JWT_LIFETIME_SECONDS)
  })

  it('signature is verifiable against the matching public key (P1363 / 64 bytes)', () => {
    const jwt = signAscJwt({
      keyId: 'kid',
      issuerId: 'iss',
      privateKey: ecPem,
      lifetimeSeconds: 60,
    })
    const [h, c, s] = jwt.split('.')
    const sig = Buffer.from(s, 'base64url')
    expect(sig.length).toBe(64) // r || s, each 32 bytes
    const ok = crypto.verify(
      'sha256',
      Buffer.from(`${h}.${c}`),
      { key: ecPub, dsaEncoding: 'ieee-p1363' },
      sig,
    )
    expect(ok).toBe(true)
  })
})

describe('derToJoseEcdsaSignature', () => {
  it('strips leading zero padding and left-pads short components', () => {
    // r = 0x01, s = 0x02 — both will become 32-byte buffers.
    const der = Buffer.from([0x30, 0x06, 0x02, 0x01, 0x01, 0x02, 0x01, 0x02])
    const jose = derToJoseEcdsaSignature(der)
    expect(jose.length).toBe(64)
    expect(jose[31]).toBe(0x01)
    expect(jose[63]).toBe(0x02)
  })

  it('throws on a non-SEQUENCE input', () => {
    expect(() => derToJoseEcdsaSignature(Buffer.from([0x00]))).toThrow()
  })
})

/* ─────────────────────────────────────────────────────────────────────────
 * URL builder
 * ───────────────────────────────────────────────────────────────────────── */

describe('buildSalesReportUrl', () => {
  it('uses correct base + filters', () => {
    const url = buildSalesReportUrl({ vendorNumber: '85059', reportDate: '2026-04-25' })
    expect(url.startsWith('https://api.appstoreconnect.apple.com/v1/salesReports?')).toBe(true)
    expect(url).toContain('filter%5Bfrequency%5D=DAILY')
    expect(url).toContain('filter%5BreportSubType%5D=SUMMARY')
    expect(url).toContain('filter%5BreportType%5D=SALES')
    expect(url).toContain('filter%5BvendorNumber%5D=85059')
    expect(url).toContain('filter%5BreportDate%5D=2026-04-25')
  })
})

/* ─────────────────────────────────────────────────────────────────────────
 * TSV parser
 * ───────────────────────────────────────────────────────────────────────── */

describe('parseSalesReportTsv', () => {
  it('returns [] for empty input', () => {
    expect(parseSalesReportTsv('')).toEqual([])
    expect(parseSalesReportTsv('only-header\tnothing')).toEqual([])
  })

  it('parses two real-shape rows and ignores Total_Rows footer', () => {
    const rows = parseSalesReportTsv(TWO_ROW_TSV)
    expect(rows).toHaveLength(2)
    expect(rows[0].productTypeIdentifier).toBe('1')
    expect(rows[0].units).toBe(5)
    expect(rows[0].developerProceeds).toBe(0)
    expect(rows[0].appleIdentifier).toBe('1234567890')
    expect(rows[1].productTypeIdentifier).toBe('IA1')
    expect(rows[1].units).toBe(3)
    expect(rows[1].developerProceeds).toBeCloseTo(6.99, 2)
    expect(rows[1].currencyOfProceeds).toBe('USD')
  })
})

/* ─────────────────────────────────────────────────────────────────────────
 * Product type identifiers
 * ───────────────────────────────────────────────────────────────────────── */

describe('product type classification', () => {
  it('identifies install product types', () => {
    expect(isInstallProductType('1')).toBe(true)
    expect(isInstallProductType('1F')).toBe(true)
    expect(isInstallProductType('IA1')).toBe(false)
    expect(isInstallProductType('1001')).toBe(false)
  })

  it('identifies IAP product types (explicit + IA-prefix)', () => {
    expect(isIapProductType('IA1')).toBe(true)
    expect(isIapProductType('IA1-M')).toBe(true)
    expect(isIapProductType('IAY')).toBe(true)
    expect(isIapProductType('1001')).toBe(true)
    expect(isIapProductType('1003')).toBe(true)
    expect(isIapProductType('1')).toBe(false)
    expect(isIapProductType('1F')).toBe(false)
  })
})

/* ─────────────────────────────────────────────────────────────────────────
 * Aggregation
 * ───────────────────────────────────────────────────────────────────────── */

describe('aggregateAscRowsForDate', () => {
  it('aggregates installs + iap_revenue + revenue across the parsed rows', () => {
    const rows = parseSalesReportTsv(TWO_ROW_TSV)
    const metrics = aggregateAscRowsForDate({
      rows,
      date: '2026-04-25',
      orgId: 'org_a',
      propertyId: 'prop_a',
      appStoreAppId: '1234567890',
      fallbackCurrency: 'USD',
    })
    const installs = metrics.find((m) => m.metric === 'installs')
    const revenue = metrics.find((m) => m.metric === 'revenue')
    const iap = metrics.find((m) => m.metric === 'iap_revenue')

    expect(installs?.value).toBe(5)
    expect(revenue?.value).toBeCloseTo(6.99, 2)
    expect(revenue?.currency).toBe('USD')
    expect(revenue?.dimension).toBe('currency')
    expect(revenue?.dimensionValue).toBe('USD')
    expect(iap?.value).toBeCloseTo(6.99, 2)
    expect(iap?.currency).toBe('USD')
  })

  it('filters by appStoreAppId when set — rows for other apps are excluded', () => {
    const rows = parseSalesReportTsv(TWO_ROW_TSV)
    const metrics = aggregateAscRowsForDate({
      rows,
      date: '2026-04-25',
      orgId: 'org_a',
      propertyId: 'prop_a',
      appStoreAppId: '9999999999', // doesn't match
    })
    const installs = metrics.find((m) => m.metric === 'installs')
    const revenue = metrics.find((m) => m.metric === 'revenue')
    expect(installs?.value).toBe(0)
    expect(revenue).toBeUndefined() // no proceeds rows after filter
  })

  it('emits installs row even when there are zero rows', () => {
    const metrics = aggregateAscRowsForDate({
      rows: [],
      date: '2026-04-25',
      orgId: 'org_a',
      propertyId: 'prop_a',
    })
    expect(metrics).toHaveLength(1)
    expect(metrics[0].metric).toBe('installs')
    expect(metrics[0].value).toBe(0)
  })
})

/* ─────────────────────────────────────────────────────────────────────────
 * pullDaily — full pipeline with mocked fetch + writer.
 * ───────────────────────────────────────────────────────────────────────── */

const TEST_ORG = 'org_a'

function makeConnection(overrides: Partial<Connection> = {}): Connection {
  const credentialsEnc = encryptCredentials(
    { keyId: 'k', issuerId: 'i', privateKey: ecPem },
    TEST_ORG,
  )
  return {
    id: 'app_store_connect',
    provider: 'app_store_connect',
    propertyId: 'prop_a',
    orgId: TEST_ORG,
    authKind: 'jwt',
    status: 'connected',
    credentialsEnc,
    meta: { vendorNumber: '85059' },
    scope: [],
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

function makeProperty(overrides: Partial<Property['config']['revenue']> = {}): Property {
  return {
    id: 'prop_a',
    orgId: TEST_ORG,
    name: 'Test',
    domain: 'test',
    type: 'ios',
    status: 'active',
    config: {
      revenue: {
        timezone: 'UTC',
        currency: 'USD',
        appStoreAppId: '1234567890',
        ...overrides,
      },
    },
    ingestKey: '',
    ingestKeyRotatedAt: null,
    createdAt: null,
    createdBy: 'system',
    createdByType: 'system',
    updatedAt: null,
  }
}

describe('pullDaily — App Store Connect', () => {
  it('returns 0 metrics + a note when credentials are missing', async () => {
    const connection = makeConnection({ credentialsEnc: null })
    const writeImpl = jest.fn(async () => ({ written: 0 }))
    const result = await pullDaily(
      { connection },
      {
        writeMetricsImpl: writeImpl,
        propertyReader: async () => makeProperty(),
        fetchSalesReportImpl: async () => ({ tsv: '', status: 200, notReady: false }),
      },
    )
    expect(result.metricsWritten).toBe(0)
    expect(result.notes?.[0]).toMatch(/Missing App Store Connect credentials/)
    expect(writeImpl).not.toHaveBeenCalled()
  })

  it('returns 0 metrics + a note when vendorNumber is missing', async () => {
    const connection = makeConnection({ meta: {} })
    const writeImpl = jest.fn(async () => ({ written: 0 }))
    const result = await pullDaily(
      { connection },
      {
        writeMetricsImpl: writeImpl,
        propertyReader: async () => makeProperty(),
        fetchSalesReportImpl: async () => ({ tsv: '', status: 200, notReady: false }),
      },
    )
    expect(result.metricsWritten).toBe(0)
    expect(result.notes?.[0]).toMatch(/vendorNumber/)
    expect(writeImpl).not.toHaveBeenCalled()
  })

  it('writes aggregated metrics for the requested window', async () => {
    const connection = makeConnection()
    const writeImpl = jest.fn(async (rows) => ({ written: rows.length }))
    const fetchSalesReportImpl = jest.fn(async () => ({
      tsv: TWO_ROW_TSV,
      status: 200,
      notReady: false,
    }))
    const result = await pullDaily(
      { connection, window: { from: '2026-04-25', to: '2026-04-25' } },
      {
        writeMetricsImpl: writeImpl,
        propertyReader: async () => makeProperty(),
        fetchSalesReportImpl,
      },
    )
    expect(fetchSalesReportImpl).toHaveBeenCalledTimes(1)
    expect(writeImpl).toHaveBeenCalledTimes(1)
    const written = (writeImpl.mock.calls[0] as unknown as [Array<{ metric: string }>])[0]
    const metricKinds = written.map((r) => r.metric).sort()
    expect(metricKinds).toEqual(['iap_revenue', 'installs', 'revenue'])
    expect(result.from).toBe('2026-04-25')
    expect(result.to).toBe('2026-04-25')
    expect(result.metricsWritten).toBe(3)
  })

  it('flags dates that are not yet available (404/notReady) in notes', async () => {
    const connection = makeConnection()
    const writeImpl = jest.fn(async () => ({ written: 0 }))
    const result = await pullDaily(
      { connection, window: { from: '2026-04-25', to: '2026-04-25' } },
      {
        writeMetricsImpl: writeImpl,
        propertyReader: async () => makeProperty(),
        fetchSalesReportImpl: async () => ({ tsv: '', status: 404, notReady: true }),
      },
    )
    expect(result.notes?.some((n) => n.includes('not yet available'))).toBe(true)
  })
})

/* ─────────────────────────────────────────────────────────────────────────
 * fetchSalesReport — verifies headers, gunzip, and 404 handling.
 * ───────────────────────────────────────────────────────────────────────── */

describe('fetchSalesReport', () => {
  it('sends Bearer JWT + Accept: application/a-gzip and gunzips the body', async () => {
    const gz = zlib.gzipSync(Buffer.from(TWO_ROW_TSV, 'utf8'))
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      arrayBuffer: async () => gz.buffer.slice(gz.byteOffset, gz.byteOffset + gz.byteLength),
      text: async () => '',
    })) as unknown as typeof fetch
    const result = await fetchSalesReport({
      credentials: { keyId: 'k', issuerId: 'i', privateKey: ecPem },
      vendorNumber: '85059',
      reportDate: '2026-04-25',
      fetchImpl,
    })
    expect(result.notReady).toBe(false)
    expect(result.tsv).toBe(TWO_ROW_TSV)
    const calls = (fetchImpl as unknown as jest.Mock).mock.calls
    const [, init] = calls[0] as [string, RequestInit]
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toMatch(/^Bearer /)
    expect(headers.Accept).toBe('application/a-gzip')
  })

  it('returns notReady on 404', async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      arrayBuffer: async () => new ArrayBuffer(0),
      text: async () => '',
    })) as unknown as typeof fetch
    const result = await fetchSalesReport({
      credentials: { keyId: 'k', issuerId: 'i', privateKey: ecPem },
      vendorNumber: '85059',
      reportDate: '2026-04-25',
      fetchImpl,
    })
    expect(result.notReady).toBe(true)
    expect(result.tsv).toBe('')
  })

  it('throws on non-2xx, non-404 errors', async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      arrayBuffer: async () => new ArrayBuffer(0),
      text: async () => 'invalid token',
    })) as unknown as typeof fetch
    await expect(
      fetchSalesReport({
        credentials: { keyId: 'k', issuerId: 'i', privateKey: ecPem },
        vendorNumber: '85059',
        reportDate: '2026-04-25',
        fetchImpl,
      }),
    ).rejects.toThrow(/401/)
  })
})
