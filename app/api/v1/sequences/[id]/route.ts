// app/api/v1/sequences/[id]/route.ts
import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'
import { FieldValue } from 'firebase-admin/firestore'
import type { ApiUser } from '@/lib/api/types'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export const GET = withAuth('admin', async (req: NextRequest, _user: ApiUser, context?: unknown) => {
  const { id } = await (context as Params).params
  const snap = await adminDb.collection('sequences').doc(id).get()
  if (!snap.exists || snap.data()?.deleted) return apiError('Not found', 404)
  return apiSuccess({ id: snap.id, ...snap.data() })
})

export const PUT = withAuth('admin', async (req: NextRequest, _user: ApiUser, context?: unknown) => {
  const { id } = await (context as Params).params
  const snap = await adminDb.collection('sequences').doc(id).get()
  if (!snap.exists || snap.data()?.deleted) return apiError('Not found', 404)
  const body = await req.json().catch(() => ({}))
  await adminDb.collection('sequences').doc(id).update({ ...body, updatedAt: FieldValue.serverTimestamp() })
  return apiSuccess({ id, ...body })
})

export const DELETE = withAuth('admin', async (req: NextRequest, _user: ApiUser, context?: unknown) => {
  const { id } = await (context as Params).params
  const snap = await adminDb.collection('sequences').doc(id).get()
  if (!snap.exists || snap.data()?.deleted) return apiError('Not found', 404)
  await adminDb.collection('sequences').doc(id).update({ deleted: true, updatedAt: FieldValue.serverTimestamp() })
  return apiSuccess({ id })
})
