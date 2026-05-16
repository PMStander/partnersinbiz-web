import { NextRequest } from 'next/server'

import { withAuth } from '@/lib/api/auth'
import { resolveOrgScope } from '@/lib/api/orgScope'
import { apiError, apiSuccess } from '@/lib/api/response'
import type { ApiUser } from '@/lib/api/types'
import { adminDb } from '@/lib/firebase/admin'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

export const GET = withAuth('admin', async (req: NextRequest, user: ApiUser, ctx: RouteContext) => {
  const { id } = await ctx.params

  const limitParam = req.nextUrl.searchParams.get('limit')
  const parsed = limitParam ? parseInt(limitParam, 10) : 20
  const limit = Math.max(1, Math.min(Number.isFinite(parsed) ? parsed : 20, 100))

  const docRef = adminDb.collection('client_documents').doc(id)
  const snap = await docRef.get()
  if (!snap.exists) return apiError('Document not found', 404)
  const doc = snap.data() as { orgId?: string; deleted?: boolean } | undefined
  if (!doc || doc.deleted) return apiError('Document not found', 404)

  if (doc.orgId) {
    const scope = resolveOrgScope(user, doc.orgId)
    if (!scope.ok) return apiError(scope.error, scope.status)
  }

  const logSnap = await docRef
    .collection('access_log')
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get()

  const entries = logSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
  return apiSuccess({ entries })
})
