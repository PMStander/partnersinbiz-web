// __tests__/lib/ads/keywords/store.test.ts
// Unit tests for the canonical ad_keywords Firestore store helpers.

import {
  createKeyword,
  getKeyword,
  listKeywords,
  updateKeyword,
  deleteKeyword,
} from '@/lib/ads/keywords/store'

// In-memory Firestore mock — mirrors the ads/store test pattern.
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
            filters.every(([field, , value]) => {
              return (data as Record<string, unknown>)[field] === value
            }),
          )
          .map(([, v]) => ({ data: () => v })),
      }),
    }
  }

  const collection = (path: string) => ({
    doc: (id?: string) => {
      const resolvedId = id ?? `auto_${Math.random().toString(36).slice(2)}`
      return {
        id: resolvedId,
        get: async () => ({
          exists: docs.has(`${path}/${resolvedId}`),
          data: () => docs.get(`${path}/${resolvedId}`),
        }),
        set: async (data: Record<string, unknown>) => {
          docs.set(`${path}/${resolvedId}`, { ...data })
        },
        update: async (patch: Record<string, unknown>) => {
          const cur = docs.get(`${path}/${resolvedId}`) ?? {}
          docs.set(`${path}/${resolvedId}`, { ...cur, ...patch })
        },
        delete: async () => {
          docs.delete(`${path}/${resolvedId}`)
        },
      }
    },
    where: (field: string, op: string, value: unknown) =>
      makeQuery(path, [[field, op, value]]),
  })

  return {
    adminDb: { collection },
    _docs: docs,
  }
})

// FieldValue.serverTimestamp() stub — returns a plain object so update() merges cleanly.
jest.mock('firebase-admin/firestore', () => ({
  Timestamp: {
    now: () => ({ seconds: 1_700_000_000, nanoseconds: 0 }),
  },
  FieldValue: {
    serverTimestamp: () => ({ _serverTimestamp: true }),
  },
}))

const BASE_INPUT = {
  orgId: 'org_1',
  campaignId: 'cmp_abc',
  adSetId: 'ads_xyz',
  text: 'running shoes',
  matchType: 'BROAD' as const,
  negativeKeyword: false,
}

describe('ad_keywords store', () => {
  beforeEach(() => {
    const { _docs } = jest.requireMock('@/lib/firebase/admin') as {
      _docs: Map<string, unknown>
    }
    _docs.clear()
  })

  it('createKeyword persists doc with id, defaults status=ACTIVE', async () => {
    const kw = await createKeyword(BASE_INPUT)

    expect(typeof kw.id).toBe('string')
    expect(kw.orgId).toBe('org_1')
    expect(kw.campaignId).toBe('cmp_abc')
    expect(kw.adSetId).toBe('ads_xyz')
    expect(kw.text).toBe('running shoes')
    expect(kw.matchType).toBe('BROAD')
    expect(kw.status).toBe('ACTIVE')
    expect(kw.negativeKeyword).toBe(false)
    expect(kw.createdAt).toBeDefined()
    expect(kw.updatedAt).toBeDefined()
  })

  it('getKeyword returns null for unknown id', async () => {
    const result = await getKeyword('does_not_exist')
    expect(result).toBeNull()
  })

  it('createKeyword + getKeyword roundtrip', async () => {
    const kw = await createKeyword({ ...BASE_INPUT, cpcBidMicros: '500000' })
    const fetched = await getKeyword(kw.id)

    expect(fetched).not.toBeNull()
    expect(fetched!.text).toBe('running shoes')
    expect(fetched!.cpcBidMicros).toBe('500000')
  })

  it('listKeywords filters by orgId + adSetId', async () => {
    await createKeyword({ ...BASE_INPUT, adSetId: 'ads_aaa' })
    await createKeyword({ ...BASE_INPUT, adSetId: 'ads_bbb' })
    await createKeyword({ ...BASE_INPUT, orgId: 'org_2', adSetId: 'ads_aaa' })

    const result = await listKeywords({ orgId: 'org_1', adSetId: 'ads_aaa' })
    expect(result).toHaveLength(1)
    expect(result[0].adSetId).toBe('ads_aaa')
    expect(result[0].orgId).toBe('org_1')
  })

  it('listKeywords filters by negativeKeyword flag', async () => {
    await createKeyword({ ...BASE_INPUT, negativeKeyword: false })
    await createKeyword({ ...BASE_INPUT, negativeKeyword: true })

    const negatives = await listKeywords({ orgId: 'org_1', negativeKeyword: true })
    expect(negatives).toHaveLength(1)
    expect(negatives[0].negativeKeyword).toBe(true)

    const positives = await listKeywords({ orgId: 'org_1', negativeKeyword: false })
    expect(positives).toHaveLength(1)
    expect(positives[0].negativeKeyword).toBe(false)
  })

  it('updateKeyword patches fields and returns updated doc', async () => {
    const kw = await createKeyword(BASE_INPUT)
    const updated = await updateKeyword(kw.id, { status: 'PAUSED', text: 'trail shoes' })

    expect(updated.status).toBe('PAUSED')
    expect(updated.text).toBe('trail shoes')
  })

  it('deleteKeyword removes the doc so getKeyword returns null', async () => {
    const kw = await createKeyword(BASE_INPUT)
    await deleteKeyword(kw.id)
    const fetched = await getKeyword(kw.id)
    expect(fetched).toBeNull()
  })
})
