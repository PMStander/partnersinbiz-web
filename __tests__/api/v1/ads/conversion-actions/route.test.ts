// __tests__/api/v1/ads/conversion-actions/route.test.ts
// Tests for GET + POST /api/v1/ads/conversion-actions
// Sub-3a Phase 6 Batch 3 E

import { GET, POST } from '@/app/api/v1/ads/conversion-actions/route'

// ─── Auth bypass ──────────────────────────────────────────────────────────────
jest.mock('@/lib/api/auth', () => ({ withAuth: (_r: string, h: any) => h }))

// ─── Store mocks ──────────────────────────────────────────────────────────────
const mockListConversionActions = jest.fn()
const mockCreateCanonical = jest.fn()

jest.mock('@/lib/ads/conversion-actions/store', () => ({
  listConversionActions: (...args: unknown[]) => mockListConversionActions(...args),
  createConversionAction: (...args: unknown[]) => mockCreateCanonical(...args),
}))

// ─── Google connections mock ──────────────────────────────────────────────────
const mockGetConnection = jest.fn()
const mockDecryptAccessToken = jest.fn()
const mockReadDeveloperToken = jest.fn()
const mockCreateOnGoogle = jest.fn()

jest.mock('@/lib/ads/connections/store', () => ({
  getConnection: (...args: unknown[]) => mockGetConnection(...args),
  decryptAccessToken: (...args: unknown[]) => mockDecryptAccessToken(...args),
}))
jest.mock('@/lib/integrations/google_ads/oauth', () => ({
  readDeveloperToken: () => mockReadDeveloperToken(),
}))
jest.mock('@/lib/ads/providers/google/conversions', () => ({
  createConversionAction: (...args: unknown[]) => mockCreateOnGoogle(...args),
}))

// ─── Fixtures ─────────────────────────────────────────────────────────────────
const ORG = 'org-test-001'

const fakeAction = {
  id: 'ca-001',
  orgId: ORG,
  platform: 'google',
  name: 'Purchase',
  category: 'PURCHASE',
  countingType: 'ONE_PER_CLICK',
  valueSettings: {},
  createdAt: { seconds: 1000 },
  updatedAt: { seconds: 1000 },
}

const fakeConn = {
  defaultAdAccountId: '1234567890',
  meta: { google: { loginCustomerId: '9999999' } },
  accessTokenEnc: { iv: 'x', ciphertext: 'y', tag: 'z' },
}

function makeReq(method: string, body?: object, params?: Record<string, string>) {
  const url = new URL(`http://test.local/api/v1/ads/conversion-actions${params ? '?' + new URLSearchParams(params).toString() : ''}`)
  return new Request(url.toString(), {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Org-Id': ORG },
    body: body ? JSON.stringify(body) : undefined,
  }) as any
}

