// lib/forms/ratelimit.ts
//
// Minimal per-form-per-IP rate limiter backed by Firestore.
//
// Key shape: `form_rate_limits/{formId}_{ip}_{minuteBucket}` where
// `minuteBucket = floor(Date.now() / 60000)`. Each bucket lives for exactly
// one calendar minute of epoch time, so "rolling 60s" is naturally achieved
// by rolling the key. A short Firestore TTL policy on `createdAt` (e.g. 1h)
// keeps the collection from growing unbounded.
//
// The check+increment is done inside a transaction to make concurrent submits
// from the same IP safe — two parallel requests can't both read "count=perMin"
// and then both write "count=perMin+1" without one of them seeing the other's
// update.

import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'

const COLLECTION = 'form_rate_limits'
const BUCKET_TTL_MS = 60 * 60 * 1000 // 1h buffer; buckets are only read within their ~60s window

/**
 * Atomically increment the submission count for `(formId, ip, currentMinute)`
 * and return `true` if the caller is still within the allowed quota, or
 * `false` if this request would exceed `perMinute`.
 *
 * When `perMinute <= 0` the limiter is disabled and always returns `true`.
 */
export async function checkFormRateLimit(
  formId: string,
  ip: string,
  perMinute: number,
): Promise<boolean> {
  if (!Number.isFinite(perMinute) || perMinute <= 0) return true

  const minuteBucket = Math.floor(Date.now() / 60_000)
  const safeIp = (ip || 'unknown').replace(/[^a-zA-Z0-9:.\-]/g, '_')
  const docId = `${formId}_${safeIp}_${minuteBucket}`
  const ref = adminDb.collection(COLLECTION).doc(docId)

  try {
    return await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref)
      const current = (snap.exists ? (snap.data()?.count as number) : 0) ?? 0

      if (current >= perMinute) return false

      if (snap.exists) {
        tx.update(ref, {
          count: FieldValue.increment(1),
          updatedAt: FieldValue.serverTimestamp(),
        })
      } else {
        tx.set(ref, {
          formId,
          ip: safeIp,
          minuteBucket,
          count: 1,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          // TTL target — Firestore TTL deletes when expiresAt is reached.
          expiresAt: Timestamp.fromMillis(Date.now() + BUCKET_TTL_MS),
        })
      }
      return true
    })
  } catch {
    // If Firestore is unreachable, fail open rather than block legitimate
    // submissions. The honeypot + active-form gate still catch obvious abuse.
    return true
  }
}
