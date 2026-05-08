/**
 * DELETE /api/v1/seo/content/:id/comments/:commentId
 */
import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import type { ApiUser } from '@/lib/api/types'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string; commentId: string }> }

export const DELETE = withAuth(
  'client',
  async (_req: NextRequest, user: ApiUser, context?: unknown) => {
    const { id, commentId } = await (context as RouteContext).params

    const contentRef = adminDb.collection('seo_content').doc(id)
    const contentSnap = await contentRef.get()
    if (!contentSnap.exists) return apiError('Content not found', 404)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = contentSnap.data() as any
    if (data.deleted) return apiError('Content not found', 404)
    if (user.role !== 'ai' && user.role !== 'admin' && data.orgId !== user.orgId) {
      return apiError('Access denied', 403)
    }

    const commentRef = contentRef.collection('comments').doc(commentId)
    const commentSnap = await commentRef.get()
    if (!commentSnap.exists) return apiError('Comment not found', 404)

    // Author or admin/ai can delete
    const commentData = commentSnap.data()!
    const isAuthor = commentData.userId === user.uid
    if (!isAuthor && user.role !== 'admin' && user.role !== 'ai') {
      return apiError('Forbidden', 403)
    }

    await commentRef.delete()
    return apiSuccess({ id: commentId, deleted: true })
  },
)
