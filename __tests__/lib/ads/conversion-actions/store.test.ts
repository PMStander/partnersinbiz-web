// __tests__/lib/ads/conversion-actions/store.test.ts
// Tests for the canonical Conversion Actions Firestore store.
// Sub-3a Phase 6 Batch 3 E

import {
  createConversionAction,
  getConversionAction,
  listConversionActions,
  updateConversionAction,
  deleteConversionAction,
} from '@/lib/ads/conversion-actions/store'

// ─── In-memory Firestore mock ─────────────────────────────────────────────────

const docs = new Map<string, Record<string, unknown>>()
let docCounter = 0

function makeQuery(path: string, filters: Array<[string, string, unknown]> = []) {
  return {
    where: (field: string, op: string, value: unknown) =>
      makeQuery(path, [...filters, [field, op, value]]),
    get: async () => ({
      docs: Array.from(docs.entries())
        .filter(([k]) => k.startsWith(`${path}/`))
        .filter(([, data]) =>
          filters.every(([field, , value]) => (data as Record<string, unknown>)[field] === value),
        )
        .map(([, v]) => ({ data: () => v })),
    }),
  }
}

const mockServerTimestamp = { seconds: 9999, nanoseconds: 0 }

jest.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: (path: string) => ({
      doc: (id?: string) => {
        const docId = id ?? `auto-${++docCounter}`
        const fullKey = `${path}/${docId}`
        return {
          id: docId,
          get: async () => ({
            exists: docs.has(fullKey),
            data: () => docs.get(fullKey),
          }),
          set: async (data: Record<string, unknown>) => {
            docs.set(fullKey, { ...data })
          },
          update: async (patch: Record<string, unknown>) => {
            const cur = docs.get(fullKey) ?? {}
            docs.set(fullKey, { ...cur, ...patch })
          },
          delete: async () => {
            docs.delete(fullKey)
          },
        }
      },
      where: (field: string, op: string, value: unknown) =>
        makeQuery(path, [[field, op, value]]),
    }),
  },
}))

jest.mock('firebase-admin/firestore', () => ({
  Timestamp: {
    now: () => ({ seconds: 1000, nanoseconds: 0 }),
  },
  FieldValue: {
    serverTimestamp: () => mockServerTimestamp,
  },
}))

// ─── Helpers ──────────────────────────────────────────────────────────────────

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    orgId: 'org-123',
    platform: 'google' as const,
    name: 'Test Purchase',
    category: 'PURCHASE' as const,
    valueSettings: { defaultValue: 100, defaultCurrencyCode: 'ZAR' },
    countingType: 'ONE_PER_CLICK' as const,
    ...overrides,
  }
}

beforeEach(() => {
  docs.clear()
  docCounter = 0
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('conversion-actions store', () => {
  it('creates a conversion action and returns it with id + timestamps', async () => {
    const action = await createConversionAction(baseInput())

    expect(action.id).toBeTruthy()
    expect(action.orgId).toBe('org-123')
    expect(action.name).toBe('Test Purchase')
    expect(action.platform).toBe('google')
    expect(action.category).toBe('PURCHASE')
    expect(action.createdAt).toBeDefined()
    expect(action.updatedAt).toBeDefined()
  })

  it('retrieves a created action by id', async () => {
    const created = await createConversionAction(baseInput())
    const fetched = await getConversionAction(created.id)

    expect(fetched).not.toBeNull()
    expect(fetched!.id).toBe(created.id)
    expect(fetched!.name).toBe('Test Purchase')
  })

  it('returns null for a non-existent action id', async () => {
    const result = await getConversionAction('nonexistent-id')
    expect(result).toBeNull()
  })

  it('lists all actions for an org', async () => {
    await createConversionAction(baseInput({ name: 'Action A' }))
    await createConversionAction(baseInput({ name: 'Action B' }))
    await createConversionAction(baseInput({ orgId: 'other-org', name: 'Other Org Action' }))

    const actions = await listConversionActions({ orgId: 'org-123' })
    expect(actions).toHaveLength(2)
    const names = actions.map((a) => a.name)
    expect(names).toContain('Action A')
    expect(names).toContain('Action B')
  })

  it('filters list by platform', async () => {
    await createConversionAction(baseInput({ platform: 'google', name: 'Google Action' }))
    await createConversionAction(baseInput({ platform: 'meta', name: 'Meta Action' }))

    const google = await listConversionActions({ orgId: 'org-123', platform: 'google' })
    expect(google).toHaveLength(1)
    expect(google[0].name).toBe('Google Action')

    const meta = await listConversionActions({ orgId: 'org-123', platform: 'meta' })
    expect(meta).toHaveLength(1)
    expect(meta[0].name).toBe('Meta Action')
  })

  it('filters list by category', async () => {
    await createConversionAction(baseInput({ category: 'PURCHASE', name: 'Purchase' }))
    await createConversionAction(baseInput({ category: 'LEAD', name: 'Lead' }))

    const leads = await listConversionActions({ orgId: 'org-123', category: 'LEAD' })
    expect(leads).toHaveLength(1)
    expect(leads[0].name).toBe('Lead')
  })

  it('updates allowed fields and bumps updatedAt', async () => {
    const created = await createConversionAction(baseInput())
    const updated = await updateConversionAction(created.id, { name: 'Renamed Action' })

    expect(updated.name).toBe('Renamed Action')
    // updatedAt should be the serverTimestamp sentinel
    expect(updated.updatedAt).toEqual(mockServerTimestamp)
  })

  it('deletes a conversion action', async () => {
    const created = await createConversionAction(baseInput())
    await deleteConversionAction(created.id)

    const fetched = await getConversionAction(created.id)
    expect(fetched).toBeNull()
  })
})
