import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import type { ChatEvent } from './types'

export const HERMES_CONVERSATIONS_COLLECTION = 'hermes_conversations'

export type HermesMessageRole = 'user' | 'assistant' | 'system' | 'tool'

export interface HermesMessage {
  id: string
  conversationId: string
  role: HermesMessageRole
  content: string
  runId?: string
  status?: 'pending' | 'streaming' | 'completed' | 'failed' | 'waiting_approval'
  error?: string
  events?: ChatEvent[]
  toolName?: string
  createdAt?: Timestamp | FieldValue
  createdBy?: string
}

export interface HermesConversation {
  id: string
  orgId: string
  profile: string
  title: string
  ownerUid: string
  participantUids: string[]
  projectId?: string
  scope?: 'org' | 'project'
  lastMessagePreview?: string
  lastMessageRole?: HermesMessageRole
  lastMessageAt?: Timestamp | FieldValue
  messageCount: number
  createdAt?: Timestamp | FieldValue
  updatedAt?: Timestamp | FieldValue
  archived?: boolean
}

export function conversationDoc(convId: string) {
  return adminDb.collection(HERMES_CONVERSATIONS_COLLECTION).doc(convId)
}

export function messagesCollection(convId: string) {
  return conversationDoc(convId).collection('messages')
}

export async function createConversation(input: {
  orgId: string
  profile: string
  ownerUid: string
  title?: string
  projectId?: string
}): Promise<HermesConversation> {
  const ref = adminDb.collection(HERMES_CONVERSATIONS_COLLECTION).doc()
  const data: Record<string, unknown> = {
    orgId: input.orgId,
    profile: input.profile,
    title: input.title?.trim() || 'New conversation',
    ownerUid: input.ownerUid,
    participantUids: [input.ownerUid],
    scope: input.projectId ? 'project' : 'org',
    messageCount: 0,
    archived: false,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }
  if (input.projectId) data.projectId = input.projectId
  await ref.set(data)
  return { id: ref.id, ...data } as HermesConversation
}

export async function listConversations(orgId: string, uid: string, opts: { limit?: number; projectId?: string } = {}) {
  let q = adminDb
    .collection(HERMES_CONVERSATIONS_COLLECTION)
    .where('orgId', '==', orgId)
    .where('participantUids', 'array-contains', uid) as FirebaseFirestore.Query
  if (opts.projectId) {
    q = q.where('projectId', '==', opts.projectId)
  }
  q = q.orderBy('updatedAt', 'desc').limit(opts.limit ?? 30)
  const snap = await q.get()
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as HermesConversation)
}

export async function getConversation(convId: string) {
  const doc = await conversationDoc(convId).get()
  if (!doc.exists) return null
  return { id: doc.id, ...doc.data() } as HermesConversation
}

export async function listMessages(convId: string, limit = 200) {
  const snap = await messagesCollection(convId).orderBy('createdAt', 'asc').limit(limit).get()
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as HermesMessage)
}

export async function appendMessage(
  convId: string,
  msg: Omit<HermesMessage, 'id' | 'conversationId' | 'createdAt'>,
): Promise<HermesMessage> {
  const ref = messagesCollection(convId).doc()
  const data = {
    conversationId: convId,
    ...msg,
    createdAt: FieldValue.serverTimestamp(),
  }
  await ref.set(data)
  return { id: ref.id, ...data } as HermesMessage
}

export async function touchConversation(
  convId: string,
  patch: Partial<Pick<HermesConversation, 'lastMessagePreview' | 'lastMessageRole' | 'title'>>,
) {
  const payload: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
    lastMessageAt: FieldValue.serverTimestamp(),
    messageCount: FieldValue.increment(1),
  }
  if (patch.lastMessagePreview !== undefined) payload.lastMessagePreview = patch.lastMessagePreview.slice(0, 200)
  if (patch.lastMessageRole !== undefined) payload.lastMessageRole = patch.lastMessageRole
  if (patch.title !== undefined) payload.title = patch.title
  await conversationDoc(convId).update(payload)
}

export async function updateMessage(convId: string, msgId: string, patch: Partial<HermesMessage>) {
  const clean: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) clean[k] = v
  }
  await messagesCollection(convId).doc(msgId).update(clean)
}
