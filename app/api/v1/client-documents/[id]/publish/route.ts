import { NextRequest } from 'next/server'

import { withAuth } from '@/lib/api/auth'
import { resolveOrgScope } from '@/lib/api/orgScope'
import { apiError, apiSuccess } from '@/lib/api/response'
import type { ApiUser } from '@/lib/api/types'
import { getClientDocument, publishClientDocument } from '@/lib/client-documents/store'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

export const POST = withAuth('admin', async (_req: NextRequest, user: ApiUser, ctx: RouteContext) => {
  const { id } = await ctx.params
  const document = await getClientDocument(id)

  if (!document) {
    return apiError('Document not found', 404)
  }

  if (!document.orgId) {
    if (user.role === 'client') {
      return apiError('Forbidden', 403)
    }
  } else {
    const scope = resolveOrgScope(user, document.orgId)
    if (!scope.ok) return apiError(scope.error, scope.status)
  }

  try {
    return apiSuccess(await publishClientDocument(id, user, document.orgId ?? null))
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Unable to publish document', 400)
  }
})
