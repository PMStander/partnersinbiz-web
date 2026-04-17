// __tests__/api/v1/properties/route.test.ts
import { GET, POST } from '@/app/api/v1/properties/route'
import { NextRequest } from 'next/server'

jest.mock('@/lib/firebase/admin', () => ({
  adminAuth: { verifyIdToken: jest.fn(), verifySessionCookie: jest.fn() },
  adminDb: { collection: jest.fn() },
}))

jest.mock('@/lib/webhooks/dispatch', () => ({
  dispatchWebhook: jest.fn().mockResolvedValue(undefined),
}))

import { adminDb } from '@/lib/firebase/admin'
process.env.AI_API_KEY = 'test-key'

function makeReq(method: string, body?: object, search = '') {
  return new NextRequest(`http://localhost/api/v1/properties${search}`, {
    method,
    headers: { authorization: 'Bearer test-key', 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
}

function mockCollection(docs: object[], addId = 'new-prop-id') {
  const mockDocs = docs.map((d: any) => ({ id: d.id ?? 'prop-1', data: () => d }))
  ;(adminDb.collection as jest.Mock).mockReturnValue({
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    get: jest.fn().mockResolvedValue({ docs: mockDocs }),
    add: jest.fn().mockResolvedValue({ id: addId }),
  })
}

const validProperty = {
  orgId: 'org-lumen',
  name: 'Scrolled Brain',
  domain: 'scrolledbrain.com',
  type: 'web',
}

describe('GET /api/v1/properties', () => {
  it('returns 401 without auth', async () => {
    const req = new NextRequest('http://localhost/api/v1/properties')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('returns 400 when orgId is missing', async () => {
    mockCollection([])
    const res = await GET(makeReq('GET'))
    expect(res.status).toBe(400)
  })

  it('returns list of properties for an org', async () => {
    mockCollection([{ id: 'p1', orgId: 'org-lumen', name: 'Scrolled Brain', deleted: false }])
    const res = await GET(makeReq('GET', undefined, '?orgId=org-lumen'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(Array.isArray(body.data)).toBe(true)
  })
})

describe('POST /api/v1/properties', () => {
  it('creates a property and returns 201 with an ingestKey', async () => {
    mockCollection([], 'created-id')
    const res = await POST(makeReq('POST', validProperty))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.data.id).toBe('created-id')
    expect(body.data.ingestKey).toMatch(/^[0-9a-f]{64}$/)
  })

  it('returns 400 when required fields are missing', async () => {
    mockCollection([])
    const res = await POST(makeReq('POST', { orgId: 'org-lumen' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid type enum', async () => {
    mockCollection([])
    const res = await POST(makeReq('POST', { ...validProperty, type: 'invalid' }))
    expect(res.status).toBe(400)
  })
})
