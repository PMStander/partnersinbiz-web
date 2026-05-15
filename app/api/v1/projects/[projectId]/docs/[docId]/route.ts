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
import { documentLinksTo } from '@/lib/client-documents/links'
import { CLIENT_DOCUMENTS_COLLECTION } from '@/lib/client-documents/store'
import type { ClientDocument } from '@/lib/client-documents/types'
import { getProjectForUser } from '@/lib/projects/access'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ projectId: string; docId: string }> }

export const GET = withAuth('client', async (req: NextRequest, user, ctx) => {
  const { projectId, docId } = await (ctx as RouteContext).params
  const access = await getProjectForUser(projectId, user)
  if (!access.ok) return apiError(access.error, access.status)

  const doc = await adminDb
    .collection('projects')
    .doc(projectId)
    .collection('docs')
    .doc(docId)
    .get()

  if (doc.exists) return apiSuccess({ id: doc.id, source: 'legacy_project_docs', ...doc.data() })

  const clientDocument = await adminDb.collection(CLIENT_DOCUMENTS_COLLECTION).doc(docId).get()
  if (!clientDocument.exists || clientDocument.data()?.deleted === true) return apiError('Document not found', 404)

  const data = clientDocument.data() as ClientDocument
  if (!documentLinksTo('projectId', projectId, data)) return apiError('Document not found', 404)

  return apiSuccess({ id: clientDocument.id, source: 'client_documents', ...data })
})

export const PATCH = withAuth('client', async (req: NextRequest, user, ctx) => {
  const { projectId, docId } = await (ctx as RouteContext).params
  const body = await req.json().catch(() => ({}))
  const access = await getProjectForUser(projectId, user)
  if (!access.ok) return apiError(access.error, access.status)

  const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid }

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
  const access = await getProjectForUser(projectId, user)
  if (!access.ok) return apiError(access.error, access.status)
  await adminDb
    .collection('projects')
    .doc(projectId)
    .collection('docs')
    .doc(docId)
    .delete()

  return apiSuccess({ success: true })
})
