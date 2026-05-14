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
import { sendEmail } from '@/lib/email/send'
import { getHermesProfileLink, createHermesRun } from '@/lib/hermes/server'
import { getOrgManagerEmails } from '@/lib/organizations/manager-emails'
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

    // --- Side-effects (fire-and-forget, never block the response) ---

    // 1. Notification
    const anchorPreviewShort =
      anchor?.type === 'text'
        ? ` re: "${(anchor.text ?? '').slice(0, 60)}…"`
        : anchor?.type === 'image'
          ? ' re: image'
          : ''
    const notifLink = `/admin/org/${data.orgSlug ?? data.orgId}/social/${data.campaignId ?? data.sprintId ?? ''}/blog/${id}`
    adminDb
      .collection('notifications')
      .add({
        orgId: data.orgId,
        userId: null,
        agentId: null,
        type: statusFlipped ? 'seo_content_changes_requested' : 'seo_content_commented',
        title: statusFlipped
          ? `Changes requested on "${data.title ?? id}"`
          : `New comment on "${data.title ?? id}"`,
        body: `${displayName}${anchorPreviewShort}: "${text.trim().slice(0, 120)}"`,
        link: notifLink,
        data: { contentId: id, orgId: data.orgId, commentId: commentRef.id },
        priority: statusFlipped ? 'high' : 'normal',
        status: 'unread',
        snoozedUntil: null,
        readAt: null,
        createdAt: FieldValue.serverTimestamp(),
      })
      .catch(() => {})

    // 2. Email (changes-requested only — keep noise low)
    if (statusFlipped) {
      const emailAnchorPreview =
        anchor?.type === 'text'
          ? ` re: "${(anchor.text ?? '').slice(0, 60)}…"`
          : anchor?.type === 'image'
            ? ' re: image'
            : ''
      getOrgManagerEmails(data.orgId).then(emails =>
        Promise.all(emails.map(email => sendEmail({
          to: email,
          subject: `⚠️ Changes requested on "${data.title ?? id}" by ${displayName}`,
          html: `<p>${displayName} requested changes on <strong>${data.title ?? id}</strong>:</p><blockquote>${text.trim()}</blockquote>${emailAnchorPreview ? `<p><em>On: ${emailAnchorPreview}</em></p>` : ''}<p><a href="https://partnersinbiz.online/admin/org/${data.orgId}/social">View in admin</a></p>`,
        })))
      ).catch(() => {})
    }

    // 3. Hermes dispatch (changes-requested only)
    if (statusFlipped) {
      getHermesProfileLink(data.orgId)
        .then((link) => {
          if (!link) return
          const anchorHint =
            anchor?.type === 'text'
              ? ` Specifically about this passage: "${(anchor.text ?? '').slice(0, 120)}"`
              : anchor?.type === 'image'
                ? ' (on an image in the post)'
                : ''
          return createHermesRun(link, user.uid, {
            prompt: `Client ${displayName} requested changes on blog post "${data.title ?? id}".${anchorHint} Their comment: "${text.trim().slice(0, 300)}". Please review the comment, revise the draft accordingly, and update the post status back to 'review' when done. Content ID: ${id}`,
          })
        })
        .catch(() => {})
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
