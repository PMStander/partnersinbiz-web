import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { lastActorFrom } from '@/lib/api/actor'
import { logActivity } from '@/lib/activity/log'
import type { ApiUser } from '@/lib/api/types'

export const dynamic = 'force-dynamic'

export const GET = withAuth(
  'admin',
  async (_req: NextRequest, user: ApiUser, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params
    const snap = await adminDb.collection('seo_drafts').doc(id).get()
    if (!snap.exists) return apiError('Draft not found', 404)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = snap.data() as any
    if (user.role !== 'ai' && data.orgId !== user.orgId) return apiError('Access denied', 403)
    return apiSuccess({ id: snap.id, ...data })
  },
)

/**
 * PATCH /api/v1/seo/drafts/[id]
 * Body: { body?: string, metaDescription?: string, title?: string }
 *
 * Lets clients/admins edit the blog body inline. Updates the draft doc and
 * mirrors `title` to the parent seo_content doc when changed.
 */
export const PATCH = withAuth(
  'client',
  async (req: NextRequest, user: ApiUser, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params
    const ref = adminDb.collection('seo_drafts').doc(id)
    const snap = await ref.get()
    if (!snap.exists) return apiError('Draft not found', 404)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = snap.data() as any
    if (user.role !== 'ai' && user.role !== 'admin' && data.orgId !== user.orgId) {
      return apiError('Access denied', 403)
    }

    const body = await req.json().catch(() => ({}))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update: Record<string, any> = {}
    if (typeof body.body === 'string') update.body = body.body
    if (typeof body.metaDescription === 'string') update.metaDescription = body.metaDescription.slice(0, 320)
    if (typeof body.title === 'string' && body.title.trim().length > 0) update.title = body.title.trim()
    if (typeof body.body === 'string') {
      const words = body.body.split(/\s+/).filter(Boolean).length
      update.wordCount = words
    }

    if (Object.keys(update).length === 0) {
      return apiError('Nothing to update — provide body, metaDescription, or title', 400)
    }

    update.updatedAt = FieldValue.serverTimestamp()
    Object.assign(update, lastActorFrom(user))
    await ref.update(update)

    // Mirror title to the linked seo_content doc so list views stay in sync.
    if (update.title && data.contentId) {
      const contentRef = adminDb.collection('seo_content').doc(data.contentId)
      await contentRef.update({ title: update.title, updatedAt: FieldValue.serverTimestamp() }).catch(() => {})
    }

    // Activity log so agents know the client edited
    if (data.contentId) {
      const contentSnap = await adminDb.collection('seo_content').doc(data.contentId).get()
      const contentData = contentSnap.exists ? (contentSnap.data() as { title?: string; orgId?: string }) : null
      const userDoc = await adminDb.collection('users').doc(user.uid).get()
      const displayName = userDoc.exists ? (userDoc.data()?.displayName || user.uid) : user.uid
      const userRole = user.role === 'ai' ? 'ai' : user.role === 'admin' ? 'admin' : 'client'
      logActivity({
        orgId: contentData?.orgId ?? data.orgId,
        type: 'seo_content_edited',
        actorId: user.uid,
        actorName: displayName,
        actorRole: userRole,
        description: `Edited "${contentData?.title ?? data.title ?? id}" inline (${update.wordCount ?? '?'} words)`,
        entityId: data.contentId,
        entityType: 'seo_content',
        entityTitle: contentData?.title ?? data.title ?? id,
      }).catch(() => {})
    }

    return apiSuccess({ id, updated: Object.keys(update) })
  },
)
