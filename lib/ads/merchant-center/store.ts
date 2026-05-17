// lib/ads/merchant-center/store.ts
//
// Firestore CRUD helpers for the `ad_merchant_centers` collection.
// Each document represents a single Google Merchant Center account binding
// for an org. Tokens are stored as encrypted JSON strings (via encryptToken).
import { adminDb } from '@/lib/firebase/admin'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import type { AdMerchantCenter } from '@/lib/ads/types'

const COLLECTION = 'ad_merchant_centers'

export async function createMerchantCenter(
  input: Omit<AdMerchantCenter, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<AdMerchantCenter> {
  const ref = adminDb.collection(COLLECTION).doc()
  const now = Timestamp.now()
  const doc: AdMerchantCenter = { id: ref.id, ...input, createdAt: now, updatedAt: now }
  await ref.set(doc)
  return doc
}

export async function getMerchantCenter(id: string): Promise<AdMerchantCenter | null> {
  const snap = await adminDb.collection(COLLECTION).doc(id).get()
  if (!snap.exists) return null
  return snap.data() as AdMerchantCenter
}

export async function listMerchantCenters(args: {
  orgId: string
}): Promise<AdMerchantCenter[]> {
  const snap = await adminDb
    .collection(COLLECTION)
    .where('orgId', '==', args.orgId)
    .orderBy('createdAt', 'desc')
    .get()
  return snap.docs.map((d) => d.data() as AdMerchantCenter)
}

export async function updateMerchantCenter(
  id: string,
  patch: Partial<Omit<AdMerchantCenter, 'id' | 'orgId' | 'createdAt'>>,
): Promise<AdMerchantCenter> {
  const ref = adminDb.collection(COLLECTION).doc(id)
  const clean: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() }
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) clean[k] = v
  }
  await ref.update(clean)
  const after = await ref.get()
  return after.data() as AdMerchantCenter
}

export async function deleteMerchantCenter(id: string): Promise<void> {
  await adminDb.collection(COLLECTION).doc(id).delete()
}
