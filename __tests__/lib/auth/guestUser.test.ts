const mockGetUserByEmail = jest.fn()
const mockCreateUser = jest.fn()
const mockGetUser = jest.fn()
const mockUserDocGet = jest.fn()
const mockUserDocSet = jest.fn()

jest.mock('@/lib/firebase/admin', () => ({
  adminAuth: {
    getUserByEmail: (...a: unknown[]) => mockGetUserByEmail(...a),
    createUser: (...a: unknown[]) => mockCreateUser(...a),
    getUser: (...a: unknown[]) => mockGetUser(...a),
  },
  adminDb: {
    collection: jest.fn().mockReturnThis(),
    doc: jest.fn().mockReturnThis(),
    get: (...a: unknown[]) => mockUserDocGet(...a),
    set: (...a: unknown[]) => mockUserDocSet(...a),
  },
}))

jest.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: () => '__serverTimestamp__',
  },
}))

import { findOrCreateGuestUser } from '@/lib/auth/guestUser'

beforeEach(() => {
  mockGetUserByEmail.mockReset()
  mockCreateUser.mockReset()
  mockGetUser.mockReset()
  mockUserDocGet.mockReset()
  mockUserDocSet.mockReset()
})

test('returns existing Firebase user when email is known', async () => {
  mockGetUserByEmail.mockResolvedValue({ uid: 'u-1', email: 'a@b.com' })
  mockUserDocGet.mockResolvedValue({ exists: true })
  const u = await findOrCreateGuestUser('a@b.com', 'magic_link')
  expect(u.uid).toBe('u-1')
  expect(mockCreateUser).not.toHaveBeenCalled()
})

test('creates Firebase user + Firestore doc when email is new', async () => {
  mockGetUserByEmail.mockRejectedValue({ code: 'auth/user-not-found' })
  mockCreateUser.mockResolvedValue({ uid: 'u-new', email: 'new@c.com' })
  mockUserDocGet.mockResolvedValue({ exists: false })
  mockUserDocSet.mockResolvedValue(undefined)
  const u = await findOrCreateGuestUser('new@c.com', 'magic_link')
  expect(u.uid).toBe('u-new')
  expect(mockCreateUser).toHaveBeenCalled()
  expect(mockUserDocSet).toHaveBeenCalled()
  const setArg = mockUserDocSet.mock.calls[0][0]
  expect(setArg.role).toBe('guest')
  expect(setArg.provider).toBe('magic_link')
})
