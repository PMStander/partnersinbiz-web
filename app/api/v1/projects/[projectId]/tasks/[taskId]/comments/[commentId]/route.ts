import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ projectId: string; taskId: string; commentId: string }> }

// PATCH - Mark comment as agent picked up
export const PATCH = withAuth('admin', async (req: NextRequest, user, ctx) => {
  const { projectId, taskId, commentId } = await (ctx as RouteContext).params

  try {
    const body = await req.json()
    const { agentPickedUp } = body

    if (typeof agentPickedUp !== 'boolean') {
      return apiError('agentPickedUp must be a boolean', 400)
    }

    // Check task exists
    const taskRef = adminDb.collection('projects').doc(projectId).collection('tasks').doc(taskId)
    const taskDoc = await taskRef.get()
    if (!taskDoc.exists) return apiError('Task not found', 404)

    // Check comment exists
    const commentRef = taskRef.collection('comments').doc(commentId)
    const commentDoc = await commentRef.get()
    if (!commentDoc.exists) return apiError('Comment not found', 404)

    // Update comment
    const updateData: any = { agentPickedUp }
    if (agentPickedUp) {
      updateData.agentPickedUpAt = FieldValue.serverTimestamp()
    }

    await commentRef.update(updateData)

    return apiSuccess({ id: commentId })
  } catch (err) {
    console.error('Error updating comment:', err)
    return apiError('Failed to update comment', 500)
  }
})
