import { POST, DELETE } from '@/app/api/auth/session/route'
import { NextRequest } from 'next/server'

// Mock firebase admin
jest.mock('@/lib/firebase/admin', () => ({
  adminAuth: {
    createSessionCookie: jest.fn(),
    verifyIdToken: jest.fn(),
  },
  adminDb: {
    collection: jest.fn().mockReturnValue({
      doc: jest.fn().mockReturnValue({
        get: jest.fn().mockResolvedValue({ exists: false }),
        set: jest.fn().mockResolvedValue(undefined),
        update: jest.fn().mockResolvedValue(undefined),
      }),
    }),
  },
}))

import { adminAuth } from '@/lib/firebase/admin'

const mockCreateSessionCookie = adminAuth.createSessionCookie as jest.Mock
const mockVerifyIdToken = adminAuth.verifyIdToken as jest.Mock

function makePostRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/auth/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/auth/session', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 400 when idToken is missing', async () => {
    const req = makePostRequest({})
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBeTruthy()
  })

  it('returns 200 and sets cookie when idToken is valid', async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: 'test-uid', email: 'user@example.com', name: 'Test User' })
    mockCreateSessionCookie.mockResolvedValue('mock-session-cookie')
    const req = makePostRequest({ idToken: 'valid-id-token' })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const setCookieHeader = res.headers.get('set-cookie')
    expect(setCookieHeader).toContain('mock-session-cookie')
  })

  it('returns 401 when idToken is invalid', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('Invalid token'))
    mockCreateSessionCookie.mockRejectedValue(new Error('Invalid token'))
    const req = makePostRequest({ idToken: 'bad-token' })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })
})

describe('DELETE /api/auth/session', () => {
  it('returns 200 and clears the session cookie', async () => {
    const res = await DELETE()
    expect(res.status).toBe(200)
    const setCookieHeader = res.headers.get('set-cookie')
    expect(setCookieHeader).toContain('Max-Age=0')
  })
})
