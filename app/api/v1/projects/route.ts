/**
 * GET  /api/v1/projects  — list all projects (admin only)
 * POST /api/v1/projects  — create a new project (admin only)
 */
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import type * as FirebaseFirestore from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import type { ApiUser } from '@/lib/api/types'

const VALID_STATUSES = [
  'discovery',
  'design',
  'development',
  'review',
  'live',
  'maintenance',
] as const

type ProjectStatus = (typeof VALID_STATUSES)[number]

type ProjectListItem = {
  id: string
  createdAt?: unknown
  [key: string]: unknown
}

function createdAtMillis(value: unknown): number {
  if (!value) return 0
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? 0 : parsed
  }
  if (typeof value === 'object') {
    const timestamp = value as {
      toMillis?: () => number
      seconds?: number
      _seconds?: number
    }
    if (typeof timestamp.toMillis === 'function') return timestamp.toMillis()
    const seconds = timestamp.seconds ?? timestamp._seconds
    if (typeof seconds === 'number') return seconds * 1000
  }
  return 0
}

export const GET = withAuth('admin', async (req: NextRequest) => {
  const { searchParams } = new URL(req.url)
  const orgSlug = searchParams.get('orgSlug')

  let query: FirebaseFirestore.Query = adminDb.collection('projects')

  // If orgSlug is provided, look up org by slug and filter by orgId
  if (orgSlug) {
    const orgSnapshot = await adminDb
      .collection('organizations')
      .where('slug', '==', orgSlug)
      .limit(1)
      .get()

    if (orgSnapshot.empty) {
      return apiSuccess([])
    }

    const orgId = orgSnapshot.docs[0].id
    query = query.where('orgId', '==', orgId)
  }

  const snapshot = await query.get()

  const projects: ProjectListItem[] = snapshot.docs
    .map((doc): ProjectListItem => ({ id: doc.id, ...doc.data() }))
    .sort((a, b) => createdAtMillis(b.createdAt) - createdAtMillis(a.createdAt))

  return apiSuccess(projects)
})

export const POST = withAuth('admin', async (req: NextRequest, user: ApiUser) => {
  const body = await req.json()

  if (!body.name?.trim()) return apiError('Name is required')
  if (body.status && !VALID_STATUSES.includes(body.status as ProjectStatus)) {
    return apiError('Invalid status')
  }

  let orgId = body.orgId?.trim() ?? ''

  // If orgSlug is provided, look up the org by slug and get its ID
  if (!orgId && body.orgSlug?.trim()) {
    const orgSnapshot = await adminDb
      .collection('organizations')
      .where('slug', '==', body.orgSlug.trim())
      .limit(1)
      .get()

    if (!orgSnapshot.empty) {
      orgId = orgSnapshot.docs[0].id
    } else {
      return apiError('Organization not found', 404)
    }
  }

  const clientId = body.clientId?.trim() || orgId

  const docRef = await adminDb.collection('projects').add({
    name: body.name.trim(),
    orgId,
    clientId,
    clientOrgId: body.clientOrgId?.trim() || clientId || null,
    description: body.description?.trim() ?? '',
    brief: body.brief?.trim() ?? '',
    status: (body.status as ProjectStatus) ?? 'discovery',
    startDate: FieldValue.serverTimestamp(),
    targetDate: body.targetDate ?? null,
    createdBy: user.uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })

  return apiSuccess({ id: docRef.id }, 201)
})
