import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ projectId: string; taskId: string }> }

export const PATCH = withAuth('client', async (req: NextRequest, user, ctx) => {
  const { projectId, taskId } = await (ctx as RouteContext).params
  const body = await req.json().catch(() => ({}))

  const ref = adminDb.collection('projects').doc(projectId).collection('tasks').doc(taskId)
  const doc = await ref.get()
  if (!doc.exists) return apiError('Task not found', 404)

  // Validate attachments if provided
  if (body.attachments !== undefined) {
    if (!Array.isArray(body.attachments)) {
      return apiError('Attachments must be an array', 400)
    }
    // Validate each attachment has required fields
    for (const att of body.attachments) {
      if (typeof att !== 'object' || !att.url || !att.name) {
        return apiError('Each attachment must have at least url and name fields', 400)
      }
    }
  }

  await ref.update({ ...body, updatedAt: FieldValue.serverTimestamp() })
  return apiSuccess({ id: taskId })
})

export const DELETE = withAuth('client', async (req: NextRequest, user, ctx) => {
  const { projectId, taskId } = await (ctx as RouteContext).params
  await adminDb.collection('projects').doc(projectId).collection('tasks').doc(taskId).delete()
  return apiSuccess({ deleted: true })
})
