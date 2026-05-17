// __tests__/api/v1/ads/conversions/upload.test.ts
// Tests for POST /api/v1/ads/conversions/upload (cross-platform entry point)
// Sub-3a Phase 6 Batch 3 E

import { POST } from '@/app/api/v1/ads/conversions/upload/route'

// ─── Auth bypass ──────────────────────────────────────────────────────────────
jest.mock('@/lib/api/auth', () => ({ withAuth: (_r: string, h: any) => h }))

// ─── trackConversion mock ─────────────────────────────────────────────────────
const mockTrackConversion = jest.fn()

jest.mock('@/lib/ads/conversions/track', () => ({
  trackConversion: (...args: unknown[]) => mockTrackConversion(...args),
}))

// ─── Fixtures ─────────────────────────────────────────────────────────────────
const ORG = 'org-upload-001'

const validBody = {
  conversionActionId: 'ca-001',
  eventId: 'evt-abc-123',
  eventTime: '2026-05-17T10:00:00.000Z',
  value: 199.99,
  currency: 'ZAR',
  user: { email: 'test@example.com', firstName: 'Jane' },
  gclid: 'abc123gclid',
}

function makeReq(body: object, extraHeaders?: Record<string, string>) {
  return new Request('http://test.local/api/v1/ads/conversions/upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Org-Id': ORG,
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  }) as any
}

beforeEach(() => {
  jest.clearAllMocks()
  mockTrackConversion.mockResolvedValue({ google: 'sent' })
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/v1/ads/conversions/upload', () => {
  it('returns 400 when X-Org-Id header is missing', async () => {
    const req = new Request('http://test.local/api/v1/ads/conversions/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody),
    }) as any
    const res = await POST(req)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/X-Org-Id/i)
  })

  it('returns 400 when conversionActionId is missing', async () => {
    const { conversionActionId: _, ...rest } = validBody
    const res = await POST(makeReq(rest))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/conversionActionId/i)
  })

  it('returns 400 when eventId is missing', async () => {
    const { eventId: _, ...rest } = validBody
    const res = await POST(makeReq(rest))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/eventId/i)
  })

  it('returns 400 when eventTime is missing', async () => {
    const { eventTime: _, ...rest } = validBody
    const res = await POST(makeReq(rest))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/eventTime/i)
  })

  it('returns 400 when eventTime is an invalid date string', async () => {
    const res = await POST(makeReq({ ...validBody, eventTime: 'not-a-date' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/eventTime/i)
  })

  it('calls trackConversion with correct arguments and returns result', async () => {
    mockTrackConversion.mockResolvedValue({ google: 'sent', meta: 'skipped' })
    const res = await POST(makeReq(validBody))
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.result).toEqual({ google: 'sent', meta: 'skipped' })

    expect(mockTrackConversion).toHaveBeenCalledTimes(1)
    const call = mockTrackConversion.mock.calls[0][0]
    expect(call.orgId).toBe(ORG)
    expect(call.conversionActionId).toBe('ca-001')
    expect(call.eventId).toBe('evt-abc-123')
    expect(call.eventTime).toBeInstanceOf(Date)
    expect(call.value).toBe(199.99)
    expect(call.currency).toBe('ZAR')
    expect(call.gclid).toBe('abc123gclid')
    expect(call.user).toEqual({ email: 'test@example.com', firstName: 'Jane' })
  })

  it('returns 500 when trackConversion throws', async () => {
    mockTrackConversion.mockRejectedValue(new Error('Conversion Action not found: ca-001'))
    const res = await POST(makeReq(validBody))
    expect(res.status).toBe(500)
    expect((await res.json()).error).toContain('Conversion Action not found')
  })

  it('omits optional fields (value, currency, gclid, customData) gracefully', async () => {
    const minimalBody = {
      conversionActionId: 'ca-002',
      eventId: 'evt-minimal',
      eventTime: '2026-05-17T12:00:00.000Z',
      user: {},
    }
    const res = await POST(makeReq(minimalBody))
    expect(res.status).toBe(200)

    const call = mockTrackConversion.mock.calls[0][0]
    expect(call.value).toBeUndefined()
    expect(call.currency).toBeUndefined()
    expect(call.gclid).toBeUndefined()
    expect(call.customData).toBeUndefined()
  })
})
