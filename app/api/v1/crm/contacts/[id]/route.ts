/**
 * GET    /api/v1/crm/contacts/:id  — get one contact
 * PUT    /api/v1/crm/contacts/:id  — update contact
 * DELETE /api/v1/crm/contacts/:id  — soft delete (sets deleted: true)
 */
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'

type Params = { params: Promise<{ id: string }> }

export const GET = withAuth('admin', async (_req, _user, context) => {
  const { id } = await (context as Params).params
  const doc = await adminDb.collection('contacts').doc(id).get()
  if (!doc.exists) return apiError('Contact not found', 404)
  return apiSuccess({ id: doc.id, ...doc.data() })
})

export const PUT = withAuth('admin', async (req, _user, context) => {
  const { id } = await (context as Params).params
  const doc = await adminDb.collection('contacts').doc(id).get()
  if (!doc.exists) return apiError('Contact not found', 404)

  const body = await req.json()
  await adminDb.collection('contacts').doc(id).update({
    ...body,
    updatedAt: FieldValue.serverTimestamp(),
  })
  return apiSuccess({ id })
})

export const DELETE = withAuth('admin', async (_req, _user, context) => {
  const { id } = await (context as Params).params
  const doc = await adminDb.collection('contacts').doc(id).get()
  if (!doc.exists) return apiError('Contact not found', 404)

  await adminDb.collection('contacts').doc(id).update({
    deleted: true,
    updatedAt: FieldValue.serverTimestamp(),
  })
  return apiSuccess({ id })
})
