jest.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: jest.fn().mockReturnThis(),
    doc: jest.fn().mockReturnThis(),
    set: jest.fn().mockResolvedValue(undefined),
    runTransaction: jest.fn(),
  },
}))

jest.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: () => '__serverTimestamp__',
  },
}))

import { generateMagicLinkToken, MAGIC_LINK_TTL_MS } from '@/lib/client-documents/magicLink'

test('magic link token is 64 hex chars', () => {
  const t = generateMagicLinkToken()
  expect(t).toMatch(/^[0-9a-f]{64}$/)
})

test('TTL is 15 minutes', () => {
  expect(MAGIC_LINK_TTL_MS).toBe(15 * 60 * 1000)
})
