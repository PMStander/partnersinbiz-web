// __tests__/api/integrations-hubspot.test.ts
import type { CrmIntegration } from '@/lib/crm/integrations/types'
import { EMPTY_SYNC_STATS } from '@/lib/crm/integrations/types'

const mockGet = jest.fn()
const mockAdd = jest.fn()
const mockUpdate = jest.fn()
const mockDoc = jest.fn()
const mockWhere = jest.fn()
const mockLimit = jest.fn()

jest.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: jest.fn(() => ({
      where: mockWhere,
      get: mockGet,
      add: mockAdd,
      doc: mockDoc,
    })),
  },
}))

import { syncHubspot } from '@/lib/crm/integrations/handlers/hubspot'

const baseIntegration: CrmIntegration = {
  id: 'int-hs-1',
  orgId: 'org-1',
  provider: 'hubspot',
  name: 'Test HubSpot',
  status: 'pending',
  config: { accessToken: 'pat-na1-abc123' },
  autoTags: ['hubspot', 'imported'],
  autoCampaignIds: [],
  cadenceMinutes: 0,
  lastSyncedAt: null,
  lastSyncStats: { ...EMPTY_SYNC_STATS },
  lastError: '',
  createdAt: null,
  updatedAt: null,
}

beforeEach(() => {
  jest.clearAllMocks()
  const query = { where: mockWhere, get: mockGet, limit: mockLimit, add: mockAdd, doc: mockDoc }
  mockWhere.mockReturnValue(query)
  mockLimit.mockReturnValue(query)
  mockDoc.mockReturnValue({ get: mockGet, update: mockUpdate, ref: { update: mockUpdate } })
  global.fetch = jest.fn()
})

afterEach(() => {
  jest.restoreAllMocks()
})

function makeContact(overrides: Partial<{ id: string; email: string; firstname: string; lastname: string; company: string; phone: string; lifecyclestage: string }> = {}) {
  return {
    id: overrides.id ?? 'hs-1',
    properties: {
      email: overrides.email ?? 'test@example.com',
      firstname: overrides.firstname ?? 'Jane',
      lastname: overrides.lastname ?? 'Doe',
      company: overrides.company ?? 'Acme',
      phone: overrides.phone ?? '555-0100',
      lifecyclestage: overrides.lifecyclestage,
    },
  }
}

function mockHubspotPage(contacts: ReturnType<typeof makeContact>[], nextCursor?: string) {
  ;(global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    json: () =>
      Promise.resolve({
        results: contacts,
        paging: nextCursor ? { next: { after: nextCursor } } : undefined,
      }),
  } as Response)
}

function mockExistingContact(existing: { id: string; tags?: string[]; bouncedAt?: unknown; unsubscribedAt?: unknown } | null) {
  if (!existing) {
    mockGet.mockResolvedValueOnce({ empty: true, docs: [] })
  } else {
    mockGet.mockResolvedValueOnce({
      empty: false,
      docs: [{ id: existing.id, data: () => existing, ref: { update: mockUpdate } }],
    })
  }
}

