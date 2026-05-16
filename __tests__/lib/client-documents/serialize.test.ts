import { Timestamp } from 'firebase-admin/firestore'
import { serializeForClient } from '@/lib/client-documents/serialize'

test('converts Firestore Timestamp instances to millis', () => {
  const ts = Timestamp.fromMillis(1_700_000_000_505)
  expect(serializeForClient({ when: ts })).toEqual({ when: 1_700_000_000_505 })
})

test('converts already-serialised { _seconds, _nanoseconds } shape', () => {
  const obj = { when: { _seconds: 1_700_000_000, _nanoseconds: 505_000_000 } }
  expect(serializeForClient(obj)).toEqual({ when: 1_700_000_000_505 })
})

test('walks nested objects + arrays', () => {
  const ts = Timestamp.fromMillis(42_000)
  const input = {
    a: { b: { c: ts } },
    list: [ts, { nested: ts }],
  }
  expect(serializeForClient(input)).toEqual({
    a: { b: { c: 42_000 } },
    list: [42_000, { nested: 42_000 }],
  })
})

test('leaves plain primitives untouched', () => {
  expect(serializeForClient('hello')).toBe('hello')
  expect(serializeForClient(42)).toBe(42)
  expect(serializeForClient(null)).toBe(null)
  expect(serializeForClient(undefined)).toBe(undefined)
  expect(serializeForClient(true)).toBe(true)
})

test('preserves all non-timestamp keys', () => {
  const ts = Timestamp.fromMillis(1000)
  const input = { id: 'x', title: 't', createdAt: ts, count: 7, tags: ['a', 'b'] }
  const out = serializeForClient(input)
  expect(out).toEqual({ id: 'x', title: 't', createdAt: 1000, count: 7, tags: ['a', 'b'] })
})
