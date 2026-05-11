/**
 * GET  /api/v1/projects/[projectId]/docs  — list all docs for a project
 * POST /api/v1/projects/[projectId]/docs  — create a doc
 */
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { getProjectForUser } from '@/lib/projects/access'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ projectId: string }> }

export const GET = withAuth('client', async (req: NextRequest, user, ctx) => {
  const { projectId } = await (ctx as RouteContext).params
  const access = await getProjectForUser(projectId, user)
  if (!access.ok) return apiError(access.error, access.status)

  const snapshot = await adminDb
    .collection('projects')
    .doc(projectId)
    .collection('docs')
    .orderBy('createdAt', 'desc')
    .get()

  const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
  return apiSuccess(docs)
})

export const POST = withAuth('client', async (req: NextRequest, user, ctx) => {
  const { projectId } = await (ctx as RouteContext).params
  const body = await req.json().catch(() => ({}))
  const access = await getProjectForUser(projectId, user)
  if (!access.ok) return apiError(access.error, access.status)

  if (!body.title?.trim()) return apiError('title is required', 400)
  if (!body.content) return apiError('content is required', 400)
  if (!['brief', 'requirements', 'notes', 'reference'].includes(body.type)) {
    return apiError('type must be one of: brief, requirements, notes, reference', 400)
  }

  const doc = {
    title: body.title.trim(),
    content: body.content,
    type: body.type,
    createdBy: user.uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }

  const ref = await adminDb
    .collection('projects')
    .doc(projectId)
    .collection('docs')
    .add(doc)

  return apiSuccess({ id: ref.id, ...doc }, 201)
})
