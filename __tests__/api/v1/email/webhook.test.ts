// __tests__/api/v1/email/webhook.test.ts
import { POST } from '@/app/api/v1/email/webhook/route'
import { NextRequest } from 'next/server'

jest.mock('@/lib/firebase/admin', () => ({
  adminAuth: { verifyIdToken: jest.fn(), verifySessionCookie: jest.fn() },
  adminDb: { collection: jest.fn() },
}))

import { adminDb } from '@/lib/firebase/admin'

const mockDocUpdate = jest.fn().mockResolvedValue(undefined)
const mockQuery = {
  where: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  get: jest.fn(),
}

function mockEmail(id: string) {
  mockQuery.get.mockResolvedValue({
    empty: false,
    docs: [{ id, ref: { update: mockDocUpdate } }],
  })
  ;(adminDb.collection as jest.Mock).mockReturnValue(mockQuery)
}

function mockNoEmail() {
  mockQuery.get.mockResolvedValue({ empty: true, docs: [] })
  ;(adminDb.collection as jest.Mock).mockReturnValue(mockQuery)
}

function makeReq(payload: object) {
  return new NextRequest('http://localhost/api/v1/email/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

describe('POST /api/v1/email/webhook', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 200 for unknown event type (no-op)', async () => {
    mockNoEmail()
    const res = await POST(makeReq({ type: 'email.sent', data: { email_id: 'r1' } }))
    expect(res.status).toBe(200)
  })

  it('returns 200 and skips update when resendId not found', async () => {
    mockNoEmail()
    const res = await POST(makeReq({ type: 'email.opened', data: { email_id: 'unknown' } }))
    expect(res.status).toBe(200)
    expect(mockDocUpdate).not.toHaveBeenCalled()
  })

  it('updates status to opened on email.opened', async () => {
    mockEmail('email-doc-1')
    const res = await POST(makeReq({ type: 'email.opened', data: { email_id: 'resend-1' } }))
    expect(res.status).toBe(200)
    expect(mockDocUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'opened', openedAt: expect.anything() }),
    )
  })

  it('updates status to clicked on email.clicked', async () => {
    mockEmail('email-doc-1')
    const res = await POST(makeReq({ type: 'email.clicked', data: { email_id: 'resend-1' } }))
    expect(res.status).toBe(200)
    expect(mockDocUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'clicked', clickedAt: expect.anything() }),
    )
  })

  it('keeps status as sent on email.delivered', async () => {
    mockEmail('email-doc-1')
    const res = await POST(makeReq({ type: 'email.delivered', data: { email_id: 'resend-1' } }))
    expect(res.status).toBe(200)
    // delivered does not change status — no update call needed
  })

  it('updates status to failed on email.bounced', async () => {
    mockEmail('email-doc-1')
    const res = await POST(makeReq({ type: 'email.bounced', data: { email_id: 'resend-1' } }))
    expect(res.status).toBe(200)
    expect(mockDocUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }))
  })

  it('updates status to failed on email.delivery_delayed', async () => {
    mockEmail('email-doc-1')
    const res = await POST(makeReq({ type: 'email.delivery_delayed', data: { email_id: 'resend-1' } }))
    expect(res.status).toBe(200)
    expect(mockDocUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }))
  })

  it('returns 400 on malformed payload', async () => {
    const req = new NextRequest('http://localhost/api/v1/email/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not json',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })
})
