import { NextRequest } from 'next/server'

const mockGet = jest.fn()
const mockLimit = jest.fn()
const mockWhere = jest.fn()
const mockCollection = jest.fn()

const mockVerifyAccessCode = jest.fn()
const mockLogDocumentAccess = jest.fn()
const mockCheckAndIncrementRateLimit = jest.fn()

jest.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: mockCollection },
}))

jest.mock('@/lib/client-documents/editShare', () => ({
  verifyAccessCode: (...args: unknown[]) => mockVerifyAccessCode(...args),
  logDocumentAccess: (...args: unknown[]) => mockLogDocumentAccess(...args),
}))

jest.mock('@/lib/rateLimit', () => ({
  checkAndIncrementRateLimit: (...args: unknown[]) => mockCheckAndIncrementRateLimit(...args),
}))

function postRequest(url: string, body: unknown, headers?: Record<string, string>) {
  return new NextRequest(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...(headers ?? {}) },
  })
}

const TOKEN = 'a'.repeat(32)

function setDocSnap(value: { empty: boolean; docs?: Array<{ id: string; ref: { id: string }; data: () => unknown }> }) {
  mockGet.mockResolvedValue(value)
}

function makeDocSnap(opts: { id?: string; editShareEnabled?: boolean; editAccessCode?: string; deleted?: boolean }) {
  const id = opts.id ?? 'doc-1'
  return {
    empty: false,
    docs: [
      {
        id,
        ref: { id },
        data: () => ({
          editShareEnabled: opts.editShareEnabled ?? true,
          editAccessCode: opts.editAccessCode ?? 'ABC234',
          deleted: opts.deleted ?? false,
        }),
      },
    ],
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  const query = { where: mockWhere, limit: mockLimit, get: mockGet }
  mockWhere.mockReturnValue(query)
  mockLimit.mockReturnValue(query)
  mockCollection.mockReturnValue(query)

  mockCheckAndIncrementRateLimit.mockResolvedValue({
    allowed: true,
    remaining: 4,
    resetAt: new Date(Date.now() + 15 * 60 * 1000),
  })
  mockLogDocumentAccess.mockResolvedValue(undefined)
  mockVerifyAccessCode.mockReturnValue(true)
})

