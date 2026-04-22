const mockGet = jest.fn()
const mockDocFn = jest.fn(() => ({ get: mockGet }))
const mockCollection = jest.fn(() => ({ doc: mockDocFn }))

jest.mock('@/lib/firebase/admin', () => ({ adminDb: { collection: mockCollection } }))
jest.mock('@/lib/api/auth', () => ({
  withAuth: (_role: string, handler: any) => (req: any, ctx: any) =>
    handler(req, null, ctx),
}))
jest.mock('@/lib/api/tenant', () => ({
  withTenant: (handler: any) => (req: any, _user: any, ctx: any) =>
    handler(req, _user, 'org-1', ctx),
}))
jest.mock('@/lib/api/response', () => ({
  apiSuccess: (data: any) => ({ json: () => ({ data }), status: 200 }),
  apiError: (msg: string, code = 400) => ({ json: () => ({ error: msg }), status: code }),
}))

import { GET } from '@/app/api/v1/social/oauth/pending/[nonce]/route'

function makeCtx(nonce: string) {
  return { params: Promise.resolve({ nonce }) } as any
}

describe('GET /api/v1/social/oauth/pending/[nonce]', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 404 when doc does not exist', async () => {
    mockGet.mockResolvedValue({ exists: false })
    const res = await GET({} as any, makeCtx('abc'))
    expect(res.status).toBe(404)
  })

  it('returns 404 when orgId does not match', async () => {
    mockGet.mockResolvedValue({
      exists: true,
      data: () => ({
        orgId: 'other-org',
        expiresAt: { toDate: () => new Date(Date.now() + 60000) },
        platform: 'linkedin',
        options: [],
      }),
    })
    const res = await GET({} as any, makeCtx('abc'))
    expect(res.status).toBe(404)
  })

  it('returns 404 when expired', async () => {
    mockGet.mockResolvedValue({
      exists: true,
      data: () => ({
        orgId: 'org-1',
        expiresAt: { toDate: () => new Date(Date.now() - 1000) },
        platform: 'linkedin',
        options: [],
      }),
    })
    const res = await GET({} as any, makeCtx('abc'))
    expect(res.status).toBe(404)
  })

  it('returns options without encryptedTokens', async () => {
    mockGet.mockResolvedValue({
      exists: true,
      data: () => ({
        orgId: 'org-1',
        expiresAt: { toDate: () => new Date(Date.now() + 60000) },
        platform: 'linkedin',
        options: [
          {
            index: 0,
            displayName: 'Peet Stander',
            username: 'peetstander',
            avatarUrl: 'https://example.com/avatar.jpg',
            profileUrl: 'https://linkedin.com/in/peetstander',
            accountType: 'personal',
            platformAccountId: 'li-123456',
            platformMeta: { headline: 'CEO at Partners in Biz' },
            encryptedTokens: { accessToken: 'secret', iv: 'iv', tag: 'tag' },
          },
        ],
      }),
    })
    const res = await GET({} as any, makeCtx('abc'))
    expect(res.status).toBe(200)
    const body = res.json()
    expect(body.data.options[0].encryptedTokens).toBeUndefined()
    expect(body.data.options[0].displayName).toBe('Peet Stander')
    expect(body.data.platform).toBe('linkedin')
    expect(body.data.options[0].username).toBe('peetstander')
    expect(body.data.options[0].avatarUrl).toBe('https://example.com/avatar.jpg')
    expect(body.data.options[0].profileUrl).toBe('https://linkedin.com/in/peetstander')
    expect(body.data.options[0].platformAccountId).toBe('li-123456')
    expect(body.data.options[0].platformMeta).toEqual({ headline: 'CEO at Partners in Biz' })
  })
})