describe('syncHubspot', () => {
  it('returns error when accessToken is missing', async () => {
    const result = await syncHubspot({ ...baseIntegration, config: {} })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/Missing accessToken/)
  })

  it('returns error when HubSpot API responds non-2xx', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: () => Promise.resolve('{"message":"Authentication credentials not found."}'),
    } as Response)
    const result = await syncHubspot(baseIntegration)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('HubSpot 401')
      expect(result.error).toContain('Authentication credentials not found')
    }
  })

  it('fetches second page when first page has 100 results', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => makeContact({ id: `hs-${i}`, email: `user${i}@example.com` }))
    const page2 = [makeContact({ id: 'hs-100', email: 'last@example.com' })]

    mockHubspotPage(page1, 'cursor-page-2')
    // Each contact on page 1 triggers a Firestore lookup (empty = new contact)
    for (let i = 0; i < 100; i++) {
      mockGet.mockResolvedValueOnce({ empty: true, docs: [] })
      mockAdd.mockResolvedValueOnce({ id: `contact-${i}` })
      // activity add
      mockAdd.mockResolvedValueOnce({ id: `act-${i}` })
    }

    mockHubspotPage(page2)
    mockGet.mockResolvedValueOnce({ empty: true, docs: [] })
    mockAdd.mockResolvedValueOnce({ id: 'contact-100' })
    mockAdd.mockResolvedValueOnce({ id: 'act-100' })

    const result = await syncHubspot(baseIntegration)
    expect(result.ok).toBe(true)
    expect(result.stats.imported).toBe(101)
    expect(result.stats.created).toBe(101)

    const calls = (global.fetch as jest.Mock).mock.calls
    expect(calls).toHaveLength(2)
    // Second request must carry the cursor
    const secondBody = JSON.parse(calls[1][1].body as string)
    expect(secondBody.after).toBe('cursor-page-2')
  })

  it('stops paginating when last page has no paging.next', async () => {
    mockHubspotPage([makeContact()])
    mockGet.mockResolvedValueOnce({ empty: true, docs: [] })
    mockAdd.mockResolvedValueOnce({ id: 'c1' })
    mockAdd.mockResolvedValueOnce({ id: 'act-1' })

    await syncHubspot(baseIntegration)
    expect((global.fetch as jest.Mock).mock.calls).toHaveLength(1)
  })

  it('creates new contact with correct orgId, tags, and name', async () => {
    mockHubspotPage([makeContact({ id: 'hs-42', email: 'alice@test.com', firstname: 'Alice', lastname: 'Smith', lifecyclestage: 'lead' })])
    mockExistingContact(null)
    mockAdd.mockResolvedValueOnce({ id: 'new-contact' })

    const result = await syncHubspot(baseIntegration)
    expect(result.ok).toBe(true)
    expect(result.stats.created).toBe(1)

    const contactAdd = mockAdd.mock.calls.find((c) => c[0]?.email === 'alice@test.com')
    expect(contactAdd).toBeDefined()
    expect(contactAdd![0]).toEqual(
      expect.objectContaining({
        orgId: 'org-1',
        email: 'alice@test.com',
        name: 'Alice Smith',
        source: 'import',
        type: 'lead',
        stage: 'new',
        tags: expect.arrayContaining(['hubspot', 'imported', 'lead']),
      }),
    )
  })

  it('merges tags on existing non-blocked contact and marks updated', async () => {
    mockHubspotPage([makeContact({ email: 'bob@test.com', lifecyclestage: 'customer' })])
    mockExistingContact({ id: 'existing-bob', tags: ['vip'] })

    const result = await syncHubspot(baseIntegration)
    expect(result.ok).toBe(true)
    expect(result.stats.updated).toBe(1)
    expect(result.stats.created).toBe(0)

    const updateCall = mockUpdate.mock.calls.find((c) => c[0]?.tags)
    expect(updateCall).toBeDefined()
    expect(updateCall![0].tags).toEqual(expect.arrayContaining(['vip', 'hubspot', 'imported', 'customer']))
  })

  it('skips bounced or unsubscribed existing contacts', async () => {
    mockHubspotPage([makeContact({ email: 'bounced@test.com' })])
    mockExistingContact({ id: 'existing-bounced', bouncedAt: { _seconds: 999 } })

    const result = await syncHubspot(baseIntegration)
    expect(result.ok).toBe(true)
    expect(result.stats.skipped).toBe(1)
    expect(result.stats.created).toBe(0)
    expect(result.stats.updated).toBe(0)
  })

  it('auto-enrolls new contact into an active campaign', async () => {
    const integration = { ...baseIntegration, autoCampaignIds: ['camp-1'] }
    mockHubspotPage([makeContact({ email: 'enroll@test.com' })])
    mockExistingContact(null)
    mockAdd.mockResolvedValueOnce({ id: 'new-contact-enroll' })
    // activity
    mockAdd.mockResolvedValueOnce({ id: 'act-enroll' })

    // campaign doc
    mockDoc.mockReturnValueOnce({
      get: jest.fn().mockResolvedValueOnce({
        exists: true,
        ref: { update: mockUpdate },
        data: () => ({
          orgId: 'org-1',
          status: 'active',
          deleted: false,
          sequenceId: 'seq-1',
        }),
      }),
      update: mockUpdate,
    })
    // sequence doc
    mockDoc.mockReturnValueOnce({
      get: jest.fn().mockResolvedValueOnce({
        exists: true,
        data: () => ({ steps: [{ delayDays: 0 }] }),
      }),
    })
    // enrollment add
    mockAdd.mockResolvedValueOnce({ id: 'enroll-1' })

    const result = await syncHubspot(integration)
    expect(result.ok).toBe(true)
    expect(result.stats.created).toBe(1)

    const enrollAdd = mockAdd.mock.calls.find(
      (c) => c[0]?.campaignId === 'camp-1' && c[0]?.contactId === 'new-contact-enroll',
    )
    expect(enrollAdd).toBeDefined()
    expect(enrollAdd![0]).toEqual(
      expect.objectContaining({
        orgId: 'org-1',
        campaignId: 'camp-1',
        sequenceId: 'seq-1',
        status: 'active',
        currentStep: 0,
      }),
    )
  })

  it('tracks imported/created/updated/skipped/errored counters accurately', async () => {
    // 3 contacts: new, existing-updated, bounced-skipped
    mockHubspotPage([
      makeContact({ id: 'hs-a', email: 'new@test.com' }),
      makeContact({ id: 'hs-b', email: 'existing@test.com' }),
      makeContact({ id: 'hs-c', email: 'bounced@test.com' }),
    ])

    // new contact — empty snapshot
    mockGet.mockResolvedValueOnce({ empty: true, docs: [] })
    mockAdd.mockResolvedValueOnce({ id: 'contact-new' })
    mockAdd.mockResolvedValueOnce({ id: 'act-new' })

    // existing contact with a new tag to merge
    mockGet.mockResolvedValueOnce({
      empty: false,
      docs: [{ id: 'existing-1', data: () => ({ tags: ['old-tag'] }), ref: { update: mockUpdate } }],
    })

    // bounced contact
    mockGet.mockResolvedValueOnce({
      empty: false,
      docs: [{ id: 'bounced-1', data: () => ({ bouncedAt: { _seconds: 1 } }), ref: { update: mockUpdate } }],
    })

    const result = await syncHubspot(baseIntegration)
    expect(result.ok).toBe(true)
    expect(result.stats.imported).toBe(3)
    expect(result.stats.created).toBe(1)
    expect(result.stats.updated).toBe(1)
    expect(result.stats.skipped).toBe(1)
    expect(result.stats.errored).toBe(0)
  })
})
