/**
 * GET    /api/v1/sms/:id — fetch a single SMS doc
 * DELETE /api/v1/sms/:id — soft-delete (sets deleted: true)
 *
 * Auth: client (admin/ai satisfy). Clients can only access SMS rows
 * belonging to their org.
 */
import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { resolveOrgScope } from '@/lib/api/orgScope'
import { apiSuccess, apiError } from '@/lib/api/response'
import type { Sms } from '@/lib/sms/types'

type Params = { params: Promise<{ id: string }> }

export const GET = withAuth('client', async (_req: NextRequest, user, context) => {
  const { id } = await (context as Params).params
  const doc = await adminDb.collection('sms').doc(id).get()
  if (!doc.exists) return apiError('SMS not found', 404)
  const data = doc.data() ?? {}
  const scope = resolveOrgScope(user, (data.orgId as string | undefined) ?? null)
  if (!scope.ok) return apiError(scope.error, scope.status)
  if ((data as { deleted?: boolean }).deleted === true) {
    return apiError('SMS not found', 404)
  }
  return apiSuccess({ id: doc.id, ...data } as Sms)
})

export const DELETE = withAuth('client', async (_req: NextRequest, user, context) => {
  const { id } = await (context as Params).params
  const doc = await adminDb.collection('sms').doc(id).get()
  if (!doc.exists) return apiError('SMS not found', 404)
  const scope = resolveOrgScope(user, (doc.data()?.orgId as string | undefined) ?? null)
  if (!scope.ok) return apiError(scope.error, scope.status)

  await adminDb.collection('sms').doc(id).update({
    deleted: true,
    updatedAt: FieldValue.serverTimestamp(),
  })
  return apiSuccess({ id })
})
