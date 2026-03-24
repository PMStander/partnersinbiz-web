import { POST } from '@/app/api/v1/crm/activities/route'
import { NextRequest } from 'next/server'

jest.mock('@/lib/firebase/admin', () => ({
  adminAuth: { verifyIdToken: jest.fn(), verifySessionCookie: jest.fn() },
  adminDb: { collection: jest.fn() },
}))

import { adminDb } from '@/lib/firebase/admin'
process.env.AI_API_KEY = 'test-key'

function makeReq(body: object) {
  return new NextRequest('http://localhost/api/v1/crm/activities', {
    method: 'POST',
    headers: { authorization: 'Bearer test-key', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  ;(adminDb.collection as jest.Mock).mockReturnValue({
    add: jest.fn().mockResolvedValue({ id: 'act-1' }),
  })
})

describe('POST /api/v1/crm/activities', () => {
  const valid = {
    contactId: 'c1', dealId: '', type: 'note',
    summary: 'Called the client', metadata: {}, createdBy: 'uid-1',
  }

  it('logs activity and returns 201', async () => {
    const res = await POST(makeReq(valid))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.data.id).toBe('act-1')
  })

  it('returns 400 when contactId is missing', async () => {
    const res = await POST(makeReq({ ...valid, contactId: '' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when type is invalid', async () => {
    const res = await POST(makeReq({ ...valid, type: 'unknown' }))
    expect(res.status).toBe(400)
  })
})
