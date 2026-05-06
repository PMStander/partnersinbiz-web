// __tests__/api/integrations-mailchimp-interests.test.ts
//
// Tests for Mailchimp interest group → contact tag mapping (mc: prefix).

import type { CrmIntegration } from '@/lib/crm/integrations/types'
import { EMPTY_SYNC_STATS } from '@/lib/crm/integrations/types'

const mockGet = jest.fn()
const mockAdd = jest.fn()
const mockUpdate = jest.fn()
const mockWhere = jest.fn()
const mockLimit = jest.fn()
const mockDoc = jest.fn()

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

import { syncMailchimp } from '@/lib/crm/integrations/handlers/mailchimp'

const baseIntegration: CrmIntegration = {
  id: 'int-1',
  orgId: 'org-1',
  provider: 'mailchimp',
  name: 'Test list',
  status: 'active',
  config: { apiKey: 'test-api-key-placeholder-us21', listId: 'list-abc' },
  autoTags: [],
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

describe('Mailchimp interest group mapping', () => {
  it('fetches interests and maps true entries to tags with mc: prefix', async () => {
    const fetchMock = global.fetch as jest.Mock

    // 1. interest-categories
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        categories: [
          { id: 'cat1', title: 'Newsletters' },
        ],
      }),
    } as Response)

    // 2. interests for cat1
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        interests: [
          { id: 'int-a', name: 'Newsletter' },
          { id: 'int-b', name: 'Weekly Digest' },
        ],
      }),
    } as Response)

    // 3. list members page
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        members: [
          {
            id: 'm1',
            email_address: 'alice@example.com',
            status: 'subscribed',
            merge_fields: {},
            tags: [],
            interests: { 'int-a': true, 'int-b': false },
          },
        ],
        total_items: 1,
      }),
    } as Response)

    // Firestore: no existing contact → create
    mockGet.mockResolvedValueOnce({ empty: true, docs: [] })
    mockAdd
      .mockResolvedValueOnce({ id: 'contact-new' })  // contacts.add
      .mockResolvedValueOnce({ id: 'activity-new' }) // activities.add

    const result = await syncMailchimp(baseIntegration)

    expect(result.ok).toBe(true)
    expect(result.stats.created).toBe(1)

    const addCall = mockAdd.mock.calls.find((c) => c[0]?.email === 'alice@example.com')
    expect(addCall).toBeDefined()
    const tags: string[] = addCall![0].tags
    expect(tags).toContain('mc:Newsletter')
    expect(tags).not.toContain('mc:Weekly Digest') // int-b was false
  })

  it('continues sync normally when interest-categories fetch fails', async () => {
    const fetchMock = global.fetch as jest.Mock

    // 1. interest-categories fails
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: () => Promise.resolve({}),
    } as Response)

    // 2. list members page — should still run
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        members: [
          {
            id: 'm1',
            email_address: 'bob@example.com',
            status: 'subscribed',
            merge_fields: {},
            tags: [],
            interests: { 'int-a': true },
          },
        ],
        total_items: 1,
      }),
    } as Response)

    // Firestore: no existing contact
    mockGet.mockResolvedValueOnce({ empty: true, docs: [] })
    mockAdd
      .mockResolvedValueOnce({ id: 'contact-new' })
      .mockResolvedValueOnce({ id: 'activity-new' })

    const result = await syncMailchimp(baseIntegration)

    expect(result.ok).toBe(true)
    expect(result.stats.created).toBe(1)

    // No mc: tags since interest map was empty
    const addCall = mockAdd.mock.calls.find((c) => c[0]?.email === 'bob@example.com')
    expect(addCall).toBeDefined()
    const tags: string[] = addCall![0].tags
    expect(tags.some((t) => t.startsWith('mc:'))).toBe(false)
  })

  it('does not include false interest entries as tags', async () => {
    const fetchMock = global.fetch as jest.Mock

    // 1. interest-categories
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        categories: [{ id: 'cat1', title: 'Groups' }],
      }),
    } as Response)

    // 2. interests for cat1
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        interests: [
          { id: 'int-x', name: 'VIP' },
          { id: 'int-y', name: 'Promo' },
        ],
      }),
    } as Response)

    // 3. list members page — both interests false
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        members: [
          {
            id: 'm2',
            email_address: 'carol@example.com',
            status: 'subscribed',
            merge_fields: {},
            tags: [],
            interests: { 'int-x': false, 'int-y': false },
          },
        ],
        total_items: 1,
      }),
    } as Response)

    mockGet.mockResolvedValueOnce({ empty: true, docs: [] })
    mockAdd
      .mockResolvedValueOnce({ id: 'contact-new' })
      .mockResolvedValueOnce({ id: 'activity-new' })

    const result = await syncMailchimp(baseIntegration)
    expect(result.ok).toBe(true)

    const addCall = mockAdd.mock.calls.find((c) => c[0]?.email === 'carol@example.com')
    expect(addCall).toBeDefined()
    const tags: string[] = addCall![0].tags
    expect(tags).not.toContain('mc:VIP')
    expect(tags).not.toContain('mc:Promo')
  })
})
