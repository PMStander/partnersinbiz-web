// __tests__/lib/ads/merchant-center/store.test.ts
//
// Unit tests for lib/ads/merchant-center/store.ts. Uses an in-memory Firestore
// mock (same pattern as __tests__/lib/ads/connections/store.test.ts).
import {
  createMerchantCenter,
  getMerchantCenter,
  listMerchantCenters,
  updateMerchantCenter,
  deleteMerchantCenter,
} from '@/lib/ads/merchant-center/store'

// ---------------------------------------------------------------------------
// In-memory Firestore mock
// ---------------------------------------------------------------------------
const docs = new Map<string, Record<string, unknown>>()

function makeQuery(path: string, filters: Array<[string, string, unknown]> = [], order?: string) {
  return {
    where: (field: string, op: string, value: unknown) =>
      makeQuery(path, [...filters, [field, op, value]], order),
    orderBy: (field: string) => makeQuery(path, filters, field),
    get: async () => ({
      docs: Array.from(docs.entries())
        .filter(([k]) => k.startsWith(`${path}/`))
        .filter(([, data]) =>
          filters.every(([field, , value]) => (data as Record<string, unknown>)[field] === value),
        )
        .map(([k, v]) => ({ id: k.replace(`${path}/`, ''), data: () => v })),
    }),
  }
}

jest.mock('@/lib/firebase/admin', () => {
  let docIdCounter = 0
  const collection = (path: string) => ({
    doc: (id?: string) => {
      const resolvedId = id ?? `auto_${++docIdCounter}`
      const key = `${path}/${resolvedId}`
      return {
        id: resolvedId,
        get: async () => ({
          exists: docs.has(key),
          data: () => docs.get(key),
        }),
        set: async (data: Record<string, unknown>) => {
          docs.set(key, { ...data })
        },
        update: async (patch: Record<string, unknown>) => {
          const cur = docs.get(key) ?? {}
          docs.set(key, { ...cur, ...patch })
        },
        delete: async () => {
          docs.delete(key)
        },
      }
    },
    where: (field: string, op: string, value: unknown) =>
      makeQuery(path, [[field, op, value]]),
  })
  return { adminDb: { collection } }
})

// Mock FieldValue.serverTimestamp() and Timestamp.now()
jest.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: () => ({ _methodName: 'serverTimestamp' }),
  },
  Timestamp: {
    now: () => ({ seconds: 1700000000, nanoseconds: 0 }),
  },
}))

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => docs.clear())

const BASE_INPUT = {
  orgId: 'org_1',
  merchantId: '123456789',
  accessTokenRef: '{"ciphertext":"abc","iv":"iv1","tag":"tag1"}',
  refreshTokenRef: '{"ciphertext":"def","iv":"iv2","tag":"tag2"}',
  feedLabels: ['US', 'CA'],
}

describe('createMerchantCenter', () => {
  it('persists and returns a document with id + timestamps', async () => {
    const mc = await createMerchantCenter(BASE_INPUT)
    expect(mc.id).toBeTruthy()
    expect(mc.orgId).toBe('org_1')
    expect(mc.merchantId).toBe('123456789')
    expect(mc.feedLabels).toEqual(['US', 'CA'])
    expect(mc.createdAt).toBeDefined()
    expect(mc.updatedAt).toBeDefined()
  })

  it('stores the doc so getMerchantCenter can retrieve it', async () => {
    const created = await createMerchantCenter(BASE_INPUT)
    const fetched = await getMerchantCenter(created.id)
    expect(fetched?.id).toBe(created.id)
    expect(fetched?.merchantId).toBe('123456789')
  })
})

describe('getMerchantCenter', () => {
  it('returns null for a non-existent id', async () => {
    const result = await getMerchantCenter('does_not_exist')
    expect(result).toBeNull()
  })
})

describe('listMerchantCenters', () => {
  it('returns all bindings for an org, empty for unknown org', async () => {
    await createMerchantCenter(BASE_INPUT)
    await createMerchantCenter({ ...BASE_INPUT, merchantId: '987654321' })

    const results = await listMerchantCenters({ orgId: 'org_1' })
    expect(results).toHaveLength(2)

    const emptyResults = await listMerchantCenters({ orgId: 'org_other' })
    expect(emptyResults).toHaveLength(0)
  })
})

describe('updateMerchantCenter', () => {
  it('patches primaryFeedId and updates updatedAt', async () => {
    const mc = await createMerchantCenter(BASE_INPUT)
    const updated = await updateMerchantCenter(mc.id, { primaryFeedId: 'US' })
    expect(updated.primaryFeedId).toBe('US')
    // updatedAt is set by serverTimestamp sentinel in real Firestore;
    // in our mock it's the sentinel object — just verify it's present
    expect(updated.updatedAt).toBeDefined()
  })
})

describe('deleteMerchantCenter', () => {
  it('removes the doc so getMerchantCenter returns null', async () => {
    const mc = await createMerchantCenter(BASE_INPUT)
    await deleteMerchantCenter(mc.id)
    const fetched = await getMerchantCenter(mc.id)
    expect(fetched).toBeNull()
  })
})
