/**
 * GET    /api/v1/projects/[projectId]/docs/[docId]  — get a single doc
 * PATCH  /api/v1/projects/[projectId]/docs/[docId]  — update a doc
 * DELETE /api/v1/projects/[projectId]/docs/[docId]  — delete a doc
 */
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ projectId: string; docId: string }> }

export const GET = withAuth('client', async (req: NextRequest, user, ctx) => {
  const { projectId, docId } = await (ctx as RouteContext).params
  const doc = await adminDb
    .collection('projects')
    .doc(projectId)
    .collection('docs')
    .doc(docId)
    .get()

  if (!doc.exists) return apiError('Document not found', 404)
  return apiSuccess({ id: doc.id, ...doc.data() })
})

export const PATCH = withAuth('client', async (req: NextRequest, user, ctx) => {
  const { projectId, docId } = await (ctx as RouteContext).params
  const body = await req.json().catch(() => ({}))

  const updates: Record<string, any> = { updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid }

  if (body.title !== undefined) {
    if (!body.title.trim()) return apiError('title cannot be empty', 400)
    updates.title = body.title.trim()
  }

  if (body.content !== undefined) {
    if (!body.content) return apiError('content cannot be empty', 400)
    updates.content = body.content
  }

  if (body.type !== undefined) {
    if (!['brief', 'requirements', 'notes', 'reference'].includes(body.type)) {
      return apiError('type must be one of: brief, requirements, notes, reference', 400)
    }
    updates.type = body.type
  }

  await adminDb
    .collection('projects')
    .doc(projectId)
    .collection('docs')
    .doc(docId)
    .update(updates)

  return apiSuccess({ id: docId, ...updates })
})

export const DELETE = withAuth('client', async (req: NextRequest, user, ctx) => {
  const { projectId, docId } = await (ctx as RouteContext).params
  await adminDb
    .collection('projects')
    .doc(projectId)
    .collection('docs')
    .doc(docId)
    .delete()

  return apiSuccess({ success: true })
})
