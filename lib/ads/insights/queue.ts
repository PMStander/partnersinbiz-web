// lib/ads/insights/queue.ts
import { adminDb } from '@/lib/firebase/admin'
import { Timestamp } from 'firebase-admin/firestore'
import type { InsightLevel } from '@/lib/ads/providers/meta/insights'

const COLLECTION = 'ad_refresh_jobs'

export interface RefreshJob {
  id: string // dedupe key: `${pibEntityId}_${level}`
  orgId: string
  pibEntityId: string
  metaObjectId: string
  level: InsightLevel
  status: 'pending' | 'running' | 'done' | 'failed'
  attempts: number
  lastError?: string
  createdAt: Timestamp
  startedAt?: Timestamp
  finishedAt?: Timestamp
}

/** Enqueue a refresh job. Idempotent: skips if a pending or running job already exists for (pibEntityId, level). Re-enqueues if the prior job is done or failed. */
export async function enqueueRefresh(args: {
  orgId: string
  pibEntityId: string
  metaObjectId: string
  level: InsightLevel
}): Promise<{ enqueued: boolean; existing?: 'pending' | 'running' }> {
  const id = `${args.pibEntityId}_${args.level}`
  const ref = adminDb.collection(COLLECTION).doc(id)
  const existing = await ref.get()
  if (existing.exists) {
    const data = existing.data() as RefreshJob
    if (data.status === 'pending' || data.status === 'running') {
      return { enqueued: false, existing: data.status }
    }
  }
  await ref.set({
    id,
    orgId: args.orgId,
    pibEntityId: args.pibEntityId,
    metaObjectId: args.metaObjectId,
    level: args.level,
    status: 'pending',
    attempts: 0,
    createdAt: Timestamp.now(),
  })
  return { enqueued: true }
}

/** Atomically claim up to `limit` pending jobs, marking them running. */
export async function claimPendingJobs(args: { limit: number }): Promise<RefreshJob[]> {
  const snap = await adminDb
    .collection(COLLECTION)
    .where('status', '==', 'pending')
    .orderBy('createdAt', 'asc')
    .limit(args.limit)
    .get()
  const claimed: RefreshJob[] = []
  const batch = adminDb.batch()
  for (const doc of snap.docs) {
    batch.update(doc.ref, {
      status: 'running',
      startedAt: Timestamp.now(),
      attempts: ((doc.data() as RefreshJob).attempts ?? 0) + 1,
    })
    claimed.push(doc.data() as RefreshJob)
  }
  if (claimed.length > 0) await batch.commit()
  return claimed
}

export async function markJobDone(id: string): Promise<void> {
  await adminDb.collection(COLLECTION).doc(id).update({
    status: 'done',
    finishedAt: Timestamp.now(),
  })
}

export async function markJobFailed(id: string, error: string): Promise<void> {
  await adminDb.collection(COLLECTION).doc(id).update({
    status: 'failed',
    finishedAt: Timestamp.now(),
    lastError: error,
  })
}
