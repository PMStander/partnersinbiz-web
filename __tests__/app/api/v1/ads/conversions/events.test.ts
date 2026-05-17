// __tests__/app/api/v1/ads/conversions/events.test.ts
import { GET } from '@/app/api/v1/ads/conversions/events/route'

jest.mock('@/lib/api/auth', () => ({
  withAuth: (_role: string, handler: any) => handler,
}))
jest.mock('@/lib/ads/capi-events/store', () => ({
  listCapiEvents: jest.fn(),
}))

const { listCapiEvents } = jest.requireMock('@/lib/ads/capi-events/store')

function makeReq(orgId: string | null, params: Record<string, string> = {}) {
  const url = new URL('http://x/api/v1/ads/conversions/events')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const headers: Record<string, string> = {}
  if (orgId !== null) headers['X-Org-Id'] = orgId
  return new Request(url.toString(), { headers })
}

const SAMPLE_EVENT = {
  id: 'evt_abc123',
  orgId: 'org_1',
  pixelConfigId: 'px_1',
  eventName: 'Purchase',
  eventTime: { seconds: 1747000000, nanoseconds: 0 },
  userHash: {
    em: 'a'.repeat(64),
    ph: 'b'.repeat(64),
  },
  actionSource: 'website',
  optOut: false,
  fanout: { meta: { status: 'sent', fbtrace_id: 'trace_1' } },
  createdAt: { seconds: 1747000001, nanoseconds: 0 },
}

describe('GET /api/v1/ads/conversions/events', () => {
  beforeEach(() => jest.clearAllMocks())

  it('happy path — returns events with hashed user data', async () => {
    listCapiEvents.mockResolvedValueOnce([SAMPLE_EVENT])

    const res = await GET(makeReq('org_1') as any, { role: 'admin' } as any, {} as any)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toHaveLength(1)
    expect(body.data[0].id).toBe('evt_abc123')
    // userHash contains only SHA-256 hashes, not raw PII
    expect(body.data[0].userHash.em).toHaveLength(64)
    expect(listCapiEvents).toHaveBeenCalledWith({
      orgId: 'org_1',
      eventName: undefined,
      since: undefined,
      until: undefined,
      limit: 100,
    })
  })

  it('returns 400 when X-Org-Id header is missing', async () => {
    const res = await GET(makeReq(null) as any, { role: 'admin' } as any, {} as any)
    expect(res.status).toBe(400)
    expect(listCapiEvents).not.toHaveBeenCalled()
  })

  it('filters by eventName when ?eventName= is provided', async () => {
    listCapiEvents.mockResolvedValueOnce([SAMPLE_EVENT])

    const res = await GET(
      makeReq('org_1', { eventName: 'Purchase' }) as any,
      { role: 'admin' } as any,
      {} as any,
    )
    const body = await res.json()

    expect(body.success).toBe(true)
    expect(listCapiEvents).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: 'Purchase' }),
    )
  })

  it('filters by date range when ?since= and ?until= are provided', async () => {
    listCapiEvents.mockResolvedValueOnce([SAMPLE_EVENT])

    const res = await GET(
      makeReq('org_1', { since: '1746900000', until: '1747100000' }) as any,
      { role: 'admin' } as any,
      {} as any,
    )
    const body = await res.json()

    expect(body.success).toBe(true)
    expect(listCapiEvents).toHaveBeenCalledWith(
      expect.objectContaining({ since: 1746900000, until: 1747100000 }),
    )
  })
})
