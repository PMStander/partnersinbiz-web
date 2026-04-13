import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { logActivity } from '@/lib/activity/log'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ projectId: string }> }

export const GET = withAuth('client', async (req: NextRequest, user, ctx) => {
  const { projectId } = await (ctx as RouteContext).params
  const snapshot = await adminDb
    .collection('projects')
    .doc(projectId)
    .collection('tasks')
    .orderBy('order', 'asc')
    .get()

  const tasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
  return apiSuccess(tasks)
})

export const POST = withAuth('client', async (req: NextRequest, user, ctx) => {
  const { projectId } = await (ctx as RouteContext).params
  const body = await req.json().catch(() => ({}))
  if (!body.title) return apiError('title is required', 400)

  const doc = {
    ...body,
    projectId,
    order: body.order ?? Date.now(),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }

  const ref = await adminDb
    .collection('projects')
    .doc(projectId)
    .collection('tasks')
    .add(doc)

  // Log activity event (fire and forget)
  const projectDoc = await adminDb.collection('projects').doc(projectId).get()
  const orgId = projectDoc.data()?.orgId
  if (orgId) {
    const actorName = user.uid === 'ai-agent'
      ? 'AI Agent'
      : (await adminDb.collection('users').doc(user.uid).get()).data()?.displayName ?? user.uid

    logActivity({
      orgId,
      type: 'task_created',
      actorId: user.uid,
      actorName,
      actorRole: user.role === 'ai' ? 'ai' : user.role === 'admin' ? 'admin' : 'client',
      description: `Created task: "${body.title}"`,
      entityId: ref.id,
      entityType: 'task',
      entityTitle: body.title,
    }).catch(() => {})
  }

  return apiSuccess({ id: ref.id }, 201)
})
