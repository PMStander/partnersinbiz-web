// lib/broadcasts/audience.ts
//
// Resolves a BroadcastAudience into a concrete list of Contact rows.
//
// Inputs are combined as a union:
//   • segmentId  → contacts matching that segment's filters
//   • contactIds → explicit contacts (chunked through `__name__ in` queries)
//   • tags       → contacts that have any of the tags (array-contains-any)
//
// All three are merged and deduplicated by contact.id. Unsubscribed,
// bounced, and soft-deleted contacts are ALWAYS excluded regardless of the
// `exclude*` flags — those flags are operator hints, never an override.
//
// orgId is always the first where() clause so a malformed audience never
// leaks rows across organisations.

import { adminDb } from '@/lib/firebase/admin'
import { resolveSegmentContacts, type Segment } from '@/lib/crm/segments'
import { getSuppressedEmails, normalizeEmail } from '@/lib/email/suppressions'
import type { Contact } from '@/lib/crm/types'
import type { BroadcastAudience } from './types'

const ID_IN_CHUNK = 10
const TAG_IN_CHUNK = 10
const MAX_TOTAL = 50_000

function chunk<T>(arr: T[], size: number): T[][] {
  if (size <= 0) return [arr]
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

function isSendable(c: Contact): boolean {
  if (c.deleted === true) return false
  if (c.unsubscribedAt != null) return false
  if (c.bouncedAt != null) return false
  if (!c.email || typeof c.email !== 'string' || !c.email.includes('@')) return false
  return true
}

export async function resolveBroadcastAudience(
  orgId: string,
  audience: BroadcastAudience,
): Promise<Contact[]> {
  if (!orgId) return []

  const seen = new Map<string, Contact>()

  // 1. Segment branch — delegates to the existing segments resolver, which
  //    already applies the same safety filters (unsub/bounced/deleted).
  const segmentId = audience.segmentId?.trim() ?? ''
  if (segmentId) {
    const segSnap = await adminDb.collection('segments').doc(segmentId).get()
    if (segSnap.exists) {
      const seg = { id: segSnap.id, ...(segSnap.data() ?? {}) } as Segment
      if (seg.orgId === orgId && seg.deleted !== true) {
        const segContacts = await resolveSegmentContacts(orgId, seg.filters ?? {})
        for (const c of segContacts) {
          if (!seen.has(c.id) && isSendable(c)) seen.set(c.id, c)
          if (seen.size >= MAX_TOTAL) return [...seen.values()]
        }
      }
    }
  }

  // 2. Explicit contactIds — chunk 10 at a time through `__name__` in.
  const contactIds = (audience.contactIds ?? []).filter(
    (x): x is string => typeof x === 'string' && x.length > 0,
  )
  if (contactIds.length > 0) {
    for (const batch of chunk(contactIds, ID_IN_CHUNK)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const snap = await (adminDb.collection('contacts') as any)
        .where('__name__', 'in', batch)
        .get()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const d of snap.docs as any[]) {
        const c = { id: d.id, ...d.data() } as Contact
        if (c.orgId !== orgId) continue // strict cross-org guard
        if (seen.has(c.id)) continue
        if (!isSendable(c)) continue
        seen.set(c.id, c)
        if (seen.size >= MAX_TOTAL) return [...seen.values()]
      }
    }
  }

  // 3. Tag branch — array-contains-any (max 10 per query) chunked.
  const tags = (audience.tags ?? []).filter(
    (x): x is string => typeof x === 'string' && x.length > 0,
  )
  if (tags.length > 0) {
    for (const tagBatch of chunk(tags, TAG_IN_CHUNK)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const snap = await (adminDb.collection('contacts') as any)
        .where('orgId', '==', orgId)
        .where('tags', 'array-contains-any', tagBatch)
        .limit(MAX_TOTAL)
        .get()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const d of snap.docs as any[]) {
        const c = { id: d.id, ...d.data() } as Contact
        if (seen.has(c.id)) continue
        if (!isSendable(c)) continue
        seen.set(c.id, c)
        if (seen.size >= MAX_TOTAL) return [...seen.values()]
      }
    }
  }

  // Final filter — drop any address on the suppression list (hard bounce,
  // complaint, manual unsub, or temporary soft-bounce within its 24h window).
  const collected = [...seen.values()]
  if (collected.length === 0) return collected
  const suppressed = await getSuppressedEmails(
    orgId,
    collected.map((c) => c.email),
  )
  if (suppressed.size === 0) return collected
  return collected.filter((c) => !suppressed.has(normalizeEmail(c.email)))
}
