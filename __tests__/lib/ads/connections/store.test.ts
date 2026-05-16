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

  function makeQuery(path: string, filters: Array<[string, string, unknown]> = []) {
    return {
      where: (field: string, op: string, value: unknown) =>
        makeQuery(path, [...filters, [field, op, value]]),
      get: async () => ({
        docs: Array.from(docs.entries())
          .filter(([k]) => k.startsWith(`${path}/`))
          .filter(([, data]) =>
            filters.every(([field, op, value]) => {
              if (op !== '==') return true
              // Tolerate dot paths if ever used (not needed for store today)
              return (data as Record<string, unknown>)[field] === value
            }),
          )
          .map(([k, v]) => ({ id: k.replace(`${path}/`, ''), data: () => v })),
      }),
    }
  }

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
    where: (field: string, op: string, value: unknown) => makeQuery(path, [[field, op, value]]),
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

  it('isolates connections by orgId — does not leak across tenants', async () => {
    await createConnection({
      orgId: 'org_1',
      platform: 'meta',
      userId: 'u1',
      scopes: [],
      accessToken: 'token_1',
      expiresInSeconds: 3600,
      adAccounts: [{ id: 'act_1', name: 'Org 1 Account', currency: 'USD', timezone: 'UTC' }],
    })
    await createConnection({
      orgId: 'org_2',
      platform: 'meta',
      userId: 'u2',
      scopes: [],
      accessToken: 'token_2',
      expiresInSeconds: 3600,
      adAccounts: [{ id: 'act_2', name: 'Org 2 Account', currency: 'USD', timezone: 'UTC' }],
    })

    const conn1 = await getConnection({ orgId: 'org_1', platform: 'meta' })
    const conn2 = await getConnection({ orgId: 'org_2', platform: 'meta' })

    expect(conn1?.adAccounts[0].id).toBe('act_1')
    expect(conn2?.adAccounts[0].id).toBe('act_2')

    const list1 = await listConnections({ orgId: 'org_1' })
    expect(list1).toHaveLength(1)
    expect(list1[0].userId).toBe('u1')
  })
})
