import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { getProjectForUser } from '@/lib/projects/access'
import {
  buildProjectTaskUpdateData,
  notificationPriority,
} from '@/lib/projects/taskPayload'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ projectId: string; taskId: string }> }

export const PATCH = withAuth('client', async (req: NextRequest, user, ctx) => {
  const { projectId, taskId } = await (ctx as RouteContext).params
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const access = await getProjectForUser(projectId, user)
  if (!access.ok) return apiError(access.error, access.status)

  const ref = adminDb.collection('projects').doc(projectId).collection('tasks').doc(taskId)
  const doc = await ref.get()
  if (!doc.exists) return apiError('Task not found', 404)

  const updates = buildProjectTaskUpdateData(body)
  if (!updates.ok) return apiError(updates.error, updates.status ?? 400)

  // Sentinel swap — the payload builder is pure JSON and can't emit FieldValue.serverTimestamp() itself.
  if (updates.value.agentHeartbeatAt === '__server_timestamp__') {
    updates.value.agentHeartbeatAt = FieldValue.serverTimestamp()
  }

  await ref.update({ ...updates.value, updatedAt: FieldValue.serverTimestamp() })

  const existing = doc.data() ?? {}
  const previousAssignees = new Set(Array.isArray(existing.assigneeIds) ? existing.assigneeIds : existing.assigneeId ? [existing.assigneeId] : [])
  const nextAssignees = Array.isArray(updates.value.assigneeIds)
    ? updates.value.assigneeIds.filter((id): id is string => typeof id === 'string')
    : updates.value.assigneeId
      ? [String(updates.value.assigneeId)]
      : []
  const newAssignees = nextAssignees.filter(id => !previousAssignees.has(id) && id !== user.uid)

  if (newAssignees.length > 0) {
    const projectDoc = await adminDb.collection('projects').doc(projectId).get()
    const orgId = projectDoc.data()?.orgId
    if (typeof orgId === 'string') {
      const title = String(updates.value.title ?? existing.title ?? 'Task')
      for (const userId of newAssignees) {
        adminDb.collection('notifications').add({
          orgId,
          userId,
          agentId: null,
          type: 'task.assigned',
          title: 'Task assigned to you',
          body: title,
          link: `/admin/projects/${projectId}?task=${taskId}`,
          data: { projectId, taskId },
          status: 'unread',
          priority: notificationPriority(updates.value.priority ?? existing.priority),
          snoozedUntil: null,
          readAt: null,
          createdAt: FieldValue.serverTimestamp(),
        }).catch(() => {})
      }
    }
  }

  return apiSuccess({ id: taskId })
})

export const DELETE = withAuth('client', async (req: NextRequest, user, ctx) => {
  const { projectId, taskId } = await (ctx as RouteContext).params
  const access = await getProjectForUser(projectId, user)
  if (!access.ok) return apiError(access.error, access.status)
  await adminDb.collection('projects').doc(projectId).collection('tasks').doc(taskId).delete()
  return apiSuccess({ deleted: true })
})
