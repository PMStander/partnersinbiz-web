import { generateEditShareToken, generateAccessCode, verifyAccessCode } from '@/lib/client-documents/editShare'

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
