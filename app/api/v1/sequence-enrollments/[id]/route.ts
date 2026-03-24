// app/api/v1/sequence-enrollments/[id]/route.ts
import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/auth/middleware'
import { apiSuccess, apiError } from '@/lib/api/response'
import { FieldValue } from 'firebase-admin/firestore'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export const DELETE = withAuth('admin', async (req: NextRequest, context?: unknown) => {
  const { id } = await (context as Params).params
  const snap = await adminDb.collection('sequence_enrollments').doc(id).get()
  if (!snap.exists || snap.data()?.deleted) return apiError('Not found', 404)
  await adminDb.collection('sequence_enrollments').doc(id).update({
    status: 'exited',
    exitReason: 'manual',
    deleted: true,
    updatedAt: FieldValue.serverTimestamp(),
  })
  return apiSuccess({ id })
})
