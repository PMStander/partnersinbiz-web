import { POST } from '@/app/api/v1/crm/contacts/import/route'
import { NextRequest } from 'next/server'

jest.mock('@/lib/firebase/admin', () => ({
  adminAuth: { verifyIdToken: jest.fn(), verifySessionCookie: jest.fn() },
  adminDb: {
    collection: jest.fn(),
    batch: jest.fn(),
  },
}))

jest.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: () => '__SERVER_TIMESTAMP__',
    increment: (n: number) => ({ __increment: n }),
  },
}))

import { adminDb } from '@/lib/firebase/admin'

process.env.AI_API_KEY = 'test-key'

function makeReq(body: unknown) {
  return new NextRequest('http://localhost/api/v1/crm/contacts/import', {
    method: 'POST',
    headers: {
      authorization: 'Bearer test-key',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

interface MockBatch {
  set: jest.Mock
  update: jest.Mock
  commit: jest.Mock
}

interface MockState {
  // captured operations
  batches: MockBatch[]
  // capture_sources doc lookups
  captureSourceDoc?: {
    exists: boolean
    data?: Record<string, unknown>
  }
  captureSourceRefUpdate: jest.Mock
  // contacts collection
  existingByEmail: Map<string, { id: string; data: Record<string, unknown> }>
  // capture refs created (for new contacts)
  contactDocRefs: Array<{ id: string }>
  // tracking
  contactDocCounter: number
}

let state: MockState

beforeEach(() => {
  state = {
    batches: [],
    captureSourceDoc: { exists: false },
    captureSourceRefUpdate: jest.fn().mockResolvedValue(undefined),
    existingByEmail: new Map(),
    contactDocRefs: [],
    contactDocCounter: 0,
  }

  ;(adminDb.collection as jest.Mock).mockImplementation((name: string) => {
    if (name === 'capture_sources') {
      return {
        doc: jest.fn().mockImplementation(() => ({
          get: jest.fn().mockResolvedValue({
            exists: state.captureSourceDoc!.exists,
            data: () => state.captureSourceDoc!.data ?? {},
            ref: { update: state.captureSourceRefUpdate },
          }),
        })),
      }
    }
    if (name === 'contacts') {
      return {
        where: jest.fn().mockImplementation(function whereImpl(this: unknown, _field: string, _op: string, _value: unknown) {
          return {
            where: jest.fn().mockImplementation((field2: string, op2: string, value2: unknown) => {
              return {
                get: jest.fn().mockImplementation(async () => {
                  // We expect: orgId == X then email in [emails]
                  if (field2 === 'email' && op2 === 'in' && Array.isArray(value2)) {
                    const docs = (value2 as string[])
                      .map((email) => state.existingByEmail.get(email))
                      .filter((v): v is { id: string; data: Record<string, unknown> } => !!v)
                      .map((entry) => ({
                        id: entry.id,
                        data: () => entry.data,
                        ref: {
                          id: entry.id,
                          __kind: 'existing-contact',
                        },
                      }))
                    return { docs }
                  }
                  return { docs: [] }
                }),
              }
            }),
          }
        }),
        doc: jest.fn().mockImplementation(() => {
          state.contactDocCounter += 1
          const ref = { id: `new-contact-${state.contactDocCounter}`, __kind: 'new-contact' }
          state.contactDocRefs.push(ref)
          return ref
        }),
      }
    }
    return {}
  })

  ;(adminDb.batch as jest.Mock).mockImplementation(() => {
    const b: MockBatch = {
      set: jest.fn(),
      update: jest.fn(),
      commit: jest.fn().mockResolvedValue(undefined),
    }
    state.batches.push(b)
    return b
  })
})

function totalBatchOps(): { sets: number; updates: number } {
  let sets = 0
  let updates = 0
  for (const b of state.batches) {
    sets += b.set.mock.calls.length
    updates += b.update.mock.calls.length
  }
  return { sets, updates }
}

describe('POST /api/v1/crm/contacts/import', () => {
  it('rejects missing orgId', async () => {
    const res = await POST(
      makeReq({ rows: [{ email: 'a@b.com' }] }),
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/orgId/i)
  })

  it('rejects empty rows', async () => {
    const res = await POST(makeReq({ orgId: 'org-1', rows: [] }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/empty|array/i)
  })

  it('rejects rows that are not an array', async () => {
    const res = await POST(makeReq({ orgId: 'org-1', rows: 'nope' }))
    expect(res.status).toBe(400)
  })

  it('reports invalid rows with reasons but processes valid ones', async () => {
    const res = await POST(
      makeReq({
        orgId: 'org-1',
        rows: [
          { email: 'good@example.com', name: 'Good' },
          { email: 'not-an-email' },
          { email: '' },
          {},
        ],
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.created).toBe(1)
    expect(body.data.skipped).toBe(3)
    expect(body.data.invalidRows).toHaveLength(3)
    const reasons = body.data.invalidRows.map((r: { reason: string }) => r.reason)
    expect(reasons).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/invalid/i),
        expect.stringMatching(/required/i),
      ]),
    )
  })

  it('dryRun mode does not call batch set or update', async () => {
    const res = await POST(
      makeReq({
        orgId: 'org-1',
        dryRun: true,
        rows: [
          { email: 'a@example.com', name: 'A' },
          { email: 'b@example.com', name: 'B' },
        ],
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.created).toBe(2)
    expect(body.data.updated).toBe(0)
    expect(body.data.previewSample).toBeDefined()
    expect(body.data.previewSample.length).toBeGreaterThan(0)
    // No batch operations should have happened
    expect(state.batches.length).toBe(0)
    expect(state.captureSourceRefUpdate).not.toHaveBeenCalled()
  })

  it('creates new contacts with import metadata', async () => {
    const res = await POST(
      makeReq({
        orgId: 'org-1',
        rows: [{ email: 'new@example.com', name: 'New', company: 'Acme', phone: '555' }],
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.created).toBe(1)
    expect(body.data.updated).toBe(0)

    // Check the set call payload
    const sets = state.batches.flatMap((b) => b.set.mock.calls)
    expect(sets).toHaveLength(1)
    const [, payload] = sets[0]
    expect(payload).toMatchObject({
      orgId: 'org-1',
      email: 'new@example.com',
      name: 'New',
      company: 'Acme',
      phone: '555',
      source: 'import',
      type: 'lead',
      stage: 'new',
      capturedFromId: '',
    })
    expect(payload.subscribedAt).toBe('__SERVER_TIMESTAMP__')
    expect(payload.unsubscribedAt).toBeNull()
    expect(payload.deleted).toBe(false)
  })

  it('merges tags onto existing contacts instead of duplicating', async () => {
    state.existingByEmail.set('exists@example.com', {
      id: 'existing-1',
      data: {
        orgId: 'org-1',
        email: 'exists@example.com',
        name: 'Already Here',
        tags: ['old-tag'],
      },
    })

    const res = await POST(
      makeReq({
        orgId: 'org-1',
        rows: [
          { email: 'exists@example.com', name: 'IGNORED', tags: ['fresh'] },
          { email: 'brand-new@example.com', name: 'New' },
        ],
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.created).toBe(1)
    expect(body.data.updated).toBe(1)

    const ops = totalBatchOps()
    expect(ops.sets).toBe(1) // brand-new contact
    expect(ops.updates).toBe(1) // existing contact tag merge

    // Verify update payload merges tags
    const updateCalls = state.batches.flatMap((b) => b.update.mock.calls)
    expect(updateCalls).toHaveLength(1)
    const [, updatePayload] = updateCalls[0]
    expect(updatePayload.tags).toEqual(expect.arrayContaining(['old-tag', 'fresh']))
    expect(updatePayload.tags).toHaveLength(2)
    // Crucially, name is NOT in the update payload
    expect(updatePayload).not.toHaveProperty('name')
    expect(updatePayload).not.toHaveProperty('company')
  })

  it('skips no-op tag merges (existing contact with all tags already present)', async () => {
    state.existingByEmail.set('exists@example.com', {
      id: 'existing-1',
      data: {
        orgId: 'org-1',
        email: 'exists@example.com',
        tags: ['already-here'],
      },
    })

    const res = await POST(
      makeReq({
        orgId: 'org-1',
        rows: [{ email: 'exists@example.com', tags: ['already-here'] }],
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.created).toBe(0)
    expect(body.data.updated).toBe(0)
    expect(state.batches.length).toBe(0)
  })

  it('applies capture source autoTags and bumps capturedCount by created count only', async () => {
    state.captureSourceDoc = {
      exists: true,
      data: { orgId: 'org-1', autoTags: ['auto-1', 'auto-2'] },
    }
    state.existingByEmail.set('exists@example.com', {
      id: 'existing-1',
      data: { orgId: 'org-1', email: 'exists@example.com', tags: [] },
    })

    const res = await POST(
      makeReq({
        orgId: 'org-1',
        capturedFromId: 'src-1',
        rows: [
          { email: 'exists@example.com' }, // update
          { email: 'new1@example.com' },   // create
          { email: 'new2@example.com' },   // create
        ],
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.created).toBe(2)
    expect(body.data.updated).toBe(1)

    // Capturecount should bump by 2 (created), not 3
    expect(state.captureSourceRefUpdate).toHaveBeenCalledTimes(1)
    const [bumpPayload] = state.captureSourceRefUpdate.mock.calls[0]
    expect(bumpPayload.capturedCount).toEqual({ __increment: 2 })

    // New contacts should have autoTags applied
    const sets = state.batches.flatMap((b) => b.set.mock.calls)
    expect(sets).toHaveLength(2)
    for (const [, payload] of sets) {
      expect(payload.tags).toEqual(expect.arrayContaining(['auto-1', 'auto-2']))
      expect(payload.capturedFromId).toBe('src-1')
    }
  })

  it('ignores capture source from a different org', async () => {
    state.captureSourceDoc = {
      exists: true,
      data: { orgId: 'org-OTHER', autoTags: ['auto-1'] },
    }

    const res = await POST(
      makeReq({
        orgId: 'org-1',
        capturedFromId: 'src-1',
        rows: [{ email: 'a@example.com' }],
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.created).toBe(1)
    expect(state.captureSourceRefUpdate).not.toHaveBeenCalled()

    const sets = state.batches.flatMap((b) => b.set.mock.calls)
    const [, payload] = sets[0]
    expect(payload.capturedFromId).toBe('')
    expect(payload.tags).not.toContain('auto-1')
  })

  it('rejects more than 5000 rows', async () => {
    const rows = Array.from({ length: 5001 }, (_, i) => ({
      email: `r${i}@example.com`,
    }))
    const res = await POST(makeReq({ orgId: 'org-1', rows }))
    expect(res.status).toBe(400)
  })

  it('treats duplicate emails inside the same payload as invalid', async () => {
    const res = await POST(
      makeReq({
        orgId: 'org-1',
        rows: [
          { email: 'dupe@example.com' },
          { email: 'dupe@example.com' },
        ],
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.created).toBe(1)
    expect(body.data.skipped).toBe(1)
    expect(body.data.invalidRows[0].reason).toMatch(/duplicate/i)
  })
})
