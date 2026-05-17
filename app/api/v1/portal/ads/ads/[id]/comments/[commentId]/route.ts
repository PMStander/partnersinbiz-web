// app/api/v1/portal/ads/ads/[id]/comments/[commentId]/route.ts
//
// Portal-side per-comment PATCH (edit text / toggle resolved) and DELETE (soft).
// Authorization: comment.authorUid === uid OR role ∈ {admin, owner}.
import { NextRequest } from 'next/server'
import { withPortalAuthAndRole } from '@/lib/auth/portal-middleware'
import { apiSuccess, apiError } from '@/lib/api/response'
import { getAd } from '@/lib/ads/ads/store'
import { getComment, updateComment, deleteComment } from '@/lib/ads/comments'
import { logActivity } from '@/lib/activity/log'
import type { OrgRole } from '@/lib/organizations/types'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string; commentId: string }> }

function canMutate(role: OrgRole, authorUid: string, uid: string): boolean {
  if (authorUid === uid) return true
  return role === 'admin' || role === 'owner'
}

export const PATCH = withPortalAuthAndRole(
  'member',
  async (req: NextRequest, uid: string, orgId: string, role: OrgRole, ctx?: unknown) => {
    const { id, commentId } = await (ctx as Ctx).params

    const ad = await getAd(id)
    if (!ad || ad.orgId !== orgId) return apiError('Ad not found', 404)

    const existing = await getComment(commentId)
    if (!existing || existing.orgId !== orgId || existing.adId !== id || existing.deletedAt) {
      return apiError('Comment not found', 404)
    }

    if (!canMutate(role, existing.authorUid, uid)) {
      return apiError('Forbidden', 403)
    }

    let body: { text?: string; resolved?: boolean }
    try {
      body = (await req.json()) as { text?: string; resolved?: boolean }
    } catch {
      return apiError('Invalid JSON body', 400)
    }

    const resolvedToggled =
      typeof body.resolved === 'boolean' && body.resolved !== existing.resolved

    let updated
    try {
      updated = await updateComment(commentId, {
        text: body.text,
        resolved: body.resolved,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update comment'
      return apiError(msg, 400)
    }

    if (resolvedToggled) {
      try {
        await logActivity({
          orgId,
          type: 'ad.comment_resolved',
          actorId: uid,
          actorName: 'Client',
          actorRole: 'client',
          description: body.resolved
            ? `Resolved a comment on ad "${ad.name}"`
            : `Reopened a comment on ad "${ad.name}"`,
          entityId: id,
          entityType: 'ad',
          entityTitle: ad.name,
        })
      } catch (err) {
        console.error('[portal/ads/comments] Activity log failed:', err)
      }
    }

    return apiSuccess(updated)
  },
) as any

export const DELETE = withPortalAuthAndRole(
  'member',
  async (_req: NextRequest, uid: string, orgId: string, role: OrgRole, ctx?: unknown) => {
    const { id, commentId } = await (ctx as Ctx).params

    const ad = await getAd(id)
    if (!ad || ad.orgId !== orgId) return apiError('Ad not found', 404)

    const existing = await getComment(commentId)
    if (!existing || existing.orgId !== orgId || existing.adId !== id || existing.deletedAt) {
      return apiError('Comment not found', 404)
    }

    if (!canMutate(role, existing.authorUid, uid)) {
      return apiError('Forbidden', 403)
    }

    await deleteComment(commentId)
    return apiSuccess({ ok: true })
  },
) as any
