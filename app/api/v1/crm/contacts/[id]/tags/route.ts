/**
 * POST /api/v1/crm/contacts/[id]/tags — atomically add/remove tags on a contact
 *
 * Body: { add?: string[], remove?: string[] }
 *
 * Uses Firestore `FieldValue.arrayUnion` + `FieldValue.arrayRemove` in a single
 * update so repeated calls are safe (tags stay deduped) and no read-modify-write
 * race exists.
 *
 * Auth: admin
 */
import { adminDb } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { lastActorFrom } from '@/lib/api/actor'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

export const POST = withAuth('admin', async (req, user, ctx) => {
  const { id } = await (ctx as RouteContext).params

  const ref = adminDb.collection('contacts').doc(id)
  const snap = await ref.get()
  if (!snap.exists) return apiError('Contact not found', 404)

  const body = await req.json().catch(() => ({}))
  const add = Array.isArray(body.add)
    ? (body.add as unknown[]).filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
    : []
  const remove = Array.isArray(body.remove)
    ? (body.remove as unknown[]).filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
    : []

  if (add.length === 0 && remove.length === 0) {
    return apiError('Provide add[] and/or remove[] to update tags', 400)
  }

  const updates: Record<string, unknown> = { ...lastActorFrom(user) }
  if (add.length > 0) updates.tags = FieldValue.arrayUnion(...add)

  if (remove.length > 0) {
    // arrayUnion and arrayRemove cannot both target `tags` in a single update;
    // run the add first (if present), then remove.
    if (add.length > 0) {
      await ref.update(updates)
      await ref.update({
        tags: FieldValue.arrayRemove(...remove),
        ...lastActorFrom(user),
      })
    } else {
      updates.tags = FieldValue.arrayRemove(...remove)
      await ref.update(updates)
    }
  } else {
    await ref.update(updates)
  }

  const fresh = await ref.get()
  const updatedTags: string[] = fresh.data()?.tags ?? []
  return apiSuccess({ id, tags: updatedTags })
})
