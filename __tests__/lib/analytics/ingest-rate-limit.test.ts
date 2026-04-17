const mockRunTransaction = jest.fn()
const mockDoc = jest.fn()
const mockCollection = jest.fn(() => ({ doc: mockDoc }))

jest.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    runTransaction: mockRunTransaction,
    collection: mockCollection,
  },
}))

import { checkIngestRateLimit } from '@/lib/analytics/ingest-rate-limit'
import { adminDb } from '@/lib/firebase/admin'

describe('checkIngestRateLimit', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns true when under limit', async () => {
    mockDoc.mockReturnValue({})
    ;(adminDb.runTransaction as jest.Mock).mockImplementation(async (fn: any) => {
      return fn({
        get: jest.fn().mockResolvedValue({ exists: true, data: () => ({ count: 5 }) }),
        update: jest.fn(),
        set: jest.fn(),
      })
    })
    const result = await checkIngestRateLimit('key-abc')
    expect(result).toBe(true)
  })

  it('returns false when at limit (100)', async () => {
    mockDoc.mockReturnValue({})
    ;(adminDb.runTransaction as jest.Mock).mockImplementation(async (fn: any) => {
      return fn({
        get: jest.fn().mockResolvedValue({ exists: true, data: () => ({ count: 100 }) }),
        update: jest.fn(),
        set: jest.fn(),
      })
    })
    const result = await checkIngestRateLimit('key-abc')
    expect(result).toBe(false)
  })

  it('returns true when doc does not exist (first request)', async () => {
    mockDoc.mockReturnValue({})
    ;(adminDb.runTransaction as jest.Mock).mockImplementation(async (fn: any) => {
      return fn({
        get: jest.fn().mockResolvedValue({ exists: false, data: () => null }),
        update: jest.fn(),
        set: jest.fn(),
      })
    })
    const result = await checkIngestRateLimit('key-abc')
    expect(result).toBe(true)
  })

  it('fails open when Firestore throws', async () => {
    ;(adminDb.runTransaction as jest.Mock).mockRejectedValue(new Error('Firestore down'))
    const result = await checkIngestRateLimit('key-abc')
    expect(result).toBe(true)
  })
})
