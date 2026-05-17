// __tests__/app/api/v1/ads/pixel-configs/test-event.test.ts
import { POST } from '@/app/api/v1/ads/pixel-configs/[id]/test-event/route'

jest.mock('@/lib/api/auth', () => ({ withAuth: (_r: string, h: any) => h }))
jest.mock('@/lib/ads/pixel-configs/store', () => ({
  getPixelConfig: jest.fn(),
}))
jest.mock('@/lib/ads/capi/test', () => ({
  sendTestEvent: jest.fn(),
}))

const store = jest.requireMock('@/lib/ads/pixel-configs/store')
const capiTest = jest.requireMock('@/lib/ads/capi/test')

beforeEach(() => jest.clearAllMocks())

const baseConfig = {
  id: 'pxc_1',
  orgId: 'org_1',
  name: 'Test Pixel',
  meta: { pixelId: 'px_abc', capiTokenEnc: 'enc_tok' },
}

function makeReq(opts: {
  orgId?: string
  id?: string
  body?: Record<string, unknown>
  omitOrgId?: boolean
}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (!opts.omitOrgId) {
    headers['X-Org-Id'] = opts.orgId ?? 'org_1'
  }
  return new Request('http://x', {
    method: 'POST',
    headers,
    body: JSON.stringify(opts.body ?? { testEventCode: 'TEST12345' }),
  }) as any
}

function makeCtx(id = 'pxc_1') {
  return { params: Promise.resolve({ id }) }
}

describe('POST /api/v1/ads/pixel-configs/[id]/test-event', () => {
  it('happy path: returns sent=true with metaEventsReceived', async () => {
    store.getPixelConfig.mockResolvedValueOnce(baseConfig)
    capiTest.sendTestEvent.mockResolvedValueOnce({ sent: true, metaEventsReceived: 1 })

    const res = await POST(makeReq({}), {} as any, makeCtx())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.sent).toBe(true)
    expect(body.data.metaEventsReceived).toBe(1)
    expect(capiTest.sendTestEvent).toHaveBeenCalledWith({
      pixelConfigId: 'pxc_1',
      testEventCode: 'TEST12345',
    })
  })

  it('returns 400 when testEventCode is missing', async () => {
    store.getPixelConfig.mockResolvedValueOnce(baseConfig)

    const res = await POST(makeReq({ body: {} }), {} as any, makeCtx())
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toMatch(/testEventCode/)
    expect(capiTest.sendTestEvent).not.toHaveBeenCalled()
  })

  it('returns 404 when config belongs to a different org', async () => {
    store.getPixelConfig.mockResolvedValueOnce({ ...baseConfig, orgId: 'org_other' })

    const res = await POST(makeReq({ orgId: 'org_1' }), {} as any, makeCtx())

    expect(res.status).toBe(404)
    expect(capiTest.sendTestEvent).not.toHaveBeenCalled()
  })

  it('returns sent=false (not 500) when sendTestEvent reports failure', async () => {
    store.getPixelConfig.mockResolvedValueOnce(baseConfig)
    capiTest.sendTestEvent.mockResolvedValueOnce({
      sent: false,
      error: 'No Meta CAPI token configured',
    })

    const res = await POST(makeReq({}), {} as any, makeCtx())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.sent).toBe(false)
    expect(body.data.error).toBe('No Meta CAPI token configured')
  })
})
