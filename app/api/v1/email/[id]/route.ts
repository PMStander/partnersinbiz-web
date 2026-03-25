/**
 * PUT    /api/v1/email/:id — update draft or scheduled email
 * DELETE /api/v1/email/:id — soft-delete (sets deleted: true)
 *
 * Auth: admin or ai
 */
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'

type Params = { params: Promise<{ id: string }> }

export const PUT = withAuth('admin', async (req: NextRequest, _user, context) => {
  const { id } = await (context as Params).params
  const doc = await adminDb.collection('emails').doc(id).get()
  if (!doc.exists) return apiError('Email not found', 404)

  const body = await req.json()
  await adminDb.collection('emails').doc(id).update({
    ...body,
    updatedAt: FieldValue.serverTimestamp(),
  })
  return apiSuccess({ id })
})

export const DELETE = withAuth('admin', async (_req: NextRequest, _user, context) => {
  const { id } = await (context as Params).params
  const doc = await adminDb.collection('emails').doc(id).get()
  if (!doc.exists) return apiError('Email not found', 404)

  await adminDb.collection('emails').doc(id).update({
    deleted: true,
    updatedAt: FieldValue.serverTimestamp(),
  })
  return apiSuccess({ id })
})
