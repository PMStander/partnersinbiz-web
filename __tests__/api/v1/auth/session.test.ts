import { NextRequest } from 'next/server'

const mockVerifyIdToken = jest.fn()
const mockCreateSessionCookie = jest.fn()
const mockFindOrCreateGuestUser = jest.fn()

jest.mock('@/lib/firebase/admin', () => ({
  adminAuth: {
    verifyIdToken: mockVerifyIdToken,
    createSessionCookie: mockCreateSessionCookie,
  },
}))

jest.mock('@/lib/auth/guestUser', () => ({
  findOrCreateGuestUser: mockFindOrCreateGuestUser,
}))

function postRequest(body: unknown) {
  return new NextRequest('http://localhost/api/v1/auth/session', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockCreateSessionCookie.mockResolvedValue('mock-session-cookie')
  mockFindOrCreateGuestUser.mockResolvedValue({
    uid: 'user-1',
    email: 'foo@example.com',
  })
})

describe('POST /api/v1/auth/session', () => {
  it('rejects missing idToken with 400', async () => {
    const { POST } = await import('@/app/api/v1/auth/session/route')
    const res = await POST(postRequest({}))

    expect(res.status).toBe(400)
    expect(mockVerifyIdToken).not.toHaveBeenCalled()
  })

  it('returns 401 when verifyIdToken throws', async () => {
    mockVerifyIdToken.mockRejectedValueOnce(new Error('expired'))

    const { POST } = await import('@/app/api/v1/auth/session/route')
    const res = await POST(postRequest({ idToken: 'bad-token' }))

    expect(res.status).toBe(401)
    expect(mockVerifyIdToken).toHaveBeenCalledWith('bad-token', true)
    expect(mockCreateSessionCookie).not.toHaveBeenCalled()
  })

  it('returns 400 when token decodes but has no email', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({ uid: 'user-1' })

    const { POST } = await import('@/app/api/v1/auth/session/route')
    const res = await POST(postRequest({ idToken: 'tok' }))

    expect(res.status).toBe(400)
    expect(mockCreateSessionCookie).not.toHaveBeenCalled()
  })

  it('mints a session cookie for a Google OAuth ID token', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({
      uid: 'user-1',
      email: 'foo@example.com',
      name: 'Foo Example',
      firebase: { sign_in_provider: 'google.com' },
    })

    const { POST } = await import('@/app/api/v1/auth/session/route')
    const res = await POST(postRequest({ idToken: 'good-token' }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ success: true })

    expect(mockFindOrCreateGuestUser).toHaveBeenCalledWith(
      'foo@example.com',
      'google',
      'Foo Example',
    )
    expect(mockCreateSessionCookie).toHaveBeenCalledWith('good-token', {
      expiresIn: 7 * 24 * 60 * 60 * 1000,
    })

    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain('__session=mock-session-cookie')
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('Secure')
    expect(setCookie.toLowerCase()).toContain('samesite=lax')
    expect(setCookie).toContain('Path=/')
    expect(setCookie).toMatch(/Max-Age=604800/)
  })

  it('infers magic_link provider for custom-token sign-ins', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({
      uid: 'user-2',
      email: 'bar@example.com',
      firebase: { sign_in_provider: 'custom' },
    })

    const { POST } = await import('@/app/api/v1/auth/session/route')
    const res = await POST(postRequest({ idToken: 'magic-id-token' }))

    expect(res.status).toBe(200)
    expect(mockFindOrCreateGuestUser).toHaveBeenCalledWith(
      'bar@example.com',
      'magic_link',
      undefined,
    )
  })
})

export {}
