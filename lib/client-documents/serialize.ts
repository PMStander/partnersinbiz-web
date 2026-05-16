/**
 * Convert a Firestore-Admin document to a plain object safe to pass from a
 * Server Component to a Client Component.
 *
 * Firestore `Timestamp` instances are class objects with non-enumerable
 * internal fields, so they can neither cross the RSC boundary nor be JSON
 * serialised without help. This walker converts them to milliseconds since
 * epoch (numbers), which:
 *
 *   1. Survive the Server -> Client serialisation pass.
 *   2. Are easy to format on the client with `new Date(ms)`.
 *   3. Match the shape we'd get from a regular browser-side fetch.
 *
 * Use this in any server component that fetches Firestore docs via
 * `firebase-admin` and renders them through a `'use client'` component.
 */
export function serializeForClient<T>(value: T): T {
  if (value === null || value === undefined) return value
  if (typeof value !== 'object') return value

  const v = value as unknown as Record<string, unknown> & {
    toMillis?: () => number
    toDate?: () => Date
    _seconds?: number
    _nanoseconds?: number
  }

  // Firestore Admin SDK Timestamp instance
  if (typeof v.toMillis === 'function' && typeof v.toDate === 'function') {
    return v.toMillis() as unknown as T
  }

  // Already-serialised Timestamp shape: { _seconds, _nanoseconds }
  if (
    typeof v._seconds === 'number' &&
    typeof v._nanoseconds === 'number' &&
    Object.keys(v).length === 2
  ) {
    return (v._seconds * 1000 + Math.floor(v._nanoseconds / 1e6)) as unknown as T
  }

  if (Array.isArray(value)) {
    return (value as unknown[]).map(serializeForClient) as unknown as T
  }

  const out: Record<string, unknown> = {}
  for (const key of Object.keys(v)) {
    out[key] = serializeForClient((v as Record<string, unknown>)[key])
  }
  return out as unknown as T
}
