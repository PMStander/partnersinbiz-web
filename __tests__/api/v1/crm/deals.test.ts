import { GET, POST } from '@/app/api/v1/crm/deals/route'
import { PUT, DELETE } from '@/app/api/v1/crm/deals/[id]/route'
import { NextRequest } from 'next/server'

jest.mock('@/lib/firebase/admin', () => ({
  adminAuth: { verifyIdToken: jest.fn(), verifySessionCookie: jest.fn() },
  adminDb: { collection: jest.fn() },
}))

import { adminDb } from '@/lib/firebase/admin'
process.env.AI_API_KEY = 'test-key'

const params = { params: Promise.resolve({ id: 'deal-1' }) }

function makeReq(method: string, body?: object, search = '') {
  return new NextRequest(`http://localhost/api/v1/crm/deals${search}`, {
    method,
    headers: { authorization: 'Bearer test-key', 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
}

function mockList(docs: object[]) {
  const mockDocs = docs.map((d: any) => ({ id: d.id ?? 'doc-1', data: () => d }))
  ;(adminDb.collection as jest.Mock).mockReturnValue({
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    get: jest.fn().mockResolvedValue({ docs: mockDocs }),
    add: jest.fn().mockResolvedValue({ id: 'new-deal' }),
    doc: jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue({ exists: true, data: () => docs[0] ?? {} }),
      update: jest.fn().mockResolvedValue(undefined),
    }),
  })
}

describe('GET /api/v1/crm/deals', () => {
  it('returns list of deals', async () => {
    mockList([{ id: 'd1', title: 'Big deal', stage: 'discovery', deleted: false }])
    const res = await GET(makeReq('GET', undefined, '?orgId=org-test'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(Array.isArray(body.data)).toBe(true)
  })
})

describe('POST /api/v1/crm/deals', () => {
  const validDeal = {
    orgId: 'org-test',
    contactId: 'c1',
    title: 'New Website',
    value: 5000,
    currency: 'USD',
    stage: 'discovery',
    notes: '',
  }

  it('creates deal and returns 201', async () => {
    mockList([])
    const res = await POST(makeReq('POST', validDeal))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.data.id).toBe('new-deal')
  })

  it('returns 400 when title is missing', async () => {
    mockList([])
    const res = await POST(makeReq('POST', { ...validDeal, title: '' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when currency is invalid', async () => {
    mockList([])
    const res = await POST(makeReq('POST', { ...validDeal, currency: 'GBP' }))
    expect(res.status).toBe(400)
  })
})

describe('PUT /api/v1/crm/deals/:id', () => {
  it('updates deal', async () => {
    mockList([{ id: 'deal-1', title: 'Deal', deleted: false }])
    const res = await PUT(makeReq('PUT', { stage: 'proposal' }), params)
    expect(res.status).toBe(200)
  })
})

describe('DELETE /api/v1/crm/deals/:id', () => {
  it('soft-deletes deal', async () => {
    mockList([{ id: 'deal-1', title: 'Deal', deleted: false }])
    const res = await DELETE(makeReq('DELETE'), params)
    expect(res.status).toBe(200)
  })
})
