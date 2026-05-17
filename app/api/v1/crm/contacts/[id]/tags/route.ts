/**
 * POST /api/v1/crm/contacts/[id]/tags — atomically add/remove tags on a contact
 *
 * Body: { add?: string[], remove?: string[] }
 *
 * Uses Firestore `FieldValue.arrayUnion` + `FieldValue.arrayRemove` in a single
 * update so repeated calls are safe (tags stay deduped) and no read-modify-write
 * race exists.
 *
 * Auth: member+ (downgraded from admin per PR 2 role matrix — tags are routine CRM ops)
 */
import { adminDb } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'
import { withCrmAuth } from '@/lib/auth/crm-middleware'
import { apiSuccess, apiError } from '@/lib/api/response'
import { snapshotForWrite } from '@/lib/orgMembers/memberRef'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

export const POST = withCrmAuth<RouteContext>(
  'member',
  async (req, ctx, routeCtx) => {
    const { id } = await routeCtx!.params

    const ref = adminDb.collection('contacts').doc(id)
    const snap = await ref.get()
    if (!snap.exists) return apiError('Contact not found', 404)

    // Tenant isolation — contact must belong to the caller's org
    const data = snap.data()!
    if (data.orgId !== ctx.orgId) return apiError('Contact not found', 404)

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

    // Resolve actor reference
    const actorRef = ctx.isAgent
      ? ctx.actor
      : await snapshotForWrite(ctx.orgId, ctx.actor.uid)

    const actorPatch: Record<string, unknown> = {
      updatedBy: ctx.isAgent ? undefined : ctx.actor.uid,
      updatedByRef: actorRef,
      updatedAt: FieldValue.serverTimestamp(),
    }
    const sanitizedActorPatch = Object.fromEntries(
      Object.entries(actorPatch).filter(([, v]) => v !== undefined),
    )

    if (remove.length > 0) {
      // arrayUnion and arrayRemove cannot both target `tags` in a single update;
      // run the add first (if present), then remove.
      if (add.length > 0) {
        await ref.update({ tags: FieldValue.arrayUnion(...add), ...sanitizedActorPatch })
        await ref.update({ tags: FieldValue.arrayRemove(...remove), ...sanitizedActorPatch })
      } else {
        await ref.update({ tags: FieldValue.arrayRemove(...remove), ...sanitizedActorPatch })
      }
    } else {
      await ref.update({ tags: FieldValue.arrayUnion(...add), ...sanitizedActorPatch })
    }

    const fresh = await ref.get()
    const updatedTags: string[] = fresh.data()?.tags ?? []
    return apiSuccess({ id, tags: updatedTags })
  },
)
