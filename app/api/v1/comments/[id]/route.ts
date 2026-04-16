/**
 * GET    /api/v1/comments/[id] — fetch a single comment (404 if deleted)
 * PATCH  /api/v1/comments/[id] — update body / agentPickedUp / attachments
 * DELETE /api/v1/comments/[id] — soft-delete (force=true to hard-delete)
 */
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { lastActorFrom } from '@/lib/api/actor'
import { apiSuccess, apiError } from '@/lib/api/response'
import { parseMentions } from '@/lib/comments/mentions'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

export const GET = withAuth('admin', async (req, user, ctx) => {
  const { id } = await (ctx as RouteContext).params
  const doc = await adminDb.collection('comments').doc(id).get()
  if (!doc.exists) return apiError('Comment not found', 404)
  const data = doc.data()!
  if (data.deleted === true) return apiError('Comment not found', 404)
  return apiSuccess({ id: doc.id, ...data })
})

/**
 * PATCH body: `{ body?: string, agentPickedUp?: boolean, attachments?: string[] }`
 *  - If `body` changes: re-parse mentions (and re-derive mentionIds).
 *    Design decision: do NOT re-notify — only the initial post notifies.
 *  - If `agentPickedUp` flips false -> true: set `agentPickedUpAt` now.
 *  - Always records `...lastActorFrom(user)`.
 */
export const PATCH = withAuth('admin', async (req, user, ctx) => {
  const { id } = await (ctx as RouteContext).params
  const ref = adminDb.collection('comments').doc(id)
  const doc = await ref.get()
  if (!doc.exists) return apiError('Comment not found', 404)
  const current = doc.data()!
  if (current.deleted === true) return apiError('Comment not found', 404)

  const body = await req.json().catch(() => ({}))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: Record<string, any> = { ...lastActorFrom(user) }

  if (typeof body.body === 'string') {
    const text = body.body
    if (!text.trim()) return apiError('body cannot be empty')
    const mentions = parseMentions(text)
    updates.body = text
    updates.mentions = mentions
    updates.mentionIds = mentions.map((m) => `${m.type}:${m.id}`)
  }

  if (typeof body.agentPickedUp === 'boolean') {
    updates.agentPickedUp = body.agentPickedUp
    if (body.agentPickedUp === true && current.agentPickedUp !== true) {
      updates.agentPickedUpAt = FieldValue.serverTimestamp()
    }
  }

  if (Array.isArray(body.attachments)) {
    updates.attachments = body.attachments.filter((a: unknown) => typeof a === 'string')
  }

  await ref.update(updates)
  return apiSuccess({ id })
})

/**
 * DELETE — soft-delete by default, or `?force=true` to hard-delete.
 */
export const DELETE = withAuth('admin', async (req, user, ctx) => {
  const { id } = await (ctx as RouteContext).params
  const { searchParams } = new URL(req.url)
  const force = searchParams.get('force') === 'true'

  const ref = adminDb.collection('comments').doc(id)
  const doc = await ref.get()
  if (!doc.exists) return apiError('Comment not found', 404)

  if (force) {
    await ref.delete()
    return apiSuccess({ id, deleted: true, hard: true })
  }

  await ref.update({
    deleted: true,
    ...lastActorFrom(user),
  })
  return apiSuccess({ id, deleted: true, hard: false })
})
