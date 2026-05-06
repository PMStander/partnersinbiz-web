/**
 * Soft quota tracking.
 *
 * Logs + writes to quota_events when an org exceeds thresholds.
 * Never throws — quota failures are non-blocking for v1.
 *
 * Usage (fire-and-forget):
 *   checkQuota(orgId, 'emailsPerMonth').catch(() => {})
 */
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'

export const QUOTAS = {
  contactsPerMonth: 1000,
  emailsPerMonth: 10_000,
} as const

export type QuotaKey = keyof typeof QUOTAS

/** Platform owner is exempt from all quotas. */
const EXEMPT_ORG_IDS = new Set(['pib-platform-owner'])

/**
 * Increment the usage counter for `key` in the current calendar month.
 * If the new count meets or exceeds the threshold, log a quota_events doc.
 * Always resolves — never rejects.
 */
export async function checkQuota(orgId: string, key: QuotaKey): Promise<void> {
  if (EXEMPT_ORG_IDS.has(orgId)) return

  const now = new Date()
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
  const docId = `${orgId}_${key}_${month}`
  const ref = adminDb.collection('quota_usage').doc(docId)

  const snap = await ref.get()
  const count = ((snap.data()?.count) ?? 0) as number

  await ref.set(
    { orgId, key, month, count: FieldValue.increment(1) },
    { merge: true }
  )

  const newCount = count + 1
  if (newCount >= QUOTAS[key]) {
    // eslint-disable-next-line no-console
    console.warn('[quota]', orgId, key, newCount)
    try {
      await adminDb.collection('quota_events').add({
        orgId,
        key,
        count: newCount,
        month,
        exceededAt: FieldValue.serverTimestamp(),
      })
    } catch (err) {
      // Best-effort — don't let event write failure propagate
      console.error('[quota] failed to write quota_events', orgId, key, err)
    }
  }
}
