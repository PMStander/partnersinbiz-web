/**
 * GET  /api/v1/tasks — list tasks (filterable, paginated)
 * POST /api/v1/tasks — create a new task (idempotent via Idempotency-Key header)
 *
 * Auth: admin (AI/admin)
 */
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { withIdempotency } from '@/lib/api/idempotency'
import { actorFrom } from '@/lib/api/actor'
import { apiSuccess, apiError } from '@/lib/api/response'
import {
  VALID_TASK_STATUSES,
  VALID_TASK_PRIORITIES,
  VALID_ASSIGNEE_TYPES,
  type Task,
  type TaskInput,
  type TaskStatus,
  type TaskPriority,
  type TaskAssignee,
} from '@/lib/tasks/types'

export const dynamic = 'force-dynamic'

export const GET = withAuth('admin', async (req) => {
  const { searchParams } = new URL(req.url)

  const orgId = searchParams.get('orgId')
  if (!orgId) return apiError('orgId is required; pass it as a query param')

  const status = searchParams.get('status') as TaskStatus | null
  const priority = searchParams.get('priority') as TaskPriority | null
  const assignedToRaw = searchParams.get('assignedTo') // "user:abc" | "agent:xyz"
  const projectId = searchParams.get('projectId')
  const contactId = searchParams.get('contactId')
  const dealId = searchParams.get('dealId')
  const dueBefore = searchParams.get('dueBefore')
  const dueAfter = searchParams.get('dueAfter')
  const tagsParam = searchParams.get('tags')

  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200)
  const page = Math.max(parseInt(searchParams.get('page') ?? '1'), 1)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = adminDb
    .collection('tasks')
    .where('orgId', '==', orgId)
    .orderBy('createdAt', 'desc')

  if (status && VALID_TASK_STATUSES.includes(status)) {
    query = query.where('status', '==', status)
  }
  if (priority && VALID_TASK_PRIORITIES.includes(priority)) {
    query = query.where('priority', '==', priority)
  }
  if (assignedToRaw) {
    const [type, ...rest] = assignedToRaw.split(':')
    const id = rest.join(':')
    if (VALID_ASSIGNEE_TYPES.includes(type as TaskAssignee['type']) && id) {
      query = query
        .where('assignedTo.type', '==', type)
        .where('assignedTo.id', '==', id)
    }
  }
  if (projectId) query = query.where('projectId', '==', projectId)
  if (contactId) query = query.where('contactId', '==', contactId)
  if (dealId) query = query.where('dealId', '==', dealId)
  if (dueBefore) query = query.where('dueDate', '<=', dueBefore)
  if (dueAfter) query = query.where('dueDate', '>=', dueAfter)

  if (tagsParam) {
    const tags = tagsParam
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 10)
    if (tags.length > 0) {
      query = query.where('tags', 'array-contains-any', tags)
    }
  }

  const snapshot = await query
    .limit(limit)
    .offset((page - 1) * limit)
    .get()

  const tasks: Task[] = snapshot.docs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((doc: any) => ({ id: doc.id, ...doc.data() }))
    .filter((t: Task) => t.deleted !== true)

  return apiSuccess(tasks, 200, { total: tasks.length, page, limit })
})

export const POST = withAuth(
  'admin',
  withIdempotency(async (req, user) => {
    const body = (await req.json()) as TaskInput & { orgId?: string }

    if (!body.orgId?.trim()) return apiError('orgId is required')
    if (!body.title?.trim()) return apiError('Title is required')

    if (body.status && !VALID_TASK_STATUSES.includes(body.status)) {
      return apiError('Invalid status; expected todo | in_progress | done | cancelled')
    }
    if (body.priority && !VALID_TASK_PRIORITIES.includes(body.priority)) {
      return apiError('Invalid priority; expected low | normal | high | urgent')
    }
    if (
      body.assignedTo &&
      !VALID_ASSIGNEE_TYPES.includes(body.assignedTo.type)
    ) {
      return apiError("Invalid assignedTo.type; expected 'user' or 'agent'")
    }

    const status = body.status ?? 'todo'
    const priority = body.priority ?? 'normal'
    const title = body.title.trim()
    const description = body.description?.trim() ?? ''
    const dueDate = body.dueDate ?? null
    const assignedTo = body.assignedTo ?? null

    const docRef = await adminDb.collection('tasks').add({
      orgId: body.orgId.trim(),
      title,
      description,
      status,
      priority,
      dueDate,
      assignedTo,
      projectId: body.projectId ?? null,
      contactId: body.contactId ?? null,
      dealId: body.dealId ?? null,
      tags: body.tags ?? [],
      ...actorFrom(user),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      completedAt: null,
      deleted: false,
    })

    // Notify assignee if provided.
    if (assignedTo) {
      await adminDb.collection('notifications').add({
        orgId: body.orgId.trim(),
        userId: assignedTo.type === 'user' ? assignedTo.id : null,
        agentId: assignedTo.type === 'agent' ? assignedTo.id : null,
        type: 'task.assigned',
        title: 'Task assigned to you',
        body: `"${title}" — due ${dueDate ?? 'no date'}`,
        link: `/admin/tasks/${docRef.id}`,
        status: 'unread',
        priority,
        createdAt: FieldValue.serverTimestamp(),
      })
    }

    return apiSuccess({ id: docRef.id }, 201)
  }),
)
