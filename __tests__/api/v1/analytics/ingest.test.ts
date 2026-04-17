jest.mock('@/lib/firebase/admin', () => ({
  adminAuth: { verifyIdToken: jest.fn(), verifySessionCookie: jest.fn() },
  adminDb: {
    collection: jest.fn(),
    batch: jest.fn(),
    runTransaction: jest.fn(),
  },
}))
jest.mock('@/lib/analytics/ingest-rate-limit', () => ({
  checkIngestRateLimit: jest.fn().mockResolvedValue(true),
}))

import { POST } from '@/app/api/v1/analytics/ingest/route'
import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { checkIngestRateLimit } from '@/lib/analytics/ingest-rate-limit'

process.env.AI_API_KEY = 'test-key'

const VALID_PROPERTY = {
  id: 'prop-1',
  orgId: 'org-lumen',
  ingestKey: 'a'.repeat(64),
  status: 'active',
  deleted: false,
}

function makeReq(body: object, ingestKey = 'a'.repeat(64)) {
  return new NextRequest('http://localhost/api/v1/analytics/ingest', {
    method: 'POST',
    headers: { 'x-pib-ingest-key': ingestKey, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function mockPropertyLookup(property: object | null) {
  const batchMock = { set: jest.fn(), commit: jest.fn().mockResolvedValue(undefined) }
  ;(adminDb.batch as jest.Mock).mockReturnValue(batchMock)
  ;(adminDb.runTransaction as jest.Mock).mockResolvedValue(undefined)
  ;(adminDb.collection as jest.Mock).mockImplementation((col: string) => {
    if (col === 'properties') {
      return {
        doc: jest.fn().mockReturnValue({
          get: jest.fn().mockResolvedValue(
            property
              ? { exists: true, data: () => property, id: (property as any).id }
              : { exists: false, data: () => null }
          ),
        }),
      }
    }
    return {
      doc: jest.fn().mockReturnValue({ set: jest.fn(), get: jest.fn() }),
      add: jest.fn().mockResolvedValue({ id: 'evt-1' }),
    }
  })
}

const validEvent = {
  event: 'test_started',
  distinctId: 'anon_abc',
  sessionId: 'sess_xyz',
  properties: { passageId: 'focus' },
  timestamp: '2026-04-17T10:00:00.000Z',
}

describe('POST /api/v1/analytics/ingest', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 401 when x-pib-ingest-key header is missing', async () => {
    const req = new NextRequest('http://localhost/api/v1/analytics/ingest', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ propertyId: 'prop-1', events: [validEvent] }),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 401 when property not found', async () => {
    mockPropertyLookup(null)
    const res = await POST(makeReq({ propertyId: 'bad-id', events: [validEvent] }))
    expect(res.status).toBe(401)
  })

  it('returns 401 when ingest key does not match property', async () => {
    mockPropertyLookup(VALID_PROPERTY)
    const res = await POST(makeReq({ propertyId: 'prop-1', events: [validEvent] }, 'b'.repeat(64)))
    expect(res.status).toBe(401)
  })

  it('returns 429 when rate limited', async () => {
    mockPropertyLookup(VALID_PROPERTY)
    ;(checkIngestRateLimit as jest.Mock).mockResolvedValueOnce(false)
    const res = await POST(makeReq({ propertyId: 'prop-1', events: [validEvent] }))
    expect(res.status).toBe(429)
  })

  it('accepts valid batch and returns accepted count', async () => {
    mockPropertyLookup(VALID_PROPERTY)
    const res = await POST(makeReq({ propertyId: 'prop-1', events: [validEvent] }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.accepted).toBe(1)
    expect(body.rejected).toBe(0)
  })

  it('rejects events missing required fields', async () => {
    mockPropertyLookup(VALID_PROPERTY)
    const badEvent = { event: '', distinctId: '', sessionId: '' }
    const res = await POST(makeReq({ propertyId: 'prop-1', events: [badEvent] }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.rejected).toBeGreaterThan(0)
  })

  it('rejects batches over 50 events with 400', async () => {
    mockPropertyLookup(VALID_PROPERTY)
    const events = Array(51).fill(validEvent)
    const res = await POST(makeReq({ propertyId: 'prop-1', events }))
    expect(res.status).toBe(400)
  })
})
