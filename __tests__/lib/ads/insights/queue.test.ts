import {
  enqueueRefresh,
  claimPendingJobs,
  markJobDone,
  markJobFailed,
  type RefreshJob,
} from '@/lib/ads/insights/queue'

// ---------------------------------------------------------------------------
// Minimal chainable-where Firestore mock (same pattern as connections/store tests)
// Extended with: orderBy, limit, batch
// ---------------------------------------------------------------------------
jest.mock('@/lib/firebase/admin', () => {
  const docs = new Map<string, Record<string, unknown>>()

  // Track batch operations for atomic-claim verification
  const batchOps: Array<{ type: 'update' | 'set'; id: string; data: Record<string, unknown> }> = []

  function makeQuery(
    path: string,
    filters: Array<[string, string, unknown]> = [],
    _orderByField?: string,
    _limitN?: number,
  ) {
    return {
      where: (field: string, op: string, value: unknown) =>
        makeQuery(path, [...filters, [field, op, value]], _orderByField, _limitN),
      orderBy: (field: string) =>
        makeQuery(path, filters, field, _limitN),
      limit: (n: number) =>
        makeQuery(path, filters, _orderByField, n),
      get: async () => {
        let entries = Array.from(docs.entries())
          .filter(([k]) => k.startsWith(`${path}/`))
          .filter(([, data]) =>
            filters.every(([field, op, value]) => {
              if (op !== '==') return true
              return (data as Record<string, unknown>)[field] === value
            }),
          )
          .map(([k, v]) => ({
            id: k.replace(`${path}/`, ''),
            ref: {
              // Expose a ref that batch.update can target
              _path: k,
            },
            data: () => v,
          }))

        // Honour orderBy (ascending by the given field, simple string compare)
        if (_orderByField) {
          entries = entries.sort((a, b) => {
            const av = (a.data() as Record<string, unknown>)[_orderByField] ?? ''
            const bv = (b.data() as Record<string, unknown>)[_orderByField] ?? ''
            return String(av) < String(bv) ? -1 : String(av) > String(bv) ? 1 : 0
          })
        }

        // Honour limit
        if (_limitN !== undefined) {
          entries = entries.slice(0, _limitN)
        }

        return { docs: entries }
      },
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
    where: (field: string, op: string, value: unknown) =>
      makeQuery(path, [[field, op, value]]),
  })

  // Batch that replays recorded updates into the in-memory store
  const batch = () => {
    const ops: Array<{ ref: { _path: string }; patch: Record<string, unknown> }> = []
    return {
      update: (ref: { _path: string }, patch: Record<string, unknown>) => {
        ops.push({ ref, patch })
      },
      set: (ref: { _path: string }, data: Record<string, unknown>) => {
        batchOps.push({ type: 'set', id: ref._path, data })
      },
      commit: async () => {
        for (const op of ops) {
          const cur = docs.get(op.ref._path) ?? {}
          docs.set(op.ref._path, { ...cur, ...op.patch })
        }
      },
    }
  }

  return {
    adminDb: { collection, batch },
    _docs: docs,
    _batchOps: batchOps,
  }
})

