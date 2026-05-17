// lib/ads/comments.ts
//
// Per-ad inline comments (Sub-2b Feature A). Threaded one level deep — replies
// link to a parent via `parentCommentId`. Soft-delete via `deletedAt`.
//
// Collection: ad_comments
// Composite index: orgId ASC + adId ASC + createdAt DESC (firestore.indexes.json)

import { adminDb } from '@/lib/firebase/admin'
import { Timestamp } from 'firebase-admin/firestore'
import crypto from 'crypto'

const COLLECTION = 'ad_comments'

const MIN_TEXT_LEN = 1
const MAX_TEXT_LEN = 1000

export type AdCommentAuthorRole = 'admin' | 'member' | 'viewer' | 'owner' | 'client'

export interface AdComment {
  id: string
  orgId: string
  adId: string
  authorUid: string
  authorName: string
  authorRole: AdCommentAuthorRole
  /** 1-1000 chars after trim */
  text: string
  resolved: boolean
  /** Set when this comment is a reply to another comment. One level deep only. */
  parentCommentId?: string
  createdAt: Timestamp
  updatedAt: Timestamp
  /** Soft-delete marker. listComments excludes documents where this is set. */
  deletedAt?: Timestamp
}

export interface CreateCommentArgs {
  orgId: string
  adId: string
  authorUid: string
  authorName: string
  authorRole: AdCommentAuthorRole
  text: string
  parentCommentId?: string
}

export interface UpdateCommentPatch {
  text?: string
  resolved?: boolean
}

function validateText(text: string): string {
  if (typeof text !== 'string') {
    throw new Error('Comment text is required')
  }
  const trimmed = text.trim()
  if (trimmed.length < MIN_TEXT_LEN) {
    throw new Error('Comment text must not be empty')
  }
  if (trimmed.length > MAX_TEXT_LEN) {
    throw new Error(`Comment text must be ${MAX_TEXT_LEN} characters or fewer`)
  }
  return trimmed
}

/**
 * Lists non-deleted comments for an ad, newest first. Includes both top-level
 * comments and replies — the UI is responsible for nesting them by
 * `parentCommentId`.
 */
export async function listComments(args: {
  orgId: string
  adId: string
}): Promise<AdComment[]> {
  const snap = await adminDb
    .collection(COLLECTION)
    .where('orgId', '==', args.orgId)
    .where('adId', '==', args.adId)
    .get()

  const all = snap.docs.map((d) => d.data() as AdComment)

  return all
    .filter((c) => !c.deletedAt)
    .sort((a, b) => {
      const aMs = (a.createdAt?.seconds ?? 0) * 1000 + Math.floor((a.createdAt?.nanoseconds ?? 0) / 1e6)
      const bMs = (b.createdAt?.seconds ?? 0) * 1000 + Math.floor((b.createdAt?.nanoseconds ?? 0) / 1e6)
      return bMs - aMs
    })
}

export async function getComment(id: string): Promise<AdComment | null> {
  const snap = await adminDb.collection(COLLECTION).doc(id).get()
  if (!snap.exists) return null
  return snap.data() as AdComment
}

export async function createComment(args: CreateCommentArgs): Promise<AdComment> {
  const text = validateText(args.text)

  if (args.parentCommentId) {
    const parent = await getComment(args.parentCommentId)
    if (!parent || parent.deletedAt) {
      throw new Error('Parent comment not found')
    }
  }

  const id = `cmt_${crypto.randomBytes(8).toString('hex')}`
  const now = Timestamp.now()

  const doc: AdComment = {
    id,
    orgId: args.orgId,
    adId: args.adId,
    authorUid: args.authorUid,
    authorName: args.authorName,
    authorRole: args.authorRole,
    text,
    resolved: false,
    createdAt: now,
    updatedAt: now,
  }
  if (args.parentCommentId) doc.parentCommentId = args.parentCommentId

  await adminDb.collection(COLLECTION).doc(id).set(doc)
  return doc
}

export async function updateComment(
  id: string,
  patch: UpdateCommentPatch,
): Promise<AdComment> {
  const update: Record<string, unknown> = {
    updatedAt: Timestamp.now(),
  }

  if (patch.text !== undefined) {
    update.text = validateText(patch.text)
  }
  if (patch.resolved !== undefined) {
    update.resolved = Boolean(patch.resolved)
  }

  await adminDb.collection(COLLECTION).doc(id).update(update)

  const updated = await getComment(id)
  if (!updated) throw new Error('Comment not found after update')
  return updated
}

/** Soft-delete — sets deletedAt = now. listComments filters these out. */
export async function deleteComment(id: string): Promise<void> {
  const now = Timestamp.now()
  await adminDb
    .collection(COLLECTION)
    .doc(id)
    .update({
      deletedAt: now,
      updatedAt: now,
    })
}
