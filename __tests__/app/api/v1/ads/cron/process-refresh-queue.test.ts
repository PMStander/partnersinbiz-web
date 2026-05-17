// __tests__/app/api/v1/ads/cron/process-refresh-queue.test.ts
import { POST } from '@/app/api/v1/ads/cron/process-refresh-queue/route'

jest.mock('@/lib/ads/insights/worker', () => ({
  drainRefreshQueue: jest.fn(),
}))

const worker = jest.requireMock('@/lib/ads/insights/worker')

const CRON_SECRET = 'test-cron-secret'

beforeEach(() => {
  jest.clearAllMocks()
  process.env.CRON_SECRET = CRON_SECRET
})

function makeRequest(authHeader?: string) {
  const headers: Record<string, string> = {}
  if (authHeader !== undefined) headers['authorization'] = authHeader
  return new Request('http://localhost/api/v1/ads/cron/process-refresh-queue', {
    method: 'POST',
    headers,
  }) as any
}

describe('POST /api/v1/ads/cron/process-refresh-queue', () => {
  it('returns 401 when authorization header is missing', async () => {
    const res = await POST(makeRequest())
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(worker.drainRefreshQueue).not.toHaveBeenCalled()
  })

  it('drains the refresh queue and returns processed/failed counts', async () => {
    worker.drainRefreshQueue.mockResolvedValueOnce({ processed: 5, failed: 1 })
    const res = await POST(makeRequest(`Bearer ${CRON_SECRET}`))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data).toEqual({ processed: 5, failed: 1 })
    expect(worker.drainRefreshQueue).toHaveBeenCalledTimes(1)
  })

  it('returns success with zero counts when queue is empty', async () => {
    worker.drainRefreshQueue.mockResolvedValueOnce({ processed: 0, failed: 0 })
    const res = await POST(makeRequest(`Bearer ${CRON_SECRET}`))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data).toEqual({ processed: 0, failed: 0 })
  })
})
