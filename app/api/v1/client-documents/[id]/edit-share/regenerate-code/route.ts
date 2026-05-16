import { NextRequest } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'

import { withAuth } from '@/lib/api/auth'
import { resolveOrgScope } from '@/lib/api/orgScope'
import { apiError, apiSuccess } from '@/lib/api/response'
import type { ApiUser } from '@/lib/api/types'
import { generateAccessCode } from '@/lib/client-documents/editShare'
import { adminDb } from '@/lib/firebase/admin'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

export const POST = withAuth('admin', async (req: NextRequest, user: ApiUser, ctx: RouteContext) => {
  const { id } = await ctx.params
  const docRef = adminDb.collection('client_documents').doc(id)
  const snap = await docRef.get()
  if (!snap.exists) return apiError('Document not found', 404)
  const doc = snap.data() as { orgId?: string; deleted?: boolean; editShareEnabled?: boolean } | undefined
  if (!doc || doc.deleted) return apiError('Document not found', 404)

  if (doc.orgId) {
    const scope = resolveOrgScope(user, doc.orgId)
    if (!scope.ok) return apiError(scope.error, scope.status)
  }

  if (!doc.editShareEnabled) return apiError('Edit share is not enabled', 400)

  const editAccessCode = generateAccessCode()
  await docRef.update({
    editAccessCode,
    editAccessCodeRotatedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: user.uid,
    updatedByType: user.role === 'ai' ? 'agent' : 'user',
  })

  return apiSuccess({ editAccessCode })
})
