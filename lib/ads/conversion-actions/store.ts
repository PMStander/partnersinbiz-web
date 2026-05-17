// lib/ads/conversion-actions/store.ts
import { adminDb } from '@/lib/firebase/admin'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import type { AdConversionAction } from '@/lib/ads/types'

const COLLECTION = 'ad_conversion_actions'

export async function createConversionAction(
  input: Omit<AdConversionAction, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<AdConversionAction> {
  const ref = adminDb.collection(COLLECTION).doc()
  const now = Timestamp.now()
  const doc: AdConversionAction = { id: ref.id, ...input, createdAt: now, updatedAt: now }
  await ref.set(doc)
  return doc
}

export async function getConversionAction(id: string): Promise<AdConversionAction | null> {
  const snap = await adminDb.collection(COLLECTION).doc(id).get()
  if (!snap.exists) return null
  return snap.data() as AdConversionAction
}

export async function listConversionActions(args: {
  orgId: string
  platform?: 'meta' | 'google'
  category?: string
}): Promise<AdConversionAction[]> {
  let q: FirebaseFirestore.Query = adminDb.collection(COLLECTION).where('orgId', '==', args.orgId)
  if (args.platform) q = q.where('platform', '==', args.platform)
  if (args.category) q = q.where('category', '==', args.category)
  const snap = await q.get()
  return snap.docs.map((d) => d.data() as AdConversionAction)
}

export async function updateConversionAction(
  id: string,
  patch: Partial<Omit<AdConversionAction, 'id' | 'orgId' | 'platform' | 'createdAt'>>,
): Promise<AdConversionAction> {
  const ref = adminDb.collection(COLLECTION).doc(id)
  const clean: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() }
  for (const [k, v] of Object.entries(patch)) if (v !== undefined) clean[k] = v
  await ref.update(clean)
  const after = await ref.get()
  return after.data() as AdConversionAction
}

export async function deleteConversionAction(id: string): Promise<void> {
  await adminDb.collection(COLLECTION).doc(id).delete()
}
