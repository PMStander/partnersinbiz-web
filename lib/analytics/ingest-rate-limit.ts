// Per-ingest-key rate limiter: 100 requests/minute.
// Key shape: analytics_rate_limits/{ingestKey}_{minuteBucket}
// Reuses the same Firestore transaction pattern as lib/forms/ratelimit.ts.

import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'

const COLLECTION = 'analytics_rate_limits'
const LIMIT = 100
const BUCKET_TTL_MS = 60 * 60 * 1000  // 1h

export async function checkIngestRateLimit(ingestKey: string): Promise<boolean> {
  const minuteBucket = Math.floor(Date.now() / 60_000)
  const safeKey = ingestKey.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 64)
  const docId = `${safeKey}_${minuteBucket}`
  const ref = adminDb.collection(COLLECTION).doc(docId)

  try {
    return await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref)
      const current = (snap.exists ? (snap.data()?.count as number) : 0) ?? 0
      if (current >= LIMIT) return false

      if (snap.exists) {
        tx.update(ref, { count: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() })
      } else {
        tx.set(ref, {
          ingestKey: safeKey,
          minuteBucket,
          count: 1,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          expiresAt: Timestamp.fromMillis(Date.now() + BUCKET_TTL_MS),
        })
      }
      return true
    })
  } catch {
    return true  // fail open
  }
}
