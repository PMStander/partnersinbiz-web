import { Timestamp } from 'firebase-admin/firestore'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function serializeForClient(value: any): any {
  if (value === null || value === undefined) return value
  if (value instanceof Timestamp) return value.toDate().toISOString()
  // Firestore client-shape Timestamps coming via .data() can also be { _seconds, _nanoseconds }
  if (typeof value === 'object' && '_seconds' in value && '_nanoseconds' in value) {
    return new Date(
      (value as { _seconds: number })._seconds * 1000 +
        Math.floor((value as { _nanoseconds: number })._nanoseconds / 1e6),
    ).toISOString()
  }
  if (Array.isArray(value)) return value.map(serializeForClient)
  if (typeof value === 'object') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out: Record<string, any> = {}
    for (const [k, v] of Object.entries(value)) out[k] = serializeForClient(v)
    return out
  }
  return value
}