describe('POST /api/v1/public/client-documents/edit/[editShareToken]/verify-code', () => {
  it('returns 400 when code is missing', async () => {
    const { POST } = await import(
      '@/app/api/v1/public/client-documents/edit/[editShareToken]/verify-code/route'
    )
    const req = postRequest(`http://localhost/api/v1/public/client-documents/edit/${TOKEN}/verify-code`, {})
    const res = await POST(req, { params: Promise.resolve({ editShareToken: TOKEN }) })

    expect(res.status).toBe(400)
    expect(mockCheckAndIncrementRateLimit).not.toHaveBeenCalled()
    expect(mockGet).not.toHaveBeenCalled()
  })

  it('returns 429 when rate limit is exceeded', async () => {
    mockCheckAndIncrementRateLimit.mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      resetAt: new Date(Date.now() + 5 * 60 * 1000),
    })

    const { POST } = await import(
      '@/app/api/v1/public/client-documents/edit/[editShareToken]/verify-code/route'
    )
    const req = postRequest(
      `http://localhost/api/v1/public/client-documents/edit/${TOKEN}/verify-code`,
      { code: 'ABC234' },
      { 'x-forwarded-for': '1.2.3.4' },
    )
    const res = await POST(req, { params: Promise.resolve({ editShareToken: TOKEN }) })

    expect(res.status).toBe(429)
    expect(mockCheckAndIncrementRateLimit).toHaveBeenCalledWith({
      key: `code:1.2.3.4:${TOKEN}`,
      limit: 5,
      windowMs: 15 * 60 * 1000,
    })
    expect(mockGet).not.toHaveBeenCalled()
    expect(mockLogDocumentAccess).not.toHaveBeenCalled()
  })

  it('returns 404 when editShareToken does not match any document', async () => {
    setDocSnap({ empty: true, docs: [] })

    const { POST } = await import(
      '@/app/api/v1/public/client-documents/edit/[editShareToken]/verify-code/route'
    )
    const req = postRequest(
      `http://localhost/api/v1/public/client-documents/edit/${TOKEN}/verify-code`,
      { code: 'ABC234' },
    )
    const res = await POST(req, { params: Promise.resolve({ editShareToken: TOKEN }) })

    expect(res.status).toBe(404)
    expect(mockWhere).toHaveBeenCalledWith('editShareToken', '==', TOKEN)
    expect(mockLogDocumentAccess).not.toHaveBeenCalled()
  })

  it('returns 410 when edit-share is disabled', async () => {
    setDocSnap(makeDocSnap({ editShareEnabled: false }))

    const { POST } = await import(
      '@/app/api/v1/public/client-documents/edit/[editShareToken]/verify-code/route'
    )
    const req = postRequest(
      `http://localhost/api/v1/public/client-documents/edit/${TOKEN}/verify-code`,
      { code: 'ABC234' },
    )
    const res = await POST(req, { params: Promise.resolve({ editShareToken: TOKEN }) })

    expect(res.status).toBe(410)
    expect(mockLogDocumentAccess).not.toHaveBeenCalled()
  })

  it('returns 410 when the document is soft-deleted', async () => {
    setDocSnap(makeDocSnap({ deleted: true }))

    const { POST } = await import(
      '@/app/api/v1/public/client-documents/edit/[editShareToken]/verify-code/route'
    )
    const req = postRequest(
      `http://localhost/api/v1/public/client-documents/edit/${TOKEN}/verify-code`,
      { code: 'ABC234' },
    )
    const res = await POST(req, { params: Promise.resolve({ editShareToken: TOKEN }) })

    expect(res.status).toBe(410)
    expect(mockLogDocumentAccess).not.toHaveBeenCalled()
  })

  it('returns 401 and logs code_failed when code is incorrect', async () => {
    setDocSnap(makeDocSnap({ id: 'doc-7', editAccessCode: 'CORRECT' }))
    mockVerifyAccessCode.mockReturnValueOnce(false)

    const { POST } = await import(
      '@/app/api/v1/public/client-documents/edit/[editShareToken]/verify-code/route'
    )
    const req = postRequest(
      `http://localhost/api/v1/public/client-documents/edit/${TOKEN}/verify-code`,
      { code: 'WRONG!' },
      { 'x-forwarded-for': '9.9.9.9', 'user-agent': 'jest-test/1.0' },
    )
    const res = await POST(req, { params: Promise.resolve({ editShareToken: TOKEN }) })

    expect(res.status).toBe(401)
    expect(mockVerifyAccessCode).toHaveBeenCalledWith('CORRECT', 'WRONG!')
    expect(mockLogDocumentAccess).toHaveBeenCalledWith('doc-7', {
      type: 'code_failed',
      ip: '9.9.9.9',
      userAgent: 'jest-test/1.0',
    })
    // No cookie on failure
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('returns 200, logs code_entered, and sets eds_{token} cookie when code is correct', async () => {
    setDocSnap(makeDocSnap({ id: 'doc-9', editAccessCode: 'GOOD12' }))
    mockVerifyAccessCode.mockReturnValueOnce(true)

    const { POST } = await import(
      '@/app/api/v1/public/client-documents/edit/[editShareToken]/verify-code/route'
    )
    const req = postRequest(
      `http://localhost/api/v1/public/client-documents/edit/${TOKEN}/verify-code`,
      { code: 'GOOD12' },
      { 'x-forwarded-for': '5.5.5.5', 'user-agent': 'jest-test/1.0' },
    )
    const res = await POST(req, { params: Promise.resolve({ editShareToken: TOKEN }) })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ success: true, data: { codeAccepted: true } })

    expect(mockLogDocumentAccess).toHaveBeenCalledWith('doc-9', {
      type: 'code_entered',
      ip: '5.5.5.5',
      userAgent: 'jest-test/1.0',
    })

    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain(`eds_${TOKEN}=1`)
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('Secure')
    expect(setCookie).toMatch(/SameSite=lax/i)
    expect(setCookie).toContain('Path=/')
    expect(setCookie).toContain('Max-Age=86400')
  })

  it('defaults ip to "unknown" when x-forwarded-for header is absent', async () => {
    setDocSnap(makeDocSnap({ id: 'doc-3' }))
    mockVerifyAccessCode.mockReturnValueOnce(true)

    const { POST } = await import(
      '@/app/api/v1/public/client-documents/edit/[editShareToken]/verify-code/route'
    )
    const req = postRequest(
      `http://localhost/api/v1/public/client-documents/edit/${TOKEN}/verify-code`,
      { code: 'GOOD12' },
    )
    const res = await POST(req, { params: Promise.resolve({ editShareToken: TOKEN }) })

    expect(res.status).toBe(200)
    expect(mockCheckAndIncrementRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ key: `code:unknown:${TOKEN}` }),
    )
    expect(mockLogDocumentAccess).toHaveBeenCalledWith(
      'doc-3',
      expect.objectContaining({ ip: 'unknown' }),
    )
  })
})

export {}
