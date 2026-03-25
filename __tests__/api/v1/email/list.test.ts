// __tests__/api/v1/email/list.test.ts
import { GET } from '@/app/api/v1/email/route'
import { NextRequest } from 'next/server'

jest.mock('@/lib/firebase/admin', () => ({
  adminAuth: { verifyIdToken: jest.fn(), verifySessionCookie: jest.fn() },
  adminDb: { collection: jest.fn() },
}))

import { adminDb } from '@/lib/firebase/admin'
process.env.AI_API_KEY = 'test-key'

function makeReq(search = '') {
  return new NextRequest(`http://localhost/api/v1/email${search}`, {
    method: 'GET',
    headers: { authorization: 'Bearer test-key' },
  })
}

function mockCollection(docs: object[]) {
  const mockDocs = docs.map((d: any) => ({ id: d.id ?? 'e1', data: () => d }))
  ;(adminDb.collection as jest.Mock).mockReturnValue({
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    get: jest.fn().mockResolvedValue({ docs: mockDocs }),
  })
}

describe('GET /api/v1/email', () => {
  it('returns 401 without auth', async () => {
    const req = new NextRequest('http://localhost/api/v1/email')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('returns list of emails', async () => {
    mockCollection([{ id: 'e1', subject: 'Hello', status: 'sent', direction: 'outbound' }])
    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(Array.isArray(body.data)).toBe(true)
    expect(body.meta).toMatchObject({ page: 1 })
  })

  it('filters by status query param', async () => {
    mockCollection([])
    const res = await GET(makeReq('?status=sent'))
    expect(res.status).toBe(200)
    expect(adminDb.collection).toHaveBeenCalledWith('emails')
  })

  it('filters by direction query param', async () => {
    mockCollection([])
    const res = await GET(makeReq('?direction=outbound'))
    expect(res.status).toBe(200)
  })

  it('filters by contactId query param', async () => {
    mockCollection([])
    const res = await GET(makeReq('?contactId=c1'))
    expect(res.status).toBe(200)
  })

  it('returns empty array when no emails exist', async () => {
    mockCollection([])
    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual([])
  })
})
