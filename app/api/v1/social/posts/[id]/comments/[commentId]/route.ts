/**
 * PATCH /api/v1/social/posts/:id/comments/:commentId — mark comment as picked up by agent
 */
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { withTenant } from '@/lib/api/tenant'
import { apiSuccess, apiError } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string; commentId: string }> }

/**
 * PATCH — mark comment as agentPickedUp: true
 * Only admins can mark comments as picked up
 */
export const PATCH = withAuth('admin', withTenant(async (req, user, orgId, context) => {
  const { id, commentId } = await (context as RouteContext).params

  try {
    const postRef = adminDb.collection('social_posts').doc(id)
    const postDoc = await postRef.get()

    // Verify post exists and belongs to org
    if (!postDoc.exists) {
      return apiError('Post not found', 404)
    }

    const postData = postDoc.data()!
    if (postData.orgId && postData.orgId !== orgId) {
      return apiError('Post not found', 404)
    }

    // Get the comment
    const commentRef = postRef.collection('comments').doc(commentId)
    const commentDoc = await commentRef.get()

    if (!commentDoc.exists) {
      return apiError('Comment not found', 404)
    }

    // Mark as picked up
    await commentRef.update({
      agentPickedUp: true,
      agentPickedUpAt: FieldValue.serverTimestamp(),
    })

    const updatedDoc = await commentRef.get()
    const updatedData = updatedDoc.data()!

    return apiSuccess({
      id: commentDoc.id,
      text: updatedData.text,
      userId: updatedData.userId,
      userName: updatedData.userName,
      userRole: updatedData.userRole,
      createdAt: updatedData.createdAt,
      agentPickedUp: updatedData.agentPickedUp,
      agentPickedUpAt: updatedData.agentPickedUpAt,
    })
  } catch (err) {
    console.error('Error updating comment:', err)
    return apiError('Failed to update comment', 500)
  }
}))
