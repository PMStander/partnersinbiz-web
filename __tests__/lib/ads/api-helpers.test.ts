// __tests__/lib/ads/api-helpers.test.ts
import { requireMetaContext } from '@/lib/ads/api-helpers'

jest.mock('@/lib/ads/connections/store', () => ({
  getConnection: jest.fn(),
  decryptAccessToken: jest.fn(),
}))

const store = jest.requireMock('@/lib/ads/connections/store')

beforeEach(() => jest.clearAllMocks())

function makeReq(orgId?: string) {
  const headers: Record<string, string> = {}
  if (orgId) headers['X-Org-Id'] = orgId
  return new Request('http://x', { headers }) as any
}

describe('requireMetaContext', () => {
  it('returns 400 when X-Org-Id header is missing', async () => {
    const result = await requireMetaContext(makeReq())
    expect(result).toBeInstanceOf(Response)
    const body = await (result as Response).json()
    expect((result as Response).status).toBe(400)
    expect(body.error).toMatch(/X-Org-Id/)
  })

  it('returns 404 when no connection exists for the org', async () => {
    store.getConnection.mockResolvedValueOnce(null)
    const result = await requireMetaContext(makeReq('org_1'))
    expect(result).toBeInstanceOf(Response)
    expect((result as Response).status).toBe(404)
  })

  it('returns 400 when connection has no defaultAdAccountId', async () => {
    store.getConnection.mockResolvedValueOnce({ id: 'conn_1', orgId: 'org_1' })
    const result = await requireMetaContext(makeReq('org_1'))
    expect(result).toBeInstanceOf(Response)
    expect((result as Response).status).toBe(400)
    const body = await (result as Response).json()
    expect(body.error).toMatch(/default ad account/)
  })

  it('returns MetaContext with decrypted token when connection is valid', async () => {
    const conn = { id: 'conn_1', orgId: 'org_1', defaultAdAccountId: 'act_42', accessTokenEnc: {} }
    store.getConnection.mockResolvedValueOnce(conn)
    store.decryptAccessToken.mockReturnValueOnce('decrypted_token')

    const result = await requireMetaContext(makeReq('org_1'))
    expect(result).not.toBeInstanceOf(Response)
    const ctx = result as Awaited<ReturnType<typeof requireMetaContext>>
    if (ctx instanceof Response) throw new Error('should not be Response')
    expect(ctx.orgId).toBe('org_1')
    expect(ctx.accessToken).toBe('decrypted_token')
    expect(ctx.adAccountId).toBe('act_42')
    expect(ctx.connection).toBe(conn)
  })
})