// Minimal Timestamp shim
jest.mock('firebase-admin/firestore', () => ({
  Timestamp: {
    now: () => ({ toMillis: () => Date.now(), _isMock: true }),
    fromMillis: (ms: number) => ({ toMillis: () => ms }),
  },
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getStore() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('@/lib/firebase/admin') as {
    _docs: Map<string, Record<string, unknown>>
    _batchOps: unknown[]
  }
  return mod._docs
}

function clearStore() {
  getStore().clear()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('queue — enqueueRefresh', () => {
  beforeEach(clearStore)

  it('creates a pending job when none exists', async () => {
    const result = await enqueueRefresh({
      orgId: 'org1',
      pibEntityId: 'cmp_abc',
      metaObjectId: 'meta_cmp_abc',
      level: 'campaign',
    })
    expect(result).toEqual({ enqueued: true })
    const store = getStore()
    const doc = store.get('ad_refresh_jobs/cmp_abc_campaign')
    expect(doc).toBeDefined()
    expect(doc?.status).toBe('pending')
    expect(doc?.attempts).toBe(0)
    expect(doc?.orgId).toBe('org1')
    expect(doc?.level).toBe('campaign')
  })

  it('returns enqueued:false when a pending job already exists', async () => {
    // First enqueue
    await enqueueRefresh({
      orgId: 'org1',
      pibEntityId: 'cmp_dup',
      metaObjectId: 'meta_dup',
      level: 'adset',
    })
    // Second enqueue — same entity+level while still pending
    const result = await enqueueRefresh({
      orgId: 'org1',
      pibEntityId: 'cmp_dup',
      metaObjectId: 'meta_dup',
      level: 'adset',
    })
    expect(result).toEqual({ enqueued: false, existing: 'pending' })
  })

  it('returns enqueued:false when a running job exists', async () => {
    // Manually plant a running job
    const store = getStore()
    store.set('ad_refresh_jobs/cmp_run_campaign', {
      id: 'cmp_run_campaign',
      orgId: 'org1',
      pibEntityId: 'cmp_run',
      metaObjectId: 'meta_run',
      level: 'campaign',
      status: 'running',
      attempts: 1,
    })
    const result = await enqueueRefresh({
      orgId: 'org1',
      pibEntityId: 'cmp_run',
      metaObjectId: 'meta_run',
      level: 'campaign',
    })
    expect(result).toEqual({ enqueued: false, existing: 'running' })
  })

  it('re-enqueues when a prior job is done', async () => {
    // Plant a done job
    const store = getStore()
    store.set('ad_refresh_jobs/cmp_done_campaign', {
      id: 'cmp_done_campaign',
      orgId: 'org1',
      pibEntityId: 'cmp_done',
      metaObjectId: 'meta_done',
      level: 'campaign',
      status: 'done',
      attempts: 1,
    })
    const result = await enqueueRefresh({
      orgId: 'org1',
      pibEntityId: 'cmp_done',
      metaObjectId: 'meta_done',
      level: 'campaign',
    })
    expect(result).toEqual({ enqueued: true })
    // Status should be reset to pending
    const doc = store.get('ad_refresh_jobs/cmp_done_campaign')
    expect(doc?.status).toBe('pending')
    expect(doc?.attempts).toBe(0)
  })
})

describe('queue — claimPendingJobs', () => {
  beforeEach(clearStore)

  it('atomically claims pending jobs and marks them running', async () => {
    const store = getStore()
    // Plant 2 pending jobs
    const now = Date.now()
    store.set('ad_refresh_jobs/e1_campaign', {
      id: 'e1_campaign',
      orgId: 'org1',
      pibEntityId: 'e1',
      metaObjectId: 'meta_e1',
      level: 'campaign',
      status: 'pending',
      attempts: 0,
      createdAt: String(now),
    })
    store.set('ad_refresh_jobs/e2_campaign', {
      id: 'e2_campaign',
      orgId: 'org1',
      pibEntityId: 'e2',
      metaObjectId: 'meta_e2',
      level: 'campaign',
      status: 'pending',
      attempts: 0,
      createdAt: String(now + 1),
    })

    const claimed = await claimPendingJobs({ limit: 5 })
    expect(claimed).toHaveLength(2)

    // After batch commit, both docs should be running
    const d1 = store.get('ad_refresh_jobs/e1_campaign')
    const d2 = store.get('ad_refresh_jobs/e2_campaign')
    expect(d1?.status).toBe('running')
    expect(d2?.status).toBe('running')
    expect(d1?.attempts).toBe(1)
    expect(d2?.attempts).toBe(1)
  })

  it('respects the limit parameter', async () => {
    const store = getStore()
    const now = Date.now()
    for (let i = 0; i < 5; i++) {
      store.set(`ad_refresh_jobs/e${i}_campaign`, {
        id: `e${i}_campaign`,
        orgId: 'org1',
        pibEntityId: `e${i}`,
        metaObjectId: `meta_e${i}`,
        level: 'campaign',
        status: 'pending',
        attempts: 0,
        createdAt: String(now + i),
      })
    }
    const claimed = await claimPendingJobs({ limit: 2 })
    expect(claimed).toHaveLength(2)
  })
})

describe('queue — markJobDone / markJobFailed', () => {
  beforeEach(clearStore)

  it('markJobDone sets status to done and finishedAt', async () => {
    const store = getStore()
    store.set('ad_refresh_jobs/j1_campaign', {
      id: 'j1_campaign',
      status: 'running',
    })
    await markJobDone('j1_campaign')
    const doc = store.get('ad_refresh_jobs/j1_campaign')
    expect(doc?.status).toBe('done')
    expect(doc?.finishedAt).toBeDefined()
  })

  it('markJobFailed sets status to failed with error message', async () => {
    const store = getStore()
    store.set('ad_refresh_jobs/j2_campaign', {
      id: 'j2_campaign',
      status: 'running',
    })
    await markJobFailed('j2_campaign', 'Meta API 500')
    const doc = store.get('ad_refresh_jobs/j2_campaign')
    expect(doc?.status).toBe('failed')
    expect(doc?.lastError).toBe('Meta API 500')
    expect(doc?.finishedAt).toBeDefined()
  })
})
