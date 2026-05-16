// __tests__/app/api/v1/ads/connections/authorize.test.ts
import { POST } from '@/app/api/v1/ads/connections/[platform]/authorize/route'

jest.mock('@/lib/api/auth', () => ({ withAuth: (_r: string, h: any) => h }))

const mockSet = jest.fn().mockResolvedValue(undefined)
jest.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: () => ({
      doc: () => ({ set: mockSet }),
    }),
  },
}))

beforeEach(() => {
  mockSet.mockClear()
  process.env.FACEBOOK_CLIENT_ID = '133722058771742'
  process.env.NEXT_PUBLIC_APP_URL = 'https://partnersinbiz.online'
})

function makeReq(orgId: string) {
  return new Request('http://x', {
    method: 'POST',
    headers: { 'X-Org-Id': orgId, 'Content-Type': 'application/json' },
  })
}

describe('POST /api/v1/ads/connections/[platform]/authorize', () => {
  it('returns the Meta dialog URL + a server-issued state token', async () => {
    const res = await POST(
      makeReq('org_1') as any,
      { role: 'admin' } as any,
      { params: Promise.resolve({ platform: 'meta' }) } as any,
    )
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.authorizeUrl).toContain('https://www.facebook.com/v25.0/dialog/oauth')
    expect(body.data.state).toMatch(/^[a-f0-9]{32}$/)
  })

  it('rejects unknown platform with 400', async () => {
    const res = await POST(
      makeReq('org_1') as any,
      { role: 'admin' } as any,
      { params: Promise.resolve({ platform: 'twitter' }) } as any,
    )
    expect(res.status).toBe(400)
  })

  it('rejects google/linkedin/tiktok with 501 in Phase 1', async () => {
    const res = await POST(
      makeReq('org_1') as any,
      { role: 'admin' } as any,
      { params: Promise.resolve({ platform: 'google' }) } as any,
    )
    expect(res.status).toBe(501)
  })

  it('persists orgSlug from X-Org-Slug header into state doc', async () => {
    const req = new Request('http://x', {
      method: 'POST',
      headers: {
        'X-Org-Id': 'org_1',
        'X-Org-Slug': 'acme',
        'Content-Type': 'application/json',
      },
    })

    await POST(
      req as any,
      { role: 'admin' } as any,
      { params: Promise.resolve({ platform: 'meta' }) } as any,
    )

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: 'org_1',
        orgSlug: 'acme',
        platform: 'meta',
      }),
    )
  })
})
