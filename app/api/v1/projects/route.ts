/**
 * GET  /api/v1/projects  — list all projects (admin only)
 * POST /api/v1/projects  — create a new project (admin only)
 */
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'

const VALID_STATUSES = [
  'discovery',
  'design',
  'development',
  'review',
  'live',
  'maintenance',
] as const

type ProjectStatus = (typeof VALID_STATUSES)[number]

export const GET = withAuth('admin', async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const snapshot = await adminDb
    .collection('projects')
    .orderBy('createdAt', 'desc')
    .get()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const projects = snapshot.docs.map((doc: any) => ({
    id: doc.id,
    ...doc.data(),
  }))

  return apiSuccess(projects)
})

export const POST = withAuth('admin', async (req: NextRequest) => {
  const body = await req.json()

  if (!body.name?.trim()) return apiError('Name is required')
  if (body.status && !VALID_STATUSES.includes(body.status as ProjectStatus)) {
    return apiError('Invalid status')
  }

  const docRef = await adminDb.collection('projects').add({
    name: body.name.trim(),
    clientId: body.clientId?.trim() ?? '',
    description: body.description?.trim() ?? '',
    status: (body.status as ProjectStatus) ?? 'discovery',
    startDate: FieldValue.serverTimestamp(),
    targetDate: body.targetDate ?? null,
    createdAt: FieldValue.serverTimestamp(),
  })

  return apiSuccess({ id: docRef.id }, 201)
})
