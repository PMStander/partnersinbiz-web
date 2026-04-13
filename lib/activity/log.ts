import { adminDb } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'

export interface LogActivityOptions {
  orgId: string
  type: string
  actorId: string
  actorName: string
  actorRole: 'admin' | 'client' | 'ai'
  description: string
  entityId?: string
  entityType?: string
  entityTitle?: string
}

export async function logActivity(opts: LogActivityOptions): Promise<void> {
  try {
    await adminDb.collection('activity').add({
      ...opts,
      createdAt: FieldValue.serverTimestamp(),
    })
  } catch (err) {
    // Never block the main flow
    console.error('[Activity] Log failed:', err)
  }
}
