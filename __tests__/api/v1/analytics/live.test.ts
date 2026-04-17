import { GET } from '@/app/api/v1/analytics/live/route'
import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'

jest.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: jest.fn() },
}))
jest.mock('@/lib/api/auth', () => ({
  withAuth: (_role: string, handler: Function) => handler,
}))
jest.mock('@/lib/api/response', () => ({
  apiSuccess: (data: unknown) => Response.json(data),
  apiError: (msg: string, status: number) => Response.json({ error: msg }, { status }),
}))

describe('GET /api/v1/analytics/live', () => {
  it('returns 400 when propertyId missing', async () => {
    const req = new NextRequest('http://localhost/api/v1/analytics/live')
    const res = await GET(req)
    expect(res.status).toBe(400)
  })

  it('returns events array', async () => {
    const mockQuery = {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue({
        docs: [{
          id: 'e1',
          data: () => ({ event: 'pageview', distinctId: 'u1', serverTime: { toDate: () => new Date() } }),
        }],
      }),
    }
    ;(adminDb.collection as jest.Mock).mockReturnValue(mockQuery)
    const req = new NextRequest('http://localhost/api/v1/analytics/live?propertyId=prop_x')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.events)).toBe(true)
  })
})
