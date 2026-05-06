// __tests__/api/integrations-optout.test.ts
//
// Tests for syncUnsubscribeToIntegrations — bidirectional opt-out sync.

const mockContactGet = jest.fn()
const mockIntegrationGet = jest.fn()
const mockWhere = jest.fn()
const mockOrderBy = jest.fn()

// Track which collection is being queried
let lastCollectionName = ''

jest.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: jest.fn((name: string) => {
      lastCollectionName = name
      return {
        doc: jest.fn(() => ({ get: mockContactGet })),
        where: mockWhere,
        get: mockIntegrationGet,
      }
    }),
  },
}))

import { syncUnsubscribeToIntegrations } from '@/lib/crm/integrations/syncOptOut'

const MAILCHIMP_API_KEY = 'test-api-key-placeholder-us21'
const LIST_ID = 'list-abc'

function makeIntegration(overrides: Partial<{
  id: string
  status: string
  deleted: boolean
  config: Record<string, string>
}> = {}) {
  return {
    id: overrides.id ?? 'int-1',
    orgId: 'org-1',
    provider: 'mailchimp',
    name: 'Test list',
    status: overrides.status ?? 'active',
    deleted: overrides.deleted ?? false,
    config: overrides.config ?? { apiKey: MAILCHIMP_API_KEY, listId: LIST_ID },
    autoTags: [],
    autoCampaignIds: [],
    cadenceMinutes: 0,
    lastSyncedAt: null,
    lastSyncStats: { imported: 0, created: 0, updated: 0, skipped: 0, errored: 0 },
    lastError: '',
    createdAt: null,
    updatedAt: null,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  // Default: chain where().where().get() etc.
  const query = {
    where: mockWhere,
    get: mockIntegrationGet,
    orderBy: mockOrderBy,
  }
  mockWhere.mockReturnValue(query)
  mockOrderBy.mockReturnValue(query)
  global.fetch = jest.fn()
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('syncUnsubscribeToIntegrations', () => {
  it('makes no API calls when there are no Mailchimp integrations', async () => {
    mockContactGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ email: 'test@example.com', orgId: 'org-1' }),
    })
    mockIntegrationGet.mockResolvedValueOnce({ docs: [] })

    await syncUnsubscribeToIntegrations('contact-1', 'org-1')

    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('sends PUT to Mailchimp with correct MD5 email hash for active integration', async () => {
    mockContactGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ email: 'Test@Example.com', orgId: 'org-1' }),
    })
    mockIntegrationGet.mockResolvedValueOnce({
      docs: [
        { id: 'int-1', data: () => makeIntegration() },
      ],
    })

    const fetchMock = global.fetch as jest.Mock
    fetchMock.mockResolvedValueOnce({ ok: true, text: () => Promise.resolve('') } as Response)

    await syncUnsubscribeToIntegrations('contact-1', 'org-1')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, opts] = fetchMock.mock.calls[0]

    // MD5 of 'test@example.com' (lowercased) = 55502f40dc8b7c769880b10874abc9d0
    expect(url).toContain('55502f40dc8b7c769880b10874abc9d0')
    expect(url).toContain('us21.api.mailchimp.com')
    expect(url).toContain(LIST_ID)
    expect(opts.method).toBe('PUT')
    expect(JSON.parse(opts.body)).toEqual({ status: 'unsubscribed' })
  })

  it('catches Mailchimp API errors and does not throw', async () => {
    mockContactGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ email: 'err@example.com', orgId: 'org-1' }),
    })
    mockIntegrationGet.mockResolvedValueOnce({
      docs: [
        { id: 'int-1', data: () => makeIntegration() },
      ],
    })

    const fetchMock = global.fetch as jest.Mock
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal Server Error'),
    } as Response)

    // Should NOT throw
    await expect(
      syncUnsubscribeToIntegrations('contact-1', 'org-1')
    ).resolves.toBeUndefined()
  })

  it('sends PUT to each integration when multiple exist', async () => {
    mockContactGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ email: 'multi@example.com', orgId: 'org-1' }),
    })
    mockIntegrationGet.mockResolvedValueOnce({
      docs: [
        { id: 'int-1', data: () => makeIntegration({ id: 'int-1', config: { apiKey: MAILCHIMP_API_KEY, listId: 'list-1' } }) },
        { id: 'int-2', data: () => makeIntegration({ id: 'int-2', config: { apiKey: MAILCHIMP_API_KEY, listId: 'list-2' } }) },
      ],
    })

    const fetchMock = global.fetch as jest.Mock
    fetchMock.mockResolvedValue({ ok: true, text: () => Promise.resolve('') } as Response)

    await syncUnsubscribeToIntegrations('contact-1', 'org-1')

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const urls = fetchMock.mock.calls.map(([url]) => url as string)
    expect(urls.some((u) => u.includes('list-1'))).toBe(true)
    expect(urls.some((u) => u.includes('list-2'))).toBe(true)
  })
})
