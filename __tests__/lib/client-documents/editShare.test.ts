const mockAdd = jest.fn().mockResolvedValue({ id: 'log-1' })

jest.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: jest.fn().mockReturnThis(),
    doc: jest.fn().mockReturnThis(),
    add: (...args: unknown[]) => mockAdd(...args),
  },
}))

jest.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: () => '__serverTimestamp__',
  },
}))

import {
  generateEditShareToken,
  generateAccessCode,
  verifyAccessCode,
  logDocumentAccess,
} from '@/lib/client-documents/editShare'

beforeEach(() => {
  mockAdd.mockClear()
})

test('editShareToken is 32 hex characters', () => {
  const t = generateEditShareToken()
  expect(t).toMatch(/^[0-9a-f]{32}$/)
})

test('access code is 6 chars from confusion-free alphabet', () => {
  for (let i = 0; i < 20; i++) {
    const code = generateAccessCode()
    expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/)
  }
})

test('verifyAccessCode compares case-insensitively', () => {
  expect(verifyAccessCode('ABC234', 'abc234')).toBe(true)
  expect(verifyAccessCode('ABC234', 'ABC234')).toBe(true)
  expect(verifyAccessCode('ABC234', 'ABC235')).toBe(false)
  expect(verifyAccessCode(undefined, 'ABC234')).toBe(false)
})

test('logDocumentAccess writes to access_log subcollection', async () => {
  await logDocumentAccess('doc-123', { type: 'code_entered', email: 'x@y.com', ip: '1.2.3.4' })
  expect(mockAdd).toHaveBeenCalledTimes(1)
  const arg = mockAdd.mock.calls[0][0] as Record<string, unknown>
  expect(arg.type).toBe('code_entered')
  expect(arg.email).toBe('x@y.com')
  expect(arg.ip).toBe('1.2.3.4')
  expect(arg.createdAt).toBeDefined()
})
