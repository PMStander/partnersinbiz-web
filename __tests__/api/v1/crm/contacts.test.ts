import { GET, POST } from '@/app/api/v1/crm/contacts/route'
import { NextRequest } from 'next/server'

jest.mock('@/lib/firebase/admin', () => ({
  adminAuth: { verifyIdToken: jest.fn(), verifySessionCookie: jest.fn() },
  adminDb: { collection: jest.fn() },
}))

import { adminDb } from '@/lib/firebase/admin'
process.env.AI_API_KEY = 'test-key'

function makeReq(method: string, body?: object, search = '') {
  return new NextRequest(`http://localhost/api/v1/crm/contacts${search}`, {
    method,
    headers: { authorization: 'Bearer test-key', 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
}

function mockCollection(docs: object[], addId = 'new-id') {
  const mockDocs = docs.map((d: any) => ({ id: d.id ?? 'doc-1', data: () => d }))
  ;(adminDb.collection as jest.Mock).mockReturnValue({
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    get: jest.fn().mockResolvedValue({ docs: mockDocs }),
    add: jest.fn().mockResolvedValue({ id: addId }),
    doc: jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue({ exists: false }),
    }),
  })
}

describe('GET /api/v1/crm/contacts', () => {
  it('returns list of contacts', async () => {
    mockCollection([{ id: 'c1', name: 'John', email: 'john@test.com', deleted: false }])
    const res = await GET(makeReq('GET'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(Array.isArray(body.data)).toBe(true)
  })

  it('returns 401 without auth', async () => {
    const req = new NextRequest('http://localhost/api/v1/crm/contacts')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })
})

describe('POST /api/v1/crm/contacts', () => {
  const validContact = {
    name: 'Jane Doe',
    email: 'jane@example.com',
    phone: '',
    company: 'Acme',
    website: '',
    source: 'manual',
    type: 'lead',
    stage: 'new',
    tags: [],
    notes: '',
    assignedTo: '',
  }

  it('creates a contact and returns 201', async () => {
    mockCollection([], 'created-id')
    const res = await POST(makeReq('POST', validContact))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.data.id).toBe('created-id')
  })

  it('returns 400 when name is missing', async () => {
    mockCollection([])
    const res = await POST(makeReq('POST', { ...validContact, name: '' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when email is invalid', async () => {
    mockCollection([])
    const res = await POST(makeReq('POST', { ...validContact, email: 'not-email' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when stage is invalid', async () => {
    mockCollection([])
    const res = await POST(makeReq('POST', { ...validContact, stage: 'invalid' }))
    expect(res.status).toBe(400)
  })
})
