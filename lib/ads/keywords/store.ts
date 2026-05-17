// lib/ads/keywords/store.ts
// Canonical Firestore CRUD for the ad_keywords collection.
// Sub-3a Phase 2 Batch 2 — Firestore-only, no Google API calls.

import { adminDb } from '@/lib/firebase/admin'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import type { AdKeyword, AdEntityStatus } from '@/lib/ads/types'
import type { AdKeywordMatchType } from '@/lib/ads/providers/google/mappers'

const COLLECTION = 'ad_keywords'

export interface CreateKeywordInput {
  orgId: string
  campaignId: string
  adSetId: string
  text: string
  matchType: AdKeywordMatchType
  negativeKeyword: boolean
  cpcBidMicros?: string
  providerData?: AdKeyword['providerData']
}

export async function createKeyword(input: CreateKeywordInput): Promise<AdKeyword> {
  const ref = adminDb.collection(COLLECTION).doc()
  const now = Timestamp.now()
  const doc: AdKeyword = {
    id: ref.id,
    orgId: input.orgId,
    campaignId: input.campaignId,
    adSetId: input.adSetId,
    text: input.text.trim(),
    matchType: input.matchType,
    status: 'ACTIVE',
    negativeKeyword: input.negativeKeyword,
    createdAt: now,
    updatedAt: now,
  }
  if (input.cpcBidMicros) doc.cpcBidMicros = input.cpcBidMicros
  if (input.providerData) doc.providerData = input.providerData

  await ref.set(doc)
  return doc
}

export async function getKeyword(id: string): Promise<AdKeyword | null> {
  const snap = await adminDb.collection(COLLECTION).doc(id).get()
  if (!snap.exists) return null
  return snap.data() as AdKeyword
}

export interface ListKeywordsArgs {
  orgId: string
  adSetId?: string
  campaignId?: string
  negativeKeyword?: boolean
}

export async function listKeywords(args: ListKeywordsArgs): Promise<AdKeyword[]> {
  let q: FirebaseFirestore.Query = adminDb.collection(COLLECTION).where('orgId', '==', args.orgId)
  if (args.adSetId) q = q.where('adSetId', '==', args.adSetId)
  if (args.campaignId) q = q.where('campaignId', '==', args.campaignId)
  if (args.negativeKeyword !== undefined) q = q.where('negativeKeyword', '==', args.negativeKeyword)

  const snap = await q.get()
  return snap.docs.map((d) => d.data() as AdKeyword)
}

export interface UpdateKeywordPatch {
  text?: string
  status?: AdEntityStatus
  cpcBidMicros?: string
  providerData?: AdKeyword['providerData']
}

export async function updateKeyword(id: string, patch: UpdateKeywordPatch): Promise<AdKeyword> {
  const ref = adminDb.collection(COLLECTION).doc(id)
  const cleanPatch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() }
  if (patch.text !== undefined) cleanPatch.text = patch.text.trim()
  if (patch.status !== undefined) cleanPatch.status = patch.status
  if (patch.cpcBidMicros !== undefined) cleanPatch.cpcBidMicros = patch.cpcBidMicros
  if (patch.providerData !== undefined) cleanPatch.providerData = patch.providerData

  await ref.update(cleanPatch)
  const after = await ref.get()
  return after.data() as AdKeyword
}

export async function deleteKeyword(id: string): Promise<void> {
  await adminDb.collection(COLLECTION).doc(id).delete()
}
