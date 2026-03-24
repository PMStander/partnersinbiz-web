/**
 * PUT    /api/v1/crm/deals/:id  — update deal
 * DELETE /api/v1/crm/deals/:id  — soft delete
 */
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'

type Params = { params: Promise<{ id: string }> }

export const PUT = withAuth('admin', async (req, _user, context) => {
  const { id } = await (context as Params).params
  const doc = await adminDb.collection('deals').doc(id).get()
  if (!doc.exists) return apiError('Deal not found', 404)
  const body = await req.json()
  await adminDb.collection('deals').doc(id).update({ ...body, updatedAt: FieldValue.serverTimestamp() })
  return apiSuccess({ id })
})

export const DELETE = withAuth('admin', async (_req, _user, context) => {
  const { id } = await (context as Params).params
  const doc = await adminDb.collection('deals').doc(id).get()
  if (!doc.exists) return apiError('Deal not found', 404)
  await adminDb.collection('deals').doc(id).update({ deleted: true, updatedAt: FieldValue.serverTimestamp() })
  return apiSuccess({ id })
})
