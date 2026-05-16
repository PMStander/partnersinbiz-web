const mockTxGet = jest.fn()
const mockTxUpdate = jest.fn()
const mockTxSet = jest.fn()
const mockRunTx = jest.fn()

jest.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: jest.fn().mockReturnThis(),
    doc: jest.fn().mockReturnThis(),
    runTransaction: (fn: (tx: unknown) => unknown) => mockRunTx(fn),
  },
}))

import { checkAndIncrementRateLimit } from '@/lib/rateLimit'

beforeEach(() => {
  mockTxGet.mockReset()
  mockTxUpdate.mockReset()
  mockTxSet.mockReset()
  mockRunTx.mockImplementation((fn: (tx: unknown) => unknown) =>
    fn({ get: mockTxGet, update: mockTxUpdate, set: mockTxSet }),
  )
})

test('first hit creates record and allows', async () => {
  mockTxGet.mockResolvedValue({ exists: false })
  const res = await checkAndIncrementRateLimit({ key: 'code:1.2.3.4', limit: 5, windowMs: 60000 })
  expect(res.allowed).toBe(true)
  expect(mockTxSet).toHaveBeenCalled()
})

test('under limit allows + increments', async () => {
  mockTxGet.mockResolvedValue({ exists: true, data: () => ({ count: 2, resetAt: Date.now() + 30000 }) })
  const res = await checkAndIncrementRateLimit({ key: 'code:1.2.3.4', limit: 5, windowMs: 60000 })
  expect(res.allowed).toBe(true)
  expect(res.remaining).toBe(2)
  expect(mockTxUpdate).toHaveBeenCalled()
})

test('over limit blocks', async () => {
  mockTxGet.mockResolvedValue({ exists: true, data: () => ({ count: 5, resetAt: Date.now() + 30000 }) })
  const res = await checkAndIncrementRateLimit({ key: 'code:1.2.3.4', limit: 5, windowMs: 60000 })
  expect(res.allowed).toBe(false)
  expect(res.remaining).toBe(0)
})

test('expired window resets count', async () => {
  mockTxGet.mockResolvedValue({ exists: true, data: () => ({ count: 99, resetAt: Date.now() - 1000 }) })
  const res = await checkAndIncrementRateLimit({ key: 'code:1.2.3.4', limit: 5, windowMs: 60000 })
  expect(res.allowed).toBe(true)
  expect(mockTxSet).toHaveBeenCalled()
})