beforeEach(() => {
  jest.clearAllMocks()
  mockListConversionActions.mockResolvedValue([fakeAction])
  mockCreateCanonical.mockResolvedValue(fakeAction)
  mockGetConnection.mockResolvedValue(fakeConn)
  mockDecryptAccessToken.mockReturnValue('access-token')
  mockReadDeveloperToken.mockReturnValue('dev-token')
  mockCreateOnGoogle.mockResolvedValue({ resourceName: 'customers/123/conversionActions/456', id: '456' })
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/v1/ads/conversion-actions', () => {
  it('returns 400 when X-Org-Id is missing', async () => {
    const req = new Request('http://test.local/api/v1/ads/conversion-actions', { method: 'GET' }) as any
    const res = await GET(req)
    expect(res.status).toBe(400)
  })

  it('lists actions with no filters', async () => {
    const res = await GET(makeReq('GET'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.actions).toHaveLength(1)
    expect(mockListConversionActions).toHaveBeenCalledWith({ orgId: ORG, platform: undefined, category: undefined })
  })

  it('passes platform filter to store', async () => {
    mockListConversionActions.mockResolvedValue([])
    const res = await GET(makeReq('GET', undefined, { platform: 'google' }))
    expect(res.status).toBe(200)
    expect(mockListConversionActions).toHaveBeenCalledWith(expect.objectContaining({ platform: 'google' }))
  })

  it('ignores unknown platform values', async () => {
    mockListConversionActions.mockResolvedValue([])
    const res = await GET(makeReq('GET', undefined, { platform: 'tiktok' }))
    expect(res.status).toBe(200)
    expect(mockListConversionActions).toHaveBeenCalledWith(expect.objectContaining({ platform: undefined }))
  })
})

describe('POST /api/v1/ads/conversion-actions', () => {
  it('returns 400 for invalid platform', async () => {
    const res = await POST(makeReq('POST', { platform: 'linkedin', name: 'X', category: 'PURCHASE', countingType: 'ONE_PER_CLICK' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/platform/i)
  })

  it('returns 400 when name is missing', async () => {
    const res = await POST(makeReq('POST', { platform: 'meta', category: 'PURCHASE', countingType: 'ONE_PER_CLICK' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/name/i)
  })

  it('returns 400 for invalid category', async () => {
    const res = await POST(makeReq('POST', { platform: 'meta', name: 'X', category: 'INVALID_CAT', countingType: 'ONE_PER_CLICK' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/category/i)
  })

  it('returns 400 for invalid countingType', async () => {
    const res = await POST(makeReq('POST', { platform: 'meta', name: 'X', category: 'PURCHASE', countingType: 'BAD' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/countingType/i)
  })

  it('creates a Meta action without hitting Google API', async () => {
    const res = await POST(makeReq('POST', {
      platform: 'meta',
      name: 'Lead',
      category: 'LEAD',
      countingType: 'ONE_PER_CLICK',
      pixelId: 'px-999',
      customEventType: 'Lead',
    }))
    expect(res.status).toBe(201)
    expect(mockCreateOnGoogle).not.toHaveBeenCalled()
    expect(mockCreateCanonical).toHaveBeenCalledWith(
      expect.objectContaining({ platform: 'meta', name: 'Lead' }),
    )
  })

  it('creates a Google action — calls Google API then persists canonical', async () => {
    const res = await POST(makeReq('POST', {
      platform: 'google',
      name: 'Purchase',
      category: 'PURCHASE',
      countingType: 'ONE_PER_CLICK',
    }))
    expect(res.status).toBe(201)
    expect(mockCreateOnGoogle).toHaveBeenCalledTimes(1)
    const googleCall = mockCreateOnGoogle.mock.calls[0][0]
    expect(googleCall.customerId).toBe('1234567890')
    expect(googleCall.loginCustomerId).toBe('9999999')
    expect(googleCall.accessToken).toBe('access-token')
    expect(googleCall.developerToken).toBe('dev-token')

    // Canonical doc should have providerData.google.conversionActionResourceName set
    const canonicalCall = mockCreateCanonical.mock.calls[0][0]
    expect(canonicalCall.providerData?.google?.conversionActionResourceName).toBe('customers/123/conversionActions/456')
  })

  it('returns 400 when no Google connection found', async () => {
    mockGetConnection.mockResolvedValue(null)
    const res = await POST(makeReq('POST', {
      platform: 'google', name: 'X', category: 'PURCHASE', countingType: 'ONE_PER_CLICK',
    }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/connection/i)
  })

  it('returns 502 when Google API call fails', async () => {
    mockCreateOnGoogle.mockRejectedValue(new Error('Google quota exceeded'))
    const res = await POST(makeReq('POST', {
      platform: 'google', name: 'X', category: 'PURCHASE', countingType: 'ONE_PER_CLICK',
    }))
    expect(res.status).toBe(502)
    expect((await res.json()).error).toContain('Google quota exceeded')
    // Canonical doc must NOT be persisted on Google API failure
    expect(mockCreateCanonical).not.toHaveBeenCalled()
  })
})
