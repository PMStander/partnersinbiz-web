/**
 * POST /api/v1/tasks/:id/complete — mark a task as done
 *
 * Auth: admin (AI/admin)
 */
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { lastActorFrom } from '@/lib/api/actor'
import { apiSuccess, apiError } from '@/lib/api/response'
import type { Task } from '@/lib/tasks/types'
import { dispatchWebhook } from '@/lib/webhooks/dispatch'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

export const POST = withAuth('admin', async (_req, user, context) => {
  const { id } = await (context as RouteContext).params
  const ref = adminDb.collection('tasks').doc(id)
  const doc = await ref.get()
  if (!doc.exists) return apiError('Task not found', 404)
  const existing = doc.data() as Task | undefined
  if (!existing || existing.deleted === true) {
    return apiError('Task not found', 404)
  }

  await ref.update({
    status: 'done',
    completedAt: FieldValue.serverTimestamp(),
    ...lastActorFrom(user),
  })

  if (existing.orgId) {
    try {
      await dispatchWebhook(existing.orgId, 'task.completed', {
        id,
        title: existing.title,
        projectId: existing.projectId ?? null,
        completedBy: user.uid,
      })
    } catch (err) {
      console.error('[webhook-dispatch-error] task.completed', err)
    }
  }
  return apiSuccess({ id, status: 'done' })
})
