// __tests__/api/quotas.test.ts
//
// Tests for plan/quota soft gates (Item 3).

const mockGet = jest.fn()
const mockSet = jest.fn()
const mockAdd = jest.fn()
const mockDoc = jest.fn()
const mockCollection = jest.fn()

jest.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: mockCollection },
}))

// Mock FieldValue.increment so we don't need the actual Firebase SDK
jest.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    increment: (n: number) => ({ _increment: n }),
    serverTimestamp: () => ({ _serverTimestamp: true }),
  },
}))

import { checkQuota, QUOTAS } from '@/lib/platform/quotas'

beforeEach(() => {
  jest.clearAllMocks()

  mockDoc.mockReturnValue({ get: mockGet, set: mockSet })
  mockCollection.mockImplementation(() => ({
    doc: mockDoc,
    add: mockAdd,
  }))
  mockAdd.mockResolvedValue({ id: 'event-doc-id' })
})

const ORG = 'test-org-001'

test('below threshold: increments count, no quota_events doc written', async () => {
  // count = 5 (well below threshold)
  mockGet.mockResolvedValue({ data: () => ({ count: 5 }) })
  mockSet.mockResolvedValue(undefined)

  await checkQuota(ORG, 'emailsPerMonth')

  // set (increment) was called
  expect(mockSet).toHaveBeenCalledTimes(1)
  const [payload] = mockSet.mock.calls[0]
  expect(payload.count).toEqual({ _increment: 1 })

  // quota_events.add was NOT called
  expect(mockAdd).not.toHaveBeenCalled()
})

test('at threshold: increments count AND writes quota_events doc', async () => {
  // count = threshold - 1, so newCount === threshold
  const threshold = QUOTAS.emailsPerMonth
  mockGet.mockResolvedValue({ data: () => ({ count: threshold - 1 }) })
  mockSet.mockResolvedValue(undefined)
  mockAdd.mockResolvedValue({ id: 'evt-1' })

  await checkQuota(ORG, 'emailsPerMonth')

  expect(mockSet).toHaveBeenCalledTimes(1)
  expect(mockAdd).toHaveBeenCalledTimes(1)

  const eventPayload = mockAdd.mock.calls[0][0]
  expect(eventPayload.orgId).toBe(ORG)
  expect(eventPayload.key).toBe('emailsPerMonth')
  expect(eventPayload.count).toBe(threshold)
})

test('above threshold: increments and writes quota_events again (each overage logged)', async () => {
  const threshold = QUOTAS.contactsPerMonth
  // count is already above threshold
  mockGet.mockResolvedValue({ data: () => ({ count: threshold + 50 }) })
  mockSet.mockResolvedValue(undefined)
  mockAdd.mockResolvedValue({ id: 'evt-2' })

  await checkQuota(ORG, 'contactsPerMonth')

  expect(mockSet).toHaveBeenCalledTimes(1)
  expect(mockAdd).toHaveBeenCalledTimes(1)

  const eventPayload = mockAdd.mock.calls[0][0]
  expect(eventPayload.key).toBe('contactsPerMonth')
  expect(eventPayload.count).toBe(threshold + 51)
})

test('platform owner org is exempt — no Firestore calls made', async () => {
  await checkQuota('pib-platform-owner', 'emailsPerMonth')

  expect(mockGet).not.toHaveBeenCalled()
  expect(mockSet).not.toHaveBeenCalled()
  expect(mockAdd).not.toHaveBeenCalled()
})
