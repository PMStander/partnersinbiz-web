// __tests__/api/v1/properties/[id]/route.test.ts
import { GET, PUT, DELETE } from '@/app/api/v1/properties/[id]/route'
import { NextRequest } from 'next/server'

jest.mock('@/lib/firebase/admin', () => ({
  adminAuth: { verifyIdToken: jest.fn(), verifySessionCookie: jest.fn() },
  adminDb: { collection: jest.fn() },
}))

import { adminDb } from '@/lib/firebase/admin'
process.env.AI_API_KEY = 'test-key'

const CTX = { params: { id: 'prop-123' } }

function makeReq(method: string, body?: object) {
  return new NextRequest('http://localhost/api/v1/properties/prop-123', {
    method,
    headers: { authorization: 'Bearer test-key', 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
}

const existingDoc = {
  id: 'prop-123',
  orgId: 'org-lumen',
  name: 'Scrolled Brain',
  domain: 'scrolledbrain.com',
  type: 'web',
  status: 'active',
  config: {},
  ingestKey: 'a'.repeat(64),
  deleted: false,
}

function mockDocFound(data = existingDoc) {
  ;(adminDb.collection as jest.Mock).mockReturnValue({
    doc: jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue({ exists: true, id: data.id, data: () => data }),
      update: jest.fn().mockResolvedValue(undefined),
    }),
  })
}

function mockDocNotFound() {
  ;(adminDb.collection as jest.Mock).mockReturnValue({
    doc: jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue({ exists: false }),
    }),
  })
}

describe('GET /api/v1/properties/:id', () => {
  it('returns 404 when not found', async () => {
    mockDocNotFound()
    const res = await GET(makeReq('GET'), CTX)
    expect(res.status).toBe(404)
  })

  it('returns the property when found', async () => {
    mockDocFound()
    const res = await GET(makeReq('GET'), CTX)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.id).toBe('prop-123')
    expect(body.data.name).toBe('Scrolled Brain')
  })
})

describe('PUT /api/v1/properties/:id', () => {
  it('returns 404 when not found', async () => {
    mockDocNotFound()
    const res = await PUT(makeReq('PUT', { name: 'New Name' }), CTX)
    expect(res.status).toBe(404)
  })

  it('updates and returns the property', async () => {
    mockDocFound()
    const res = await PUT(makeReq('PUT', { name: 'Updated Name', status: 'active' }), CTX)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
  })

  it('returns 400 for invalid status enum', async () => {
    mockDocFound()
    const res = await PUT(makeReq('PUT', { status: 'invalid' }), CTX)
    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/v1/properties/:id', () => {
  it('returns 404 when not found', async () => {
    mockDocNotFound()
    const res = await DELETE(makeReq('DELETE'), CTX)
    expect(res.status).toBe(404)
  })

  it('soft-deletes and returns 200', async () => {
    mockDocFound()
    const res = await DELETE(makeReq('DELETE'), CTX)
    expect(res.status).toBe(200)
  })
})
