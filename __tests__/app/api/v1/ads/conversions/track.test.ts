// __tests__/app/api/v1/ads/conversions/track.test.ts
import { POST } from '@/app/api/v1/ads/conversions/track/route'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// jest.mock factories run before variable declarations (hoisting), so we keep
// the mock objects inside requireMock and access them after setup.

jest.mock('@/lib/firebase/admin', () => {
  const mockDocGet = jest.fn()
  const mockDoc = jest.fn(() => ({ get: mockDocGet }))
  const mockCollection = jest.fn(() => ({ doc: mockDoc }))
  return { adminDb: { collection: mockCollection, _mockDocGet: mockDocGet, _mockDoc: mockDoc, _mockCollection: mockCollection } }
})

jest.mock('@/lib/ads/capi/track', () => ({
  trackConversion: jest.fn(),
}))

// Grab references after mocks are registered
const adminMock = jest.requireMock('@/lib/firebase/admin') as {
  adminDb: {
    collection: jest.Mock
    _mockDocGet: jest.Mock
    _mockDoc: jest.Mock
    _mockCollection: jest.Mock
  }
}
const mockDocGet = adminMock.adminDb._mockDocGet
const mockDoc = adminMock.adminDb._mockDoc
const mockCollection = adminMock.adminDb._mockCollection

const { trackConversion } = jest.requireMock('@/lib/ads/capi/track') as {
  trackConversion: jest.Mock
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PROPERTY_ID = 'prop_abc123'
const INGEST_KEY = 'ik_secret'
const ORG_ID = 'org_xyz'

function makeRequest(opts: {
  headers?: Record<string, string>
  body?: unknown
}): Request {
  return new Request('http://localhost/api/v1/ads/conversions/track', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...opts.headers },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  }) as unknown as Request
}

const validBody = {
  event_id: 'evt_001',
  event_name: 'Purchase',
  event_time: 1716000000,
  user: { email: 'test@example.com' },
  action_source: 'website',
}

const validHeaders = {
  'x-property-id': PROPERTY_ID,
  'x-ingest-key': INGEST_KEY,
}

function mockPropertyFound(overrides: Record<string, unknown> = {}) {
  mockDocGet.mockResolvedValueOnce({
    exists: true,
    data: () => ({ orgId: ORG_ID, ingestKey: INGEST_KEY, ...overrides }),
  })
}

function mockPropertyNotFound() {
  mockDocGet.mockResolvedValueOnce({ exists: false, data: () => null })
}

beforeEach(() => {
  jest.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/v1/ads/conversions/track', () => {
  it('happy path: valid headers + body → trackConversion called with property orgId', async () => {
    mockPropertyFound()
    const fanout = { meta: { status: 'sent', sentAt: {} } }
    ;(trackConversion as jest.Mock).mockResolvedValueOnce({
      event_id: 'evt_001',
      alreadyProcessed: false,
      fanout,
    })

    const res = await POST(makeRequest({ headers: validHeaders, body: validBody }) as any)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data.event_id).toBe('evt_001')
    expect(json.data.alreadyProcessed).toBe(false)
    expect(json.data.fanout).toEqual(fanout)

    expect(trackConversion).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: ORG_ID, input: expect.objectContaining({ event_id: 'evt_001' }) }),
    )

    // Verify correct property was looked up
    expect(mockCollection).toHaveBeenCalledWith('properties')
    expect(mockDoc).toHaveBeenCalledWith(PROPERTY_ID)
  })

  it('400 when X-Property-Id or X-Ingest-Key headers are missing', async () => {
    // Missing both
    const res1 = await POST(makeRequest({ headers: {}, body: validBody }) as any)
    expect(res1.status).toBe(400)
    const j1 = await res1.json()
    expect(j1.error).toMatch(/X-Property-Id and X-Ingest-Key/i)

    // Missing only X-Ingest-Key
    const res2 = await POST(
      makeRequest({ headers: { 'x-property-id': PROPERTY_ID }, body: validBody }) as any,
    )
    expect(res2.status).toBe(400)

    // Missing only X-Property-Id
    const res3 = await POST(
      makeRequest({ headers: { 'x-ingest-key': INGEST_KEY }, body: validBody }) as any,
    )
    expect(res3.status).toBe(400)

    // trackConversion must not have been called
    expect(trackConversion).not.toHaveBeenCalled()
  })

  it('401 when ingestKey does not match property record', async () => {
    // Property exists but wrong key stored
    mockDocGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ orgId: ORG_ID, ingestKey: 'different_key' }),
    })

    const res = await POST(makeRequest({ headers: validHeaders, body: validBody }) as any)
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.error).toMatch(/invalid ingest key/i)
    expect(trackConversion).not.toHaveBeenCalled()
  })

  it('404 when property does not exist', async () => {
    mockPropertyNotFound()

    const res = await POST(makeRequest({ headers: validHeaders, body: validBody }) as any)
    expect(res.status).toBe(404)
    const json = await res.json()
    expect(json.error).toMatch(/property not found/i)
    expect(trackConversion).not.toHaveBeenCalled()
  })

  it('400 when required body field event_id is missing', async () => {
    mockPropertyFound()

    const { event_id: _omit, ...bodyWithoutEventId } = validBody
    const res = await POST(
      makeRequest({ headers: validHeaders, body: bodyWithoutEventId }) as any,
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/event_id/i)
    expect(trackConversion).not.toHaveBeenCalled()
  })
})
