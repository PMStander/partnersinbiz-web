/**
 * GET   /api/v1/projects/[projectId]  — get a single project
 * PATCH /api/v1/projects/[projectId]  — update a project
 */
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ projectId: string }> }

const VALID_STATUSES = [
  'discovery',
  'design',
  'development',
  'review',
  'live',
  'maintenance',
] as const

type ProjectStatus = (typeof VALID_STATUSES)[number]

export const GET = withAuth('client', async (req: NextRequest, user, ctx) => {
  const { projectId } = await (ctx as RouteContext).params
  const doc = await adminDb.collection('projects').doc(projectId).get()

  if (!doc.exists) return apiError('Project not found', 404)
  return apiSuccess({ id: doc.id, ...doc.data() })
})

export const PATCH = withAuth('client', async (req: NextRequest, user, ctx) => {
  const { projectId } = await (ctx as RouteContext).params
  const body = await req.json().catch(() => ({}))

  const updates: Record<string, any> = { updatedAt: FieldValue.serverTimestamp() }

  if (body.name !== undefined) {
    if (!body.name.trim()) return apiError('name cannot be empty', 400)
    updates.name = body.name.trim()
  }

  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status as ProjectStatus)) {
      return apiError('Invalid status', 400)
    }
    updates.status = body.status
  }

  if (body.description !== undefined) {
    updates.description = body.description
  }

  if (body.brief !== undefined) {
    updates.brief = body.brief
  }

  await adminDb.collection('projects').doc(projectId).update(updates)
  return apiSuccess({ id: projectId, ...updates })
})
