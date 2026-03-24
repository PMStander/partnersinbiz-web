import { GET, PUT, DELETE } from '@/app/api/v1/crm/contacts/[id]/route'
import { GET as GET_ACTIVITIES } from '@/app/api/v1/crm/contacts/[id]/activities/route'
import { NextRequest } from 'next/server'

jest.mock('@/lib/firebase/admin', () => ({
  adminAuth: { verifyIdToken: jest.fn(), verifySessionCookie: jest.fn() },
  adminDb: { collection: jest.fn() },
}))

import { adminDb } from '@/lib/firebase/admin'
process.env.AI_API_KEY = 'test-key'

const params = { params: Promise.resolve({ id: 'contact-1' }) }

function makeReq(method: string, body?: object) {
  return new NextRequest('http://localhost/api/v1/crm/contacts/contact-1', {
    method,
    headers: { authorization: 'Bearer test-key', 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
}

function mockDoc(data: object | null, exists = true) {
  const updateMock = jest.fn().mockResolvedValue(undefined)
  ;(adminDb.collection as jest.Mock).mockReturnValue({
    doc: jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue({ exists, data: () => data }),
      update: updateMock,
    }),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    get: jest.fn().mockResolvedValue({ docs: [] }),
  })
  return updateMock
}

describe('GET /api/v1/crm/contacts/:id', () => {
  it('returns contact when found', async () => {
    mockDoc({ name: 'John', email: 'john@test.com', deleted: false })
    const res = await GET(makeReq('GET'), params)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.name).toBe('John')
  })

  it('returns 404 when not found', async () => {
    mockDoc(null, false)
    const res = await GET(makeReq('GET'), params)
    expect(res.status).toBe(404)
  })
})

describe('PUT /api/v1/crm/contacts/:id', () => {
  it('updates contact and returns 200', async () => {
    const updateMock = mockDoc({ name: 'John', email: 'john@test.com', deleted: false })
    const res = await PUT(makeReq('PUT', { name: 'John Updated', stage: 'contacted' }), params)
    expect(res.status).toBe(200)
    expect(updateMock).toHaveBeenCalled()
  })

  it('returns 404 when contact does not exist', async () => {
    mockDoc(null, false)
    const res = await PUT(makeReq('PUT', { name: 'X' }), params)
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/v1/crm/contacts/:id', () => {
  it('soft-deletes contact and returns 200', async () => {
    const updateMock = mockDoc({ name: 'John', deleted: false })
    const res = await DELETE(makeReq('DELETE'), params)
    expect(res.status).toBe(200)
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ deleted: true }))
  })
})

describe('GET /api/v1/crm/contacts/:id/activities', () => {
  it('returns activities for a contact', async () => {
    ;(adminDb.collection as jest.Mock).mockReturnValue({
      doc: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue({ exists: true, data: () => ({}) }),
      }),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue({
        docs: [{ id: 'a1', data: () => ({ type: 'note', summary: 'Called' }) }],
      }),
    })
    const res = await GET_ACTIVITIES(makeReq('GET'), params)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.data)).toBe(true)
  })
})
