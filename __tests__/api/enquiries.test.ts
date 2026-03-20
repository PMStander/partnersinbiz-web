import { POST } from '@/app/api/enquiries/route'
import { NextRequest } from 'next/server'

// Mock firebase admin
jest.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: jest.fn().mockReturnValue({
      add: jest.fn().mockResolvedValue({ id: 'test-enquiry-id' }),
    }),
  },
}))

// Mock resend
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: jest.fn().mockResolvedValue({ id: 'email-id' }) },
  })),
}))

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/enquiries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const validBody = {
  name: 'Test User',
  email: 'test@example.com',
  projectType: 'web',
  details: 'Build me a site',
}

describe('POST /api/enquiries', () => {
  it('returns 400 when name is missing', async () => {
    const req = makeRequest({ ...validBody, name: '' })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/name/i)
  })

  it('returns 400 when email is missing', async () => {
    const req = makeRequest({ ...validBody, email: '' })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/email/i)
  })

  it('returns 400 when email is invalid', async () => {
    const req = makeRequest({ ...validBody, email: 'not-an-email' })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/email/i)
  })

  it('returns 400 when details is missing', async () => {
    const req = makeRequest({ ...validBody, details: '' })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/details/i)
  })

  it('returns 201 on valid submission', async () => {
    const req = makeRequest(validBody)
    const res = await POST(req)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.id).toBe('test-enquiry-id')
  })
})
