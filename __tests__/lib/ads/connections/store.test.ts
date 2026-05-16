import {
  createConnection,
  getConnection,
  listConnections,
  updateConnection,
  deleteConnection,
} from '@/lib/ads/connections/store'

// Mock the firebase admin module to avoid live Firestore in tests
jest.mock('@/lib/firebase/admin', () => {
  const docs = new Map<string, Record<string, unknown>>()
  const collection = (path: string) => ({
    doc: (id: string) => ({
      get: async () => ({
        exists: docs.has(`${path}/${id}`),
        id,
        data: () => docs.get(`${path}/${id}`),
      }),
      set: async (data: Record<string, unknown>) => {
        docs.set(`${path}/${id}`, { ...data })
      },
      update: async (patch: Record<string, unknown>) => {
        const cur = docs.get(`${path}/${id}`) ?? {}
        docs.set(`${path}/${id}`, { ...cur, ...patch })
      },
      delete: async () => {
        docs.delete(`${path}/${id}`)
      },
    }),
    where: function chainableWhere() {
      const queryObj: { where: typeof chainableWhere; get: () => Promise<{ docs: Array<{ id: string; data: () => Record<string, unknown> }> }> } = {
        where: chainableWhere,
        get: async () => ({
          docs: Array.from(docs.entries())
            .filter(([k]) => k.startsWith(`${path}/`))
            .map(([k, v]) => ({ id: k.replace(`${path}/`, ''), data: () => v as Record<string, unknown> })),
        }),
      }
      return queryObj
    },
  })
  return {
    adminDb: { collection },
    _docs: docs,
  }
})

process.env.SOCIAL_TOKEN_MASTER_KEY =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

describe('connections store', () => {
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { _docs } = require('@/lib/firebase/admin') as { _docs: Map<string, unknown> }
    _docs.clear()
  })

  it('roundtrips a connection with encrypted tokens', async () => {
    const created = await createConnection({
      orgId: 'org_1',
      platform: 'meta',
      userId: 'meta_user_123',
      scopes: ['ads_management'],
      accessToken: 'EAAO_long',
      expiresInSeconds: 5184000,
      adAccounts: [{ id: 'act_42', name: 'X', currency: 'USD', timezone: 'UTC' }],
    })

    expect(created.id).toBeTruthy()
    expect(created.accessTokenEnc).toBeDefined()
    expect(JSON.stringify(created.accessTokenEnc)).not.toContain('EAAO_long')

    const fetched = await getConnection({ orgId: 'org_1', platform: 'meta' })
    expect(fetched?.id).toBe(created.id)
  })

  it("listConnections returns the org's connections", async () => {
    await createConnection({
      orgId: 'org_1',
      platform: 'meta',
      userId: 'u1',
      scopes: [],
      accessToken: 't1',
      expiresInSeconds: 3600,
      adAccounts: [],
    })
    const list = await listConnections({ orgId: 'org_1' })
    expect(list).toHaveLength(1)
    expect(list[0].platform).toBe('meta')
  })

  it('updateConnection patches fields', async () => {
    const c = await createConnection({
      orgId: 'org_1',
      platform: 'meta',
      userId: 'u1',
      scopes: [],
      accessToken: 't1',
      expiresInSeconds: 3600,
      adAccounts: [],
    })
    await updateConnection(c.id, { defaultAdAccountId: 'act_42' })
    const fetched = await getConnection({ orgId: 'org_1', platform: 'meta' })
    expect(fetched?.defaultAdAccountId).toBe('act_42')
  })

  it('deleteConnection removes the doc', async () => {
    const c = await createConnection({
      orgId: 'org_1',
      platform: 'meta',
      userId: 'u1',
      scopes: [],
      accessToken: 't1',
      expiresInSeconds: 3600,
      adAccounts: [],
    })
    await deleteConnection(c.id)
    const fetched = await getConnection({ orgId: 'org_1', platform: 'meta' })
    expect(fetched).toBeNull()
  })
})
