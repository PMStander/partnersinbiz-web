// lib/integrations/connections.ts
//
// CRUD for the `properties/{propertyId}/connections/{provider}` subcollection.
// Adapters call these — never write to the subcollection directly so we can
// keep encryption + audit fields consistent.

import { adminDb } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'
import type {
  Connection,
  ConnectionStatus,
  IntegrationProvider,
} from './types'
import {
  encryptCredentials,
  type EncryptedCredentials,
} from './crypto'

function connectionsCollection(propertyId: string) {
  return adminDb.collection('properties').doc(propertyId).collection('connections')
}

export async function getConnection(input: {
  propertyId: string
  provider: IntegrationProvider
}): Promise<Connection | null> {
  const snap = await connectionsCollection(input.propertyId)
    .doc(input.provider)
    .get()
  if (!snap.exists) return null
  return { id: snap.id, ...(snap.data() as Omit<Connection, 'id'>) }
}

export async function listConnectionsForProperty(propertyId: string): Promise<Connection[]> {
  const snap = await connectionsCollection(propertyId).get()
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Connection, 'id'>) }))
}

export async function listConnectionsForOrg(orgId: string): Promise<Connection[]> {
  const snap = await adminDb
    .collectionGroup('connections')
    .where('orgId', '==', orgId)
    .get()
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Connection, 'id'>) }))
}

/** All connections that are due for a daily pull (status=connected, not pulled today). */
export async function listDueConnections(today: string): Promise<Connection[]> {
  const snap = await adminDb
    .collectionGroup('connections')
    .where('status', '==', 'connected')
    .get()
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<Connection, 'id'>) }))
    .filter((c) => {
      // Skip if already pulled today (lastPulledAt is a Timestamp).
      const ts = c.lastPulledAt as { toDate?: () => Date } | null
      if (!ts || typeof ts.toDate !== 'function') return true
      const lastDate = ts.toDate().toISOString().slice(0, 10)
      return lastDate < today
    })
}

export interface UpsertConnectionInput {
  propertyId: string
  orgId: string
  provider: IntegrationProvider
  authKind: Connection['authKind']
  /** Plaintext credentials — encrypted before write. */
  credentials?: Record<string, unknown> | null
  meta?: Record<string, unknown>
  scope?: string[]
  status?: ConnectionStatus
  createdBy: string
  createdByType: Connection['createdByType']
}

export async function upsertConnection(input: UpsertConnectionInput): Promise<Connection> {
  const ref = connectionsCollection(input.propertyId).doc(input.provider)
  const existing = await ref.get()

  const credentialsEnc: EncryptedCredentials | null = input.credentials
    ? encryptCredentials(input.credentials, input.orgId)
    : existing.exists
      ? ((existing.data() as Connection).credentialsEnc ?? null)
      : null

  const now = FieldValue.serverTimestamp()
  const doc: Omit<Connection, 'id'> = {
    provider: input.provider,
    propertyId: input.propertyId,
    orgId: input.orgId,
    authKind: input.authKind,
    status: input.status ?? 'connected',
    credentialsEnc,
    meta: input.meta ?? (existing.exists ? (existing.data() as Connection).meta : {}),
    scope: input.scope ?? (existing.exists ? (existing.data() as Connection).scope : []),
    lastPulledAt: existing.exists ? (existing.data() as Connection).lastPulledAt : null,
    lastSuccessAt: existing.exists ? (existing.data() as Connection).lastSuccessAt : null,
    lastError: existing.exists ? (existing.data() as Connection).lastError : null,
    consecutiveFailures: existing.exists ? (existing.data() as Connection).consecutiveFailures : 0,
    backfilledThrough: existing.exists ? (existing.data() as Connection).backfilledThrough : null,
    createdAt: existing.exists ? (existing.data() as Connection).createdAt : now,
    updatedAt: now,
    createdBy: existing.exists ? (existing.data() as Connection).createdBy : input.createdBy,
    createdByType: existing.exists
      ? (existing.data() as Connection).createdByType
      : input.createdByType,
  }
  await ref.set(doc, { merge: false })
  return { id: input.provider, ...doc }
}

/** Mark a successful pull. Resets failure counter, sets timestamps. */
export async function markPullSuccess(input: {
  propertyId: string
  provider: IntegrationProvider
  backfilledThrough?: string
}): Promise<void> {
  const ref = connectionsCollection(input.propertyId).doc(input.provider)
  const update: Record<string, unknown> = {
    lastPulledAt: FieldValue.serverTimestamp(),
    lastSuccessAt: FieldValue.serverTimestamp(),
    lastError: null,
    consecutiveFailures: 0,
    updatedAt: FieldValue.serverTimestamp(),
  }
  if (input.backfilledThrough) update.backfilledThrough = input.backfilledThrough
  await ref.update(update)
}

/** Mark a failed pull. Increments counter; auto-pauses after 10 in a row. */
export async function markPullFailure(input: {
  propertyId: string
  provider: IntegrationProvider
  error: string
}): Promise<void> {
  const ref = connectionsCollection(input.propertyId).doc(input.provider)
  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) return
    const current = snap.data() as Connection
    const failures = (current.consecutiveFailures ?? 0) + 1
    const status: ConnectionStatus = failures >= 10 ? 'error' : current.status
    tx.update(ref, {
      lastPulledAt: FieldValue.serverTimestamp(),
      lastError: input.error.slice(0, 1000),
      consecutiveFailures: failures,
      status,
      updatedAt: FieldValue.serverTimestamp(),
    })
  })
}

export async function setConnectionStatus(input: {
  propertyId: string
  provider: IntegrationProvider
  status: ConnectionStatus
}): Promise<void> {
  await connectionsCollection(input.propertyId)
    .doc(input.provider)
    .update({
      status: input.status,
      updatedAt: FieldValue.serverTimestamp(),
    })
}

export async function deleteConnection(input: {
  propertyId: string
  provider: IntegrationProvider
}): Promise<void> {
  await connectionsCollection(input.propertyId).doc(input.provider).delete()
}
