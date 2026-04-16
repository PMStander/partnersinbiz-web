/**
 * Mention parser + notifier for unified comments.
 *
 * We keep the comment `body` intact — the UI renders mentions inline from the
 * raw match — and return a de-duplicated `Mention[]` that the route then
 * persists on the comment document.
 */
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import type { Mention } from './types'

/** Regex capturing `@user:<id>` and `@agent:<id>` mentions. */
const MENTION_RE = /@(user|agent):([a-zA-Z0-9_-]+)/g

/**
 * Parse `@user:<id>` and `@agent:<id>` mentions out of a comment body.
 *
 * Returns a `Mention[]` de-duplicated by `${type}:${id}`. The comment body
 * itself is left untouched — the UI highlights mentions using `raw`.
 */
export function parseMentions(body: string): Mention[] {
  if (!body || typeof body !== 'string') return []

  const seen = new Set<string>()
  const mentions: Mention[] = []

  // Reset the regex lastIndex on a fresh string (safe for the /g flag).
  MENTION_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = MENTION_RE.exec(body)) !== null) {
    const [raw, type, id] = match
    if (type !== 'user' && type !== 'agent') continue
    const key = `${type}:${id}`
    if (seen.has(key)) continue
    seen.add(key)
    mentions.push({ type, id, raw })
  }

  return mentions
}

export interface NotifyMentionsParams {
  orgId: string
  mentions: Mention[]
  commentId: string
  resourceType: string
  resourceId: string
  /** Display name of the actor who posted the comment (for the notification title). */
  actorName: string
  /** First ~100 chars of the comment body (for the notification body). */
  snippet: string
}

/**
 * Write one `notifications` document per mention. Fire-and-forget from the
 * route — errors are caught by the caller via `.catch(console.error)`.
 *
 * Design decision: notifications only fire on the *initial* comment create.
 * Editing a comment to add new mentions does NOT re-notify.
 */
export async function notifyMentions(params: NotifyMentionsParams): Promise<void> {
  const { orgId, mentions, commentId, resourceType, resourceId, actorName, snippet } = params
  if (!mentions.length) return

  const batch = adminDb.batch()
  const notifsRef = adminDb.collection('notifications')

  for (const m of mentions) {
    const ref = notifsRef.doc()
    batch.set(ref, {
      orgId,
      userId: m.type === 'user' ? m.id : null,
      agentId: m.type === 'agent' ? m.id : null,
      type: 'mention',
      title: `${actorName} mentioned you`,
      body: snippet,
      link: `/admin/${resourceType}s/${resourceId}`,
      status: 'unread',
      priority: 'normal',
      data: { commentId, resourceType, resourceId },
      createdAt: FieldValue.serverTimestamp(),
    })
  }

  await batch.commit()
}
