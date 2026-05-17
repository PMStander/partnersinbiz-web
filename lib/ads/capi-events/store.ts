// lib/ads/capi-events/store.ts
import { adminDb } from '@/lib/firebase/admin'
import { Timestamp } from 'firebase-admin/firestore'
import type { AdCapiEvent, CapiUserHash, CapiCustomData, CapiActionSource, CapiFanoutResult } from '@/lib/ads/types'

const COLLECTION = 'ad_capi_events'

export interface RecordCapiEventArgs {
  /** Client-supplied event_id — becomes the document ID (dedupe key). */
  event_id: string
  orgId: string
  pixelConfigId: string
  propertyId?: string
  eventName: string
  eventTime: Timestamp
  userHash: CapiUserHash
  customData?: CapiCustomData
  actionSource: CapiActionSource
  eventSourceUrl?: string
  optOut: boolean
  fanout: {
    meta?: CapiFanoutResult
    google?: CapiFanoutResult
    linkedin?: CapiFanoutResult
    tiktok?: CapiFanoutResult
  }
}

/**
 * Persist a CAPI event to Firestore.
 * Document ID = args.event_id (the client-supplied eventID that also flows through the browser Pixel
 * for deduplication — do NOT generate a new ID here).
 */
export async function recordCapiEvent(args: RecordCapiEventArgs): Promise<AdCapiEvent> {
  const doc: AdCapiEvent = {
    id: args.event_id,
    orgId: args.orgId,
    pixelConfigId: args.pixelConfigId,
    ...(args.propertyId !== undefined && { propertyId: args.propertyId }),
    eventName: args.eventName,
    eventTime: args.eventTime,
    userHash: args.userHash,
    ...(args.customData !== undefined && { customData: args.customData }),
    actionSource: args.actionSource,
    ...(args.eventSourceUrl !== undefined && { eventSourceUrl: args.eventSourceUrl }),
    optOut: args.optOut,
    fanout: args.fanout,
    createdAt: Timestamp.now(),
  }
  await adminDb.collection(COLLECTION).doc(args.event_id).set(doc)
  return doc
}

/** Fetch a single CAPI event by its event_id. */
export async function getCapiEvent(id: string): Promise<AdCapiEvent | null> {
  const snap = await adminDb.collection(COLLECTION).doc(id).get()
  if (!snap.exists) return null
  return snap.data() as AdCapiEvent
}

export interface ListCapiEventsArgs {
  orgId: string
  eventName?: string
  /** Unix seconds — lower bound (inclusive). */
  since?: number
  /** Unix seconds — upper bound (inclusive). */
  until?: number
  limit?: number
}

/**
 * List CAPI events for an org, sorted by eventTime descending.
 * Optionally filter by eventName and time range.
 */
export async function listCapiEvents(args: ListCapiEventsArgs): Promise<AdCapiEvent[]> {
  const limit = args.limit ?? 100

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = adminDb
    .collection(COLLECTION)
    .where('orgId', '==', args.orgId)

  if (args.eventName) {
    query = query.where('eventName', '==', args.eventName)
  }
  if (args.since !== undefined) {
    query = query.where('eventTime', '>=', Timestamp.fromMillis(args.since * 1000))
  }
  if (args.until !== undefined) {
    query = query.where('eventTime', '<=', Timestamp.fromMillis(args.until * 1000))
  }

  query = query.orderBy('eventTime', 'desc').limit(limit)

  const snap = await query.get()
  return snap.docs.map((d: { data: () => AdCapiEvent }) => d.data() as AdCapiEvent)
}

/**
 * Cheap exists-check for idempotency gate.
 * Returns true only when the doc exists AND belongs to the same org
 * (prevents cross-tenant collision on a shared event_id string).
 */
export async function wasEventProcessed(orgId: string, eventId: string): Promise<boolean> {
  const snap = await adminDb.collection(COLLECTION).doc(eventId).get()
  if (!snap.exists) return false
  const data = snap.data() as AdCapiEvent
  return data.orgId === orgId
}
