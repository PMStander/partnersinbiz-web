// lib/crm/segments.ts
import type { Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import type {
  Contact,
  ContactSource,
  ContactStage,
  ContactType,
} from './types'

// ── Types ────────────────────────────────────────────────────────────────────

export interface SegmentFilters {
  tags?: string[]                 // OR within array (array-contains-any)
  capturedFromIds?: string[]      // OR within array
  stage?: ContactStage
  type?: ContactType
  source?: ContactSource
  createdAfter?: Timestamp | null
}

export interface Segment {
  id: string
  orgId: string
  name: string
  description: string
  filters: SegmentFilters
  createdAt: Timestamp | null
  updatedAt: Timestamp | null
  deleted?: boolean
}

export type SegmentInput = Omit<Segment, 'id' | 'createdAt' | 'updatedAt'>

// ── Resolver ─────────────────────────────────────────────────────────────────

const MAX_RESULTS = 5000
const ARRAY_CONTAINS_ANY_LIMIT = 10

/**
 * Resolve the contacts that match a segment's filters within a single org.
 *
 * Security: orgId is ALWAYS the first where() clause — segments must never
 * leak across organisations even if filter shape is malformed.
 *
 * Firestore restrictions force some filtering in-memory:
 * - Only one `array-contains-any` per query → tags use it; capturedFromIds use `in`
 *   when possible, otherwise fall back to in-memory filtering after fetch.
 * - unsubscribed / bounced / deleted contacts are always excluded in-memory so
 *   we never need composite indexes for those != null checks.
 */
export async function resolveSegmentContacts(
  orgId: string,
  filters: SegmentFilters,
): Promise<Contact[]> {
  if (!orgId) return []

  const tags = (filters.tags ?? []).filter((t) => typeof t === 'string' && t)
  if (tags.length > ARRAY_CONTAINS_ANY_LIMIT) return []

  const capturedFromIds = (filters.capturedFromIds ?? []).filter(
    (id) => typeof id === 'string' && id,
  )

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = adminDb.collection('contacts').where('orgId', '==', orgId)

  if (tags.length > 0) {
    query = query.where('tags', 'array-contains-any', tags)
  }

  // Firestore allows one `in` filter per query. If tags already used
  // array-contains-any AND we have multiple capturedFromIds we cannot add `in`
  // alongside it, so we filter capturedFromIds in-memory in that case.
  let inMemoryCapturedFromIds: string[] | null = null
  if (capturedFromIds.length === 1) {
    query = query.where('capturedFromId', '==', capturedFromIds[0])
  } else if (capturedFromIds.length > 1) {
    if (tags.length === 0) {
      query = query.where('capturedFromId', 'in', capturedFromIds.slice(0, 10))
      // If more than 10, we still need to in-memory filter the result.
      if (capturedFromIds.length > 10) {
        inMemoryCapturedFromIds = capturedFromIds
      }
    } else {
      inMemoryCapturedFromIds = capturedFromIds
    }
  }

  if (filters.stage) {
    query = query.where('stage', '==', filters.stage)
  }
  if (filters.type) {
    query = query.where('type', '==', filters.type)
  }
  if (filters.source) {
    query = query.where('source', '==', filters.source)
  }
  if (filters.createdAfter) {
    query = query.where('createdAt', '>=', filters.createdAfter)
  }

  const snapshot = await query.limit(MAX_RESULTS).get()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contacts: Contact[] = snapshot.docs.map((doc: any) => ({
    id: doc.id,
    ...doc.data(),
  }))

  return contacts.filter((c) => {
    if (c.deleted === true) return false
    if (c.unsubscribedAt != null) return false
    if (c.bouncedAt != null) return false
    if (inMemoryCapturedFromIds && !inMemoryCapturedFromIds.includes(c.capturedFromId)) {
      return false
    }
    return true
  })
}
