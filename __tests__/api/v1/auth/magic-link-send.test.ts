import { NextRequest } from 'next/server'

const mockCreateMagicLink = jest.fn()
const mockSendEmail = jest.fn()
const mockCheckAndIncrementRateLimit = jest.fn()
const mockBuildMagicLinkEmail = jest.fn()

jest.mock('@/lib/client-documents/magicLink', () => ({
  createMagicLink: mockCreateMagicLink,
}))

jest.mock('@/lib/email/send', () => ({
  sendEmail: mockSendEmail,
}))

jest.mock('@/lib/rateLimit', () => ({
  checkAndIncrementRateLimit: mockCheckAndIncrementRateLimit,
}))

jest.mock('@/lib/email/templates/magic-link', () => ({
  buildMagicLinkEmail: mockBuildMagicLinkEmail,
}))

function postRequest(body: unknown) {
  return new NextRequest('http://localhost/api/v1/auth/magic-link/send', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockBuildMagicLinkEmail.mockReturnValue({
    subject: 'Sign in to Partners in Biz',
    html: '<html>sign in</html>',
    text: 'sign in',
  })
  mockCheckAndIncrementRateLimit.mockResolvedValue({
    allowed: true,
    remaining: 2,
    resetAt: new Date(Date.now() + 15 * 60 * 1000),
  })
  mockCreateMagicLink.mockResolvedValue({
    token: 'aabbcc'.repeat(10),
    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
  })
  mockSendEmail.mockResolvedValue({ success: true })
  process.env.NEXT_PUBLIC_APP_URL = 'https://example.test'
})

afterEach(() => {
  delete process.env.NEXT_PUBLIC_APP_URL
})

describe('POST /api/v1/auth/magic-link/send', () => {
  it('rejects missing email', async () => {
    const { POST } = await import('@/app/api/v1/auth/magic-link/send/route')
    const res = await POST(postRequest({}))

    expect(res.status).toBe(400)
    expect(mockCreateMagicLink).not.toHaveBeenCalled()
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('rejects malformed email', async () => {
    const { POST } = await import('@/app/api/v1/auth/magic-link/send/route')
    const res = await POST(postRequest({ email: 'not-an-email' }))

    expect(res.status).toBe(400)
    expect(mockCreateMagicLink).not.toHaveBeenCalled()
  })

  it('returns 429 when rate limit exceeded', async () => {
    mockCheckAndIncrementRateLimit.mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      resetAt: new Date(Date.now() + 5 * 60 * 1000),
    })

    const { POST } = await import('@/app/api/v1/auth/magic-link/send/route')
    const res = await POST(postRequest({ email: 'Foo@Example.com' }))

    expect(res.status).toBe(429)
    expect(mockCheckAndIncrementRateLimit).toHaveBeenCalledWith({
      key: 'magic_link:foo@example.com',
      limit: 3,
      windowMs: 15 * 60 * 1000,
    })
    expect(mockCreateMagicLink).not.toHaveBeenCalled()
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('creates a magic link and emails the sign-in URL', async () => {
    const { POST } = await import('@/app/api/v1/auth/magic-link/send/route')
    const res = await POST(
      postRequest({
        email: 'Foo@Example.com',
        redirectUrl: '/portal/documents/abc',
        context: { kind: 'client-doc', docId: 'abc' },
        docTitle: 'Q3 Proposal',
      }),
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ success: true, data: { sent: true } })

    expect(mockCreateMagicLink).toHaveBeenCalledWith({
      email: 'foo@example.com',
      redirectUrl: '/portal/documents/abc',
      context: { kind: 'client-doc', docId: 'abc' },
    })

    const builderArgs = mockBuildMagicLinkEmail.mock.calls[0][0]
    expect(builderArgs.docTitle).toBe('Q3 Proposal')
    expect(builderArgs.signInUrl).toMatch(/^https:\/\/example\.test\/api\/v1\/auth\/magic-link\/verify\?token=/)

    expect(mockSendEmail).toHaveBeenCalledWith({
      to: 'foo@example.com',
      subject: 'Sign in to Partners in Biz',
      html: '<html>sign in</html>',
    })
    expect(mockSendEmail.mock.calls[0][0]).not.toHaveProperty('text')
  })

  it('lowercases the email before rate-limiting and storage', async () => {
    const { POST } = await import('@/app/api/v1/auth/magic-link/send/route')
    await POST(postRequest({ email: 'MIXED@Case.IO' }))

    expect(mockCheckAndIncrementRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'magic_link:mixed@case.io' }),
    )
    expect(mockCreateMagicLink).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'mixed@case.io' }),
    )
  })
})

export {}
