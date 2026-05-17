// app/api/v1/portal/ads/ads/[id]/comments/route.ts
//
// Portal-side per-ad comment list + create. Auth: viewer+ for GET, member+ for POST.
import { NextRequest } from 'next/server'
import { withPortalAuthAndRole } from '@/lib/auth/portal-middleware'
import { apiSuccess, apiError } from '@/lib/api/response'
import { getAd } from '@/lib/ads/ads/store'
import { listComments, createComment } from '@/lib/ads/comments'
import { logActivity } from '@/lib/activity/log'
import type { OrgRole } from '@/lib/organizations/types'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export const GET = withPortalAuthAndRole(
  'viewer',
  async (_req: NextRequest, _uid: string, orgId: string, _role: OrgRole, ctx?: unknown) => {
    const { id } = await (ctx as Ctx).params

    const ad = await getAd(id)
    if (!ad || ad.orgId !== orgId) return apiError('Ad not found', 404)

    const comments = await listComments({ orgId, adId: id })
    return apiSuccess(comments)
  },
) as any

export const POST = withPortalAuthAndRole(
  'member',
  async (req: NextRequest, uid: string, orgId: string, role: OrgRole, ctx?: unknown) => {
    const { id } = await (ctx as Ctx).params

    const ad = await getAd(id)
    if (!ad || ad.orgId !== orgId) return apiError('Ad not found', 404)

    let body: { text?: string; parentCommentId?: string }
    try {
      body = (await req.json()) as { text?: string; parentCommentId?: string }
    } catch {
      return apiError('Invalid JSON body', 400)
    }

    if (typeof body.text !== 'string' || body.text.trim().length === 0) {
      return apiError('text is required', 400)
    }
    if (body.text.trim().length > 1000) {
      return apiError('text must be 1000 characters or fewer', 400)
    }

    let comment
    try {
      comment = await createComment({
        orgId,
        adId: id,
        authorUid: uid,
        authorName: 'Client',
        authorRole: 'client',
        text: body.text,
        parentCommentId: body.parentCommentId,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create comment'
      return apiError(msg, 400)
    }

    // Best-effort activity log
    try {
      await logActivity({
        orgId,
        type: 'ad.comment_added',
        actorId: uid,
        actorName: 'Client',
        actorRole: 'client',
        description: `Commented on ad "${ad.name}"`,
        entityId: id,
        entityType: 'ad',
        entityTitle: ad.name,
      })
    } catch (err) {
      console.error('[portal/ads/comments] Activity log failed:', err)
    }

    // Use role so the linter doesn't gripe — kept for future per-role auth tweaks
    void role

    return apiSuccess(comment, 201)
  },
) as any
