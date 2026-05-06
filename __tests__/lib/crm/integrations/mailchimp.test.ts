// __tests__/lib/crm/integrations/mailchimp.test.ts
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

import { syncMailchimp } from '@/lib/crm/integrations/handlers/mailchimp'

const baseIntegration: CrmIntegration = {
  id: 'int-1',
  orgId: 'org-1',
  provider: 'mailchimp',
  name: 'Test list',
  status: 'pending',
  config: { apiKey: 'test-api-key-placeholder-us21', listId: 'list-abc' },
  autoTags: ['imported', 'mc'],
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

// Mocks interest-categories (empty) then the members page.
// fetchInterestMap runs before pagination so always consumes one fetch first.
function mockMailchimpFetch(members: Array<{ id: string; email_address: string; status: string; merge_fields?: Record<string, unknown>; tags?: Array<{ id: number; name: string }> }>) {
  // interest-categories → empty (no interest fetches follow)
  ;(global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({ categories: [] }),
  } as Response)
  // members page
  ;(global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({ members, total_items: members.length }),
  } as Response)
}

function mockExistingContact(existing: { id: string; tags?: string[]; bouncedAt?: unknown; unsubscribedAt?: unknown } | null) {
  if (!existing) {
    mockGet.mockResolvedValueOnce({ empty: true, docs: [] })
  } else {
    mockGet.mockResolvedValueOnce({
      empty: false,
      docs: [{
        id: existing.id,
        data: () => existing,
        ref: { update: mockUpdate },
      }],
    })
  }
}

describe('syncMailchimp', () => {
  it('rejects when apiKey is missing', async () => {
    const result = await syncMailchimp({ ...baseIntegration, config: { listId: 'x' } })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/Missing/)
  })

  it('rejects when listId is missing', async () => {
    const result = await syncMailchimp({ ...baseIntegration, config: { apiKey: 'abc-us21' } })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/Missing/)
  })

  it('rejects when apiKey has no data-center suffix', async () => {
    const result = await syncMailchimp({ ...baseIntegration, config: { apiKey: 'abcdef', listId: 'x' } })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/Invalid API key format/)
  })

  it('returns provider error when Mailchimp API responds non-2xx', async () => {
    // interest-categories fetch runs first — mock it as empty
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ categories: [] }),
    } as Response)
    // members fetch → 401
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: () => Promise.resolve('{"detail":"Auth failed"}'),
    } as Response)
    const result = await syncMailchimp(baseIntegration)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('Mailchimp 401')
  })

  it('creates a new contact for a brand-new member with merged tags', async () => {
    mockMailchimpFetch([
      { id: 'm1', email_address: 'jane@x.com', status: 'subscribed', merge_fields: { FNAME: 'Jane', LNAME: 'Doe' }, tags: [{ id: 1, name: 'vip' }] },
    ])
    mockExistingContact(null)
    mockAdd.mockResolvedValueOnce({ id: 'contact-new' })

    const result = await syncMailchimp(baseIntegration)
    expect(result.ok).toBe(true)
    expect(result.stats.imported).toBe(1)
    expect(result.stats.created).toBe(1)
    expect(result.stats.updated).toBe(0)

    const addCall = mockAdd.mock.calls.find((c) => c[0]?.email === 'jane@x.com')
    expect(addCall).toBeDefined()
    expect(addCall![0]).toEqual(
      expect.objectContaining({
        orgId: 'org-1',
        email: 'jane@x.com',
        name: 'Jane Doe',
        source: 'import',
        type: 'lead',
        stage: 'new',
        tags: expect.arrayContaining(['imported', 'mc', 'vip']),
      }),
    )
  })

  it('merges tags on existing contact, marks as updated', async () => {
    mockMailchimpFetch([
      { id: 'm1', email_address: 'jane@x.com', status: 'subscribed', tags: [{ id: 1, name: 'newsletter' }] },
    ])
    mockExistingContact({ id: 'existing-1', tags: ['vip'] })

    const result = await syncMailchimp(baseIntegration)
    expect(result.ok).toBe(true)
    expect(result.stats.created).toBe(0)
    expect(result.stats.updated).toBe(1)

    const updateCall = mockUpdate.mock.calls.find((c) => c[0]?.tags)
    expect(updateCall).toBeDefined()
    expect(updateCall![0].tags).toEqual(expect.arrayContaining(['vip', 'imported', 'mc', 'newsletter']))
  })

  it('skips bounced or unsubscribed existing contacts', async () => {
    mockMailchimpFetch([
      { id: 'm1', email_address: 'bouncer@x.com', status: 'subscribed' },
    ])
    mockExistingContact({ id: 'existing-bounced', bouncedAt: { _seconds: 123 } })

    const result = await syncMailchimp(baseIntegration)
    expect(result.ok).toBe(true)
    expect(result.stats.skipped).toBe(1)
    expect(result.stats.created).toBe(0)
    expect(result.stats.updated).toBe(0)
  })

  it('skips members without an email', async () => {
    mockMailchimpFetch([
      { id: 'm1', email_address: '', status: 'subscribed' },
    ])
    const result = await syncMailchimp(baseIntegration)
    expect(result.ok).toBe(true)
    expect(result.stats.imported).toBe(0)
    expect(result.stats.skipped).toBe(1)
  })

  it('handles empty list gracefully', async () => {
    mockMailchimpFetch([])
    const result = await syncMailchimp(baseIntegration)
    expect(result.ok).toBe(true)
    expect(result.stats.imported).toBe(0)
    expect(result.stats.created).toBe(0)
  })
})
