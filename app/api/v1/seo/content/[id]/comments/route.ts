/**
 * GET  /api/v1/seo/content/:id/comments — list comments for a blog
 * POST /api/v1/seo/content/:id/comments — add a comment
 *
 * Mirror of /api/v1/social/posts/:id/comments. When a non-author user posts a
 * comment AND the content is currently in `review` status, this acts as
 * "Request Changes" — status flips back to `idea`.
 */
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { lastActorFrom } from '@/lib/api/actor'
import { logActivity } from '@/lib/activity/log'
import type { ApiUser } from '@/lib/api/types'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

export const GET = withAuth(
  'client',
  async (_req: NextRequest, user: ApiUser, context?: unknown) => {
    const { id } = await (context as RouteContext).params
    const ref = adminDb.collection('seo_content').doc(id)
    const snap = await ref.get()
    if (!snap.exists) return apiError('Content not found', 404)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = snap.data() as any
    if (data.deleted) return apiError('Content not found', 404)
    if (user.role !== 'ai' && user.role !== 'admin' && data.orgId !== user.orgId) {
      return apiError('Access denied', 403)
    }

    const commentsSnap = await ref.collection('comments').orderBy('createdAt', 'asc').get()
    const comments = commentsSnap.docs.map((d) => {
      const c = d.data()
      return {
        id: d.id,
        text: c.text,
        userId: c.userId,
        userName: c.userName,
        userRole: c.userRole,
        createdAt: c.createdAt,
        agentPickedUp: c.agentPickedUp ?? false,
        agentPickedUpAt: c.agentPickedUpAt ?? null,
        anchor: c.anchor ?? null,
      }
    })

    return apiSuccess(comments)
  },
)

export const POST = withAuth(
  'client',
  async (req: NextRequest, user: ApiUser, context?: unknown) => {
    const { id } = await (context as RouteContext).params
    const body = await req.json().catch(() => ({}))
    const text: unknown = body?.text
    if (typeof text !== 'string' || text.trim() === '') {
      return apiError('Comment text is required and cannot be empty', 400)
    }

    const ref = adminDb.collection('seo_content').doc(id)
    const snap = await ref.get()
    if (!snap.exists) return apiError('Content not found', 404)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = snap.data() as any
    if (data.deleted) return apiError('Content not found', 404)
    if (user.role !== 'ai' && user.role !== 'admin' && data.orgId !== user.orgId) {
      return apiError('Access denied', 403)
    }

    const userDoc = await adminDb.collection('users').doc(user.uid).get()
    const displayName = userDoc.exists
      ? (userDoc.data()?.displayName || user.uid)
      : user.uid
    const userRole = user.role === 'ai' ? 'ai' : user.role === 'admin' ? 'admin' : 'client'

    // Optional anchor — agents and the UI use this to know exactly what the
    // client commented on. Validated permissively; arbitrary fields are dropped.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawAnchor = body?.anchor as any
    let anchor: {
      type: 'text' | 'image'
      text?: string
      offset?: number
      mediaUrl?: string
    } | null = null
    if (rawAnchor && (rawAnchor.type === 'text' || rawAnchor.type === 'image')) {
      anchor = { type: rawAnchor.type }
      if (rawAnchor.type === 'text' && typeof rawAnchor.text === 'string') {
        anchor.text = String(rawAnchor.text).slice(0, 400)
        if (typeof rawAnchor.offset === 'number' && rawAnchor.offset >= 0) {
          anchor.offset = Math.floor(rawAnchor.offset)
        }
      }
      if (rawAnchor.type === 'image' && typeof rawAnchor.mediaUrl === 'string') {
        anchor.mediaUrl = String(rawAnchor.mediaUrl).slice(0, 1000)
      }
    }

    const commentRef = ref.collection('comments').doc()
    const commentData = {
      text: text.trim(),
      userId: user.uid,
      userName: displayName,
      userRole,
      createdAt: FieldValue.serverTimestamp(),
      agentPickedUp: false,
      ...(anchor ? { anchor } : {}),
    }
    await commentRef.set(commentData)

    // "Request Changes": non-author user comments while in review -> back to idea
    let statusFlipped = false
    const isAuthor = data.createdBy && data.createdBy === user.uid
    if (!isAuthor && data.status === 'review') {
      await ref.update({
        status: 'idea',
        ...lastActorFrom(user),
      })
      statusFlipped = true
    }

    // Activity log (fire and forget). Include anchor preview so agents know
    // what the client was looking at without re-fetching the comment.
    const anchorPreview =
      anchor?.type === 'text'
        ? ` re: "${(anchor.text ?? '').slice(0, 60)}…"`
        : anchor?.type === 'image'
          ? ' re: image'
          : ''
    logActivity({
      orgId: data.orgId,
      type: statusFlipped ? 'seo_content_changes_requested' : 'seo_content_commented',
      actorId: user.uid,
      actorName: displayName,
      actorRole: userRole,
      description: statusFlipped
        ? `Requested changes on "${data.title ?? id}"${anchorPreview}: "${text.trim().slice(0, 80)}"`
        : `Commented on "${data.title ?? id}"${anchorPreview}: "${text.trim().slice(0, 80)}"`,
      entityId: id,
      entityType: 'seo_content',
      entityTitle: data.title ?? id,
    }).catch(() => {})

    return apiSuccess({
      id: commentRef.id,
      ...commentData,
      createdAt: new Date(),
      statusFlipped,
    })
  },
)
