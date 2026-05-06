// __tests__/lib/crm/segments.test.ts

const mockGet = jest.fn()
const mockWhere = jest.fn()
const mockLimit = jest.fn()
const mockCollection = jest.fn()

jest.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: mockCollection },
}))

import { resolveSegmentContacts } from '@/lib/crm/segments'

beforeEach(() => {
  jest.clearAllMocks()
  const query = { where: mockWhere, limit: mockLimit, get: mockGet }
  mockWhere.mockReturnValue(query)
  mockLimit.mockReturnValue(query)
  mockCollection.mockReturnValue(query)
})

function makeDoc(id: string, data: Record<string, unknown>) {
  return { id, data: () => data }
}

describe('resolveSegmentContacts', () => {
  it('returns [] without calling Firestore when orgId is missing', async () => {
    const out = await resolveSegmentContacts('', {})
    expect(out).toEqual([])
    expect(mockCollection).not.toHaveBeenCalled()
  })

  it('always passes orgId as the FIRST where clause', async () => {
    mockGet.mockResolvedValue({ docs: [] })
    await resolveSegmentContacts('org-1', { stage: 'new', type: 'lead' })
    expect(mockCollection).toHaveBeenCalledWith('contacts')
    expect(mockWhere.mock.calls[0]).toEqual(['orgId', '==', 'org-1'])
  })

  it('excludes unsubscribed, bounced, and deleted contacts in-memory', async () => {
    mockGet.mockResolvedValue({
      docs: [
        makeDoc('keep', {
          orgId: 'org-1',
          unsubscribedAt: null,
          bouncedAt: null,
          deleted: false,
        }),
        makeDoc('unsub', {
          orgId: 'org-1',
          unsubscribedAt: { _seconds: 1 },
          bouncedAt: null,
          deleted: false,
        }),
        makeDoc('bounced', {
          orgId: 'org-1',
          unsubscribedAt: null,
          bouncedAt: { _seconds: 1 },
          deleted: false,
        }),
        makeDoc('deleted', {
          orgId: 'org-1',
          unsubscribedAt: null,
          bouncedAt: null,
          deleted: true,
        }),
      ],
    })

    const out = await resolveSegmentContacts('org-1', {})
    expect(out.map((c) => c.id)).toEqual(['keep'])
  })

  it('with empty filters returns all org contacts (excluding the three states)', async () => {
    mockGet.mockResolvedValue({
      docs: [
        makeDoc('a', { orgId: 'org-1', unsubscribedAt: null, bouncedAt: null, deleted: false }),
        makeDoc('b', { orgId: 'org-1', unsubscribedAt: null, bouncedAt: null, deleted: false }),
      ],
    })

    const out = await resolveSegmentContacts('org-1', {})
    // Only the orgId where clause should fire — no other filters.
    expect(mockWhere).toHaveBeenCalledTimes(1)
    expect(mockWhere).toHaveBeenCalledWith('orgId', '==', 'org-1')
    expect(out.map((c) => c.id)).toEqual(['a', 'b'])
  })

  it('returns [] when tags exceed array-contains-any limit (10)', async () => {
    const tags = Array.from({ length: 11 }, (_, i) => `t${i}`)
    const out = await resolveSegmentContacts('org-1', { tags })
    expect(out).toEqual([])
    expect(mockCollection).not.toHaveBeenCalled()
  })

  it('applies stage/type/source/tags filters via where()', async () => {
    mockGet.mockResolvedValue({ docs: [] })
    await resolveSegmentContacts('org-1', {
      tags: ['vip', 'beta'],
      stage: 'new',
      type: 'lead',
      source: 'manual',
    })
    const calls = mockWhere.mock.calls
    expect(calls[0]).toEqual(['orgId', '==', 'org-1'])
    expect(calls).toContainEqual(['tags', 'array-contains-any', ['vip', 'beta']])
    expect(calls).toContainEqual(['stage', '==', 'new'])
    expect(calls).toContainEqual(['type', '==', 'lead'])
    expect(calls).toContainEqual(['source', '==', 'manual'])
  })
})
